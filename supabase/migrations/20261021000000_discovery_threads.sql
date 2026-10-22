-- Discovery intake threads.
-- Widens the threads.type CHECK (originally inline in
-- 20260420000000_claw_mode_threads.sql, auto-named threads_type_check) so the
-- web app can create a 'discovery' thread per session for the guided intake
-- flow. Matches ThreadType in src/types/index.ts.

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_type_check;

ALTER TABLE threads
  ADD CONSTRAINT threads_type_check
  CHECK (type IN ('concierge', 'broadcast', 'direct', 'execution', 'discovery'));
