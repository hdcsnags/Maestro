-- MEM-02: Decision record column on iteration_loops
-- Stores the structured outcome of each loop (task, what worked/failed,
-- files touched, agent used) so the concierge can inject recent build history.
ALTER TABLE iteration_loops ADD COLUMN IF NOT EXISTS decision_record jsonb;
