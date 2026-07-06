-- C-06 rework (task-001 finding F1): persist per-task build priority.
--
-- The concierge decompose already computes a numeric priority per task
-- (lower = build first) but dropped it at build_tasks insert time, so it never
-- reached the frontend and the Conductor's manifest-reconcile priority tier was
-- dead code. This column carries it through so the priority tier can rank real
-- collisions. Nullable: rows created before this migration have no priority and
-- the reconciler falls back to its lane_name -> task_id tie-break.

alter table build_tasks
  add column if not exists priority int;

comment on column build_tasks.priority is
  'Build priority from concierge decompose (lower = build first / higher precedence). Consumed by the Conductor manifest reconcile priority tier. Nullable for pre-migration rows.';
