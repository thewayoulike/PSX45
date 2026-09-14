-- Apply before the API deployment. Leaves legacy data intact. Service-role RPC only.
begin;
alter table public.alert_store enable row level security;
revoke all on public.alert_store from anon, authenticated;
grant select, insert, update, delete on public.alert_store to service_role;
create or replace function public.psx_mutate_alerts(
  p_sid text, p_owner text, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  rec jsonb;
  items jsonb;
  item jsonb;
  owner_key text := lower(trim(coalesce(p_owner, '')));
  combined jsonb;
  claimed jsonb;
begin
  -- Short transaction lock serializes quota checks across devices as well as writes.
  -- No network or push work is performed while holding this lock.
  perform pg_advisory_xact_lock(20260914, 45);
  select record into rec from public.alert_store where sid = p_sid for update;
  if rec is not null and (owner_key = '' or
      lower(trim(coalesce(rec->>'userEmail', ''))) <> owner_key) then
    return jsonb_build_object('error', 'This subscription belongs to another account or requires owner migration.', 'status', 403);
  end if;
  if owner_key = '' then
    return jsonb_build_object('error', 'Account required.', 'status', 403);
  end if;
  items := coalesce(rec->'alerts', '[]'::jsonb);
  if p_action = 'read' then
    return jsonb_build_object('alerts', items);
  elsif p_action = 'append' then
    if jsonb_typeof(p_payload->'alerts') is distinct from 'array' then
      return jsonb_build_object('error', 'Alerts required.', 'status', 400);
    end if;
    if jsonb_array_length(p_payload->'alerts') = 0 or
       coalesce((p_payload->'quotas'->>'alertsTickers')::integer, 0) <= 0 or
       coalesce((p_payload->'quotas'->>'alertsTp')::integer, 0) <= 0 or
       coalesce((p_payload->'quotas'->>'alertsSl')::integer, 0) <= 0 then
      return jsonb_build_object('error', 'Valid alerts and quotas required.', 'status', 400);
    end if;
    select coalesce(jsonb_agg(a), '[]'::jsonb) into combined
      from public.alert_store s cross join lateral jsonb_array_elements(s.record->'alerts') a
      where lower(trim(s.record->>'userEmail')) = owner_key;
    combined := combined || (p_payload->'alerts');
    if (select count(distinct a->>'ticker') from jsonb_array_elements(combined) a)
        > (p_payload->'quotas'->>'alertsTickers')::integer or exists (
      select 1 from jsonb_array_elements(combined) a
      group by a->>'ticker', a->>'direction'
      having count(*) > case when a->>'direction' = 'ABOVE'
        then (p_payload->'quotas'->>'alertsTp')::integer
        else (p_payload->'quotas'->>'alertsSl')::integer end
    ) then
      return jsonb_build_object('error', 'Account alert limit reached across your devices. Remove an alert or upgrade.', 'status', 403);
    end if;
    rec := coalesce(rec, '{}'::jsonb) || jsonb_build_object(
      'userEmail', owner_key, 'subscription', p_payload->'subscription',
      'alerts', items || (p_payload->'alerts'));
  elsif p_action = 'remove' then
    select coalesce(jsonb_agg(a), '[]'::jsonb) into items from jsonb_array_elements(items) a
      where a->>'id' <> p_payload->>'id';
    if rec is null then return '{}'::jsonb; end if;
    rec := jsonb_set(rec, '{alerts}', items);
  elsif p_action = 'claim' then
    select a into item from jsonb_array_elements(items) a where a->>'id' = p_payload->>'id';
    if item is null or item ? 'delivery' then return '{}'::jsonb; end if;
    claimed := item || jsonb_build_object('delivery', jsonb_build_object(
      'token', p_payload->>'token', 'status', 'unconfirmed', 'claimedAt', now()));
    select jsonb_agg(case when a->>'id' = p_payload->>'id' then claimed else a end)
      into items from jsonb_array_elements(items) a;
    rec := jsonb_set(rec, '{alerts}', items);
  elsif p_action = 'finish' then
    select a into item from jsonb_array_elements(items) a where a->>'id' = p_payload->>'id';
    if item is null or item->'delivery'->>'token' is distinct from p_payload->>'token' then return '{}'::jsonb; end if;
    if p_payload->>'outcome' = 'retry' then
      select jsonb_agg(case when a->>'id' = p_payload->>'id' then a - 'delivery' else a end)
        into items from jsonb_array_elements(items) a;
    elsif p_payload->>'outcome' = 'sent' then
      select coalesce(jsonb_agg(a), '[]'::jsonb) into items from jsonb_array_elements(items) a
        where a->>'id' <> p_payload->>'id';
    else
      return '{}'::jsonb; -- Ambiguous send/crash: retain claim, never blindly resend.
    end if;
    rec := jsonb_set(rec, '{alerts}', items);
  else
    return jsonb_build_object('error', 'Unknown alert operation.', 'status', 400);
  end if;
  -- Preserve ownership even for empty records on shared browsers.
  insert into public.alert_store(sid, record, updated_at) values(p_sid, rec, now())
    on conflict(sid) do update set record = excluded.record, updated_at = excluded.updated_at;
  if p_action = 'claim' then
    return jsonb_build_object('alert', claimed, 'subscription', rec->'subscription');
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.psx_mutate_alerts(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.psx_mutate_alerts(text,text,text,jsonb) to service_role;
commit;
