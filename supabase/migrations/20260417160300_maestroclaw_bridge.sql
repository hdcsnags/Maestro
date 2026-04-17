-- MaestroClaw v1: Bridge columns on build_tasks for local execution routing.

alter table build_tasks
  add column if not exists executor_id uuid references executors(id),
  add column if not exists execution_backend text default 'edge';

-- Add check constraint for execution_backend values
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'build_tasks_execution_backend_check'
  ) then
    alter table build_tasks
      add constraint build_tasks_execution_backend_check
      check (execution_backend in ('edge', 'local'));
  end if;
end $$;

-- Index for finding tasks routed to local execution
create index if not exists idx_build_tasks_execution_backend
  on build_tasks(execution_backend) where execution_backend = 'local';
