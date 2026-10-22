begin;
-- When the account first reached the app; rows from before this column stay null and are never reminded.
alter table public.allowlist add column if not exists registered_at timestamptz;

-- One row per person and reminder kind, so nobody receives more than three of each.
create table if not exists public.signup_reminders (
  email text not null,
  kind text not null check (kind in ('never_signed_in', 'never_returned')),
  sent_count integer not null default 0,
  last_sent_at timestamptz not null,
  primary key (email, kind)
);
alter table public.signup_reminders enable row level security;
revoke all on public.signup_reminders from anon, authenticated;
grant all on public.signup_reminders to service_role;
commit;
