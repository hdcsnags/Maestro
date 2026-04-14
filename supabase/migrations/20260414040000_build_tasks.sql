-- Build v2: Task-queued execution table.
-- Each row is one file to generate. The execution hook dispatches one
-- orchestrate call per task instead of one giant lane-sized response.

create table if not exists build_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) not null,
  build_round_id uuid references rounds(id),
  task_id text not null,
  file_path text not null,
  lane_owner uuid references agents(id),
  fallback_owner uuid references agents(id),
  dependencies text[] default '{}',
  status text not null default 'queued',
  retry_count int default 0,
  max_retries int default 2,
  prompt_slice text,

  -- Failure / reroute metadata
  skip_reason text,
  failure_reason text,
  provider_error text,
  rerouted_from uuid references agents(id),

  -- Result (populated on completion)
  result_content text,
  result_operation text check (result_operation in ('create', 'update', 'delete')),
  result_builder uuid references agents(id),
  completed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Status constraint
alter table build_tasks
  add constraint build_tasks_status_check
  check (status in ('queued', 'dispatched', 'waiting', 'completed', 'failed', 'rerouted', 'skipped'));

-- RLS
alter table build_tasks enable row level security;

create policy "Users manage build tasks in own workspace sessions"
  on build_tasks for all using (
    session_id in (
      select s.id from sessions s
      join workspaces w on s.workspace_id = w.id
      where w.user_id = auth.uid()
    )
  );

-- Indexes
create index if not exists idx_build_tasks_session_status
  on build_tasks(session_id, status);
create index if not exists idx_build_tasks_session_id
  on build_tasks(session_id);
