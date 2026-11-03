begin;
-- PSX Tracker connector links for Claude, ChatGPT and Cursor. Only a SHA-256 hash of each
-- secret link is stored; portfolio files remain in the user's Google Drive.
create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  label text not null default 'AI assistant',
  token_hash text not null unique,
  token_hint text not null,
  share_portfolio boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists mcp_connections_email on public.mcp_connections(email) where revoked_at is null;
alter table public.mcp_connections enable row level security;
revoke all on public.mcp_connections from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_connections to service_role;
commit;
