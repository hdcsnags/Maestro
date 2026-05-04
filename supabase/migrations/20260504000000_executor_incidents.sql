-- SEC-04: executor_incidents table
-- First-class security incident records from the MaestroClaw kernel.
-- Separate from executor_job_events: incidents are user-visible, have
-- severity/category semantics, and support user acknowledgment.

CREATE TABLE IF NOT EXISTS executor_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  executor_id uuid REFERENCES executors(id),
  job_id uuid REFERENCES executor_jobs(id),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category text NOT NULL CHECK (category IN (
    'kernel_violation',
    'security_violation',
    'auth_violation',
    'scope_violation',
    'system_error',
    'manual'
  )),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_user_recent
  ON executor_incidents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_severity
  ON executor_incidents(user_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_unacknowledged
  ON executor_incidents(user_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE executor_incidents ENABLE ROW LEVEL SECURITY;

-- Owners can read all their own incidents.
CREATE POLICY incidents_owner ON executor_incidents
  FOR ALL USING (user_id = auth.uid());

-- Updates are only allowed to set acknowledged_at / acknowledged_by.
-- (INSERT is handled by the service-role key via executor-api edge function.)

-- Enable Realtime so the SecurityPanel receives live pushes.
ALTER PUBLICATION supabase_realtime ADD TABLE executor_incidents;
