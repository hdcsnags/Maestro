do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'build_tasks'
  ) then
    alter publication supabase_realtime add table public.build_tasks;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'executor_jobs'
  ) then
    alter publication supabase_realtime add table public.executor_jobs;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'executor_job_events'
  ) then
    alter publication supabase_realtime add table public.executor_job_events;
  end if;
end
$$;
