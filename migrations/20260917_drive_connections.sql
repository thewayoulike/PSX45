begin;
-- Connection credentials only. Portfolio files remain in the user's Google Drive.
create table if not exists public.drive_connections (
  email text primary key,
  google_sub text not null,
  connection_id uuid not null,
  refresh_ciphertext text not null,
  auth_user_id uuid,
  linked_session_id text,
  linked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.drive_connections enable row level security;
revoke all on public.drive_connections from public, anon, authenticated;
grant select, insert, update, delete on public.drive_connections to service_role;
commit;
