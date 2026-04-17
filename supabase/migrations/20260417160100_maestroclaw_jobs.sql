-- MaestroClaw v1: Job queue table.
-- Jobs are created in Maestro (web or automated), claimed and run by MaestroClaw.

create table if not exists executor_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  executor_id uuid references executors(id),
  requested_by uuid not null references auth.users(id),

  -- Job definition
  job_type text not null default 'code_task',
  adapter text not null default 'shell_stub',
  prompt text not null,

  -- Repo context (optional)
  repo_url text,
  repo_name text,
  branch text,

  -- Safety constraints
  allowed_paths text[] default '{}',
  timeout_seconds int not null default 300,

  -- Approval gate
  approval_required boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),

  -- Lifecycle
  status text not null default 'queued',

  -- Results
  result_summary text,
  error_text text,
  artifact_manifest jsonb,

  -- Build v2 bridge
  build_task_id uuid references build_tasks(id),

  -- Metadata
  failure_reason text,
  skip_reason text,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table executor_jobs add constraint executor_jobs_status_check
  check (status in ('queued', 'approved', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'expired'));

alter table executor_jobs add constraint executor_jobs_type_check
  check (job_type in ('code_task', 'build_task', 'review_task'));

-- RLS: owner can CRUD their own jobs
alter table executor_jobs enable row level security;

create policy "Users manage own executor jobs"
  on executor_jobs for all using (requested_by = auth.uid());

-- Indexes
create index if not exists idx_executor_jobs_status
  on executor_jobs(status);
create index if not exists idx_executor_jobs_executor
  on executor_jobs(executor_id);
create index if not exists idx_executor_jobs_session
  on executor_jobs(session_id);
create index if not exists idx_executor_jobs_build_task
  on executor_jobs(build_task_id);
