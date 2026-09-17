-- Apply before deploying the rollout fixes. No portfolio contents are stored here.
begin;
create table if not exists public.approval_tokens (
  token_hash text primary key, email text not null,
  expires_at timestamptz not null, used_at timestamptz
);
create index if not exists approval_tokens_expiry on public.approval_tokens(expires_at);
create table if not exists public.request_limits (
  key text primary key, expires_at timestamptz not null, hits integer not null
);
create index if not exists request_limits_expiry on public.request_limits(expires_at);
create table if not exists public.cloud_heads (
  email text primary key, revision bigint not null default 0,
  file_id text, history text[] not null default '{}', updated_at timestamptz not null default now()
);
alter table public.approval_tokens enable row level security;
alter table public.request_limits enable row level security;
alter table public.cloud_heads enable row level security;
alter table public.allowlist enable row level security;
revoke all on public.approval_tokens, public.request_limits, public.cloud_heads, public.allowlist from anon, authenticated;
grant all on public.approval_tokens, public.request_limits, public.cloud_heads, public.allowlist to service_role;

create or replace function public.psx_rate_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if length(p_key) <> 64 or p_max < 1 or p_max > 1000 or p_seconds < 1 or p_seconds > 86400 then raise exception 'Invalid limit'; end if;
  -- Temporary records must not accumulate on the free database plan.
  -- Indexed expiry cleanup runs with traffic, so no paid scheduler is needed.
  delete from request_limits where expires_at <= now();
  delete from approval_tokens where expires_at <= now();
  insert into request_limits as r values (p_key, now() + make_interval(secs => p_seconds), 1)
  on conflict (key) do update set
    hits = case when r.expires_at <= now() then 1 else least(r.hits + 1, p_max + 1) end,
    expires_at = case when r.expires_at <= now() then now() + make_interval(secs => p_seconds) else r.expires_at end
  returning hits into n;
  return n <= p_max;
end $$;

create or replace function public.psx_consume_approval(p_hash text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare target text;
begin
  update approval_tokens set used_at = now()
    where token_hash = p_hash and used_at is null and expires_at > now() returning email into target;
  if target is null then return null; end if;
  update allowlist set approved = true, approved_at = coalesce(approved_at, now()) where email = target;
  if not found then raise exception 'Account request no longer exists'; end if;
  update approval_tokens set used_at = now() where email = target and used_at is null;
  return target;
end $$;

create or replace function public.psx_cloud_head(p_email text, p_expected bigint default null, p_file text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h cloud_heads%rowtype; old_files text[] := '{}';
begin
  insert into cloud_heads(email) values (p_email) on conflict do nothing;
  select * into h from cloud_heads where email = p_email for update;
  if p_expected is not null then
    -- Idempotent retry after a lost commit response.
    if h.revision = p_expected + 1 and h.file_id = p_file then
      return jsonb_build_object('revision',h.revision,'fileId',h.file_id,'cleanupIds','[]'::jsonb);
    end if;
    if h.revision <> p_expected then return jsonb_build_object('conflict',true,'revision',h.revision,'fileId',h.file_id); end if;
    if p_file is null or p_file !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'Invalid file ID'; end if;
    h.history := array_prepend(p_file, h.history);
    old_files := h.history[21:array_length(h.history,1)];
    update cloud_heads set revision = revision + 1, file_id = p_file,
      history = h.history[1:20], updated_at = now() where email = p_email returning * into h;
  end if;
  return jsonb_build_object('revision',h.revision,'fileId',h.file_id,'cleanupIds',to_jsonb(coalesce(old_files,'{}')));
end $$;
revoke all on function public.psx_rate_limit(text,integer,integer), public.psx_consume_approval(text), public.psx_cloud_head(text,bigint,text) from public, anon, authenticated;
grant execute on function public.psx_rate_limit(text,integer,integer), public.psx_consume_approval(text), public.psx_cloud_head(text,bigint,text) to service_role;
commit;
