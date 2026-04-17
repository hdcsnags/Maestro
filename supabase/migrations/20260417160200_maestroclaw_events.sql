-- MaestroClaw v1: Append-only audit trail for executor jobs.
-- Every status change, heartbeat, log line, artifact is an event.

create table if not exists executor_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references executor_jobs(id),
  event_type text not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

alter table executor_job_events add constraint executor_job_events_type_check
  check (event_type in ('claimed', 'heartbeat', 'stdout', 'stderr', 'artifact', 'status_change', 'error', 'completed'));

-- RLS: readable by the job owner
alter table executor_job_events enable row level security;

create policy "Users read own job events"
  on executor_job_events for all using (
    exists (select 1 from executor_jobs where id = job_id and requested_by = auth.uid())
  );

-- Indexes
create index if not exists idx_executor_job_events_job
  on executor_job_events(job_id);
create index if not exists idx_executor_job_events_type
  on executor_job_events(job_id, event_type);
