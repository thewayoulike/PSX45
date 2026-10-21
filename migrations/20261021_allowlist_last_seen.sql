begin;
-- Last time a verified account opened the app (written by the access check, at most every 15 minutes).
alter table public.allowlist add column if not exists last_seen_at timestamptz;
commit;
