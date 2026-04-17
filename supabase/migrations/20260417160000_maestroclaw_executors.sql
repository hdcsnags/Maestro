-- MaestroClaw v1: Executor registration table.
-- Each row is a registered local execution node belonging to one user.

create table if not exists executors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  name text not null,
  kind text not null default 'personal_node',
  status text not null default 'offline',
  last_seen_at timestamptz,
  capabilities jsonb default '{}',
  token_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table executors add constraint executors_status_check
  check (status in ('offline', 'online', 'busy', 'error'));

alter table executors add constraint executors_kind_check
  check (kind in ('personal_node', 'shared_node', 'cloud_runner'));

-- RLS: owner can CRUD their own executors only
alter table executors enable row level security;

create policy "Users manage own executors"
  on executors for all using (owner_user_id = auth.uid());

create index if not exists idx_executors_owner
  on executors(owner_user_id);
