begin;
-- Set after the owner registration email is accepted, so a failed send is tried again.
alter table public.allowlist add column if not exists owner_notified_at timestamptz;
commit;
