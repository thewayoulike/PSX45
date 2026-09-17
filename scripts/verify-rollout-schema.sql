-- Read-only production verification. Reports schema/permissions, no account data.
select 'function:' || p.proname as check_name,
  json_build_object(
    'server_execute',has_function_privilege('service_role',p.oid,'EXECUTE'),
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'user_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'body_hash',md5(regexp_replace(regexp_replace(p.prosrc,'--[^\r\n]*','','g'),'\s+','','g'))
  )::text as result
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('psx_mutate_alerts','psx_rate_limit','psx_consume_approval','psx_cloud_head')
union all
select 'table:' || c.relname,
  json_build_object(
    'rls',c.relrowsecurity,
    'anon_data_access',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),
    'user_data_access',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'),
    'size',pg_size_pretty(pg_total_relation_size(c.oid))
  )::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('alert_store','allowlist','approval_tokens','request_limits','cloud_heads')
union all
select 'database_total',pg_size_pretty(pg_database_size(current_database()))
order by check_name;
