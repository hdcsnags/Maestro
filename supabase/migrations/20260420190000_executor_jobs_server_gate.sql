-- Lock executor job creation and mutation behind executor-api so the
-- server-side trust gate is authoritative.

drop policy if exists "Users manage own executor jobs" on executor_jobs;
drop policy if exists "Users read own executor jobs" on executor_jobs;

create policy "Users read own executor jobs"
  on executor_jobs for select to authenticated
  using (requested_by = auth.uid());
