alter table executor_job_events
  drop constraint if exists executor_job_events_type_check;

alter table executor_job_events
  add constraint executor_job_events_type_check
  check (
    event_type in (
      'claimed',
      'heartbeat',
      'stdout',
      'stderr',
      'artifact',
      'status_change',
      'error',
      'completed',
      'retry'
    )
  );
