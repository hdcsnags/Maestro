-- MaestroClaw routing/recovery: capability-aware workers reclaim stale jobs.

alter table executor_jobs
  add column if not exists claimed_at timestamptz;

alter table executor_jobs
  add column if not exists lease_expires_at timestamptz;

update executor_jobs
set
  claimed_at = coalesce(claimed_at, updated_at),
  lease_expires_at = coalesce(lease_expires_at, updated_at + interval '90 seconds')
where status in ('claimed', 'running');

create index if not exists idx_executor_jobs_status_lease
  on executor_jobs(status, lease_expires_at);
