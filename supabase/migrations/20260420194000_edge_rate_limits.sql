CREATE TABLE IF NOT EXISTS edge_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, function_name, window_start)
);

CREATE INDEX IF NOT EXISTS edge_rate_limits_updated_at_idx
  ON edge_rate_limits (updated_at);

ALTER TABLE edge_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edge_rate_limits FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edge_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION consume_edge_rate_limit(
  p_user_id uuid,
  p_function_name text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_next_window timestamptz;
  v_request_count integer;
BEGIN
  IF p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be greater than zero';
  END IF;

  IF p_max_requests <= 0 THEN
    RAISE EXCEPTION 'p_max_requests must be greater than zero';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_next_window := v_window_start + make_interval(secs => p_window_seconds);

  INSERT INTO edge_rate_limits (
    user_id,
    function_name,
    window_start,
    request_count,
    updated_at
  )
  VALUES (
    p_user_id,
    p_function_name,
    v_window_start,
    1,
    v_now
  )
  ON CONFLICT (user_id, function_name, window_start)
  DO UPDATE
    SET request_count = edge_rate_limits.request_count + 1,
        updated_at = EXCLUDED.updated_at
  RETURNING edge_rate_limits.request_count
  INTO v_request_count;

  allowed := v_request_count <= p_max_requests;
  remaining := GREATEST(p_max_requests - v_request_count, 0);
  retry_after_seconds := GREATEST(
    CEIL(extract(epoch from (v_next_window - v_now))),
    1
  )::integer;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(uuid, text, integer, integer) TO service_role;
