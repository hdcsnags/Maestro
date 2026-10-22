-- Executor grants (2026-10-22): let an executor's owner share their local MaestroClaw
-- (and therefore their signed-in CLI subscriptions) with another Maestro account.
-- A grantee's jobs of the allowed job types are served by the executor; the grantee
-- can see the executor as online. Owner creates/revokes grants through executor-api
-- (?action=share / ?action=unshare) which resolves the grantee by email.

create table if not exists executor_grants (
  id uuid primary key default gen_random_uuid(),
  executor_id uuid not null references executors(id) on delete cascade,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete cascade,
  job_types text[] not null default array['concierge_turn','council_seat','code_task'],
  label text default '',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (executor_id, grantee_user_id)
);

alter table executor_grants enable row level security;

-- Helper predicates run as SECURITY DEFINER so the two tables' policies never re-enter each
-- other (a policy on executors that reads executor_grants whose policy reads executors is
-- "infinite recursion detected in policy" — found on the local stack 2026-10-22).
create or replace function public.owns_executor(p_executor_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from executors e where e.id = p_executor_id and e.owner_user_id = auth.uid());
$$;
create or replace function public.executor_shared_with_me(p_executor_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from executor_grants g where g.executor_id = p_executor_id and g.grantee_user_id = auth.uid() and g.revoked_at is null);
$$;
revoke all on function public.owns_executor(uuid) from public;
revoke all on function public.executor_shared_with_me(uuid) from public;
grant execute on function public.owns_executor(uuid) to authenticated, service_role;
grant execute on function public.executor_shared_with_me(uuid) to authenticated, service_role;

-- Owner of the executor manages its grants; grantee can read their own grants.
create policy "Owner manages grants"
  on executor_grants for all
  using (public.owns_executor(executor_id))
  with check (public.owns_executor(executor_id));

create policy "Grantee reads own grants"
  on executor_grants for select
  using (grantee_user_id = auth.uid());

create index if not exists idx_executor_grants_grantee on executor_grants(grantee_user_id) where revoked_at is null;
create index if not exists idx_executor_grants_executor on executor_grants(executor_id) where revoked_at is null;

-- Email → user id for sharing. SECURITY DEFINER so a signed-in owner can resolve a grantee
-- by email without the edge function touching the admin auth API. Returns only the id
-- (or null); callable by authenticated users only.
create or replace function public.lookup_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.lookup_user_id_by_email(text) from public;
grant execute on function public.lookup_user_id_by_email(text) to authenticated, service_role;

-- Grantees may SELECT the executors shared with them (status/heartbeat/capabilities),
-- never update or delete them. The existing "Users manage own executors" policy stays.
create policy "Grantees see shared executors"
  on executors for select
  using (public.executor_shared_with_me(id));
