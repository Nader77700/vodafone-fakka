CREATE OR REPLACE FUNCTION mark_device_logged_out(p_device_fp text, p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE device_registry
  SET is_logged_in = false
  WHERE user_id = auth.uid()
    AND (
      (p_device_fp IS NOT NULL AND device_fp = p_device_fp) OR
      (p_device_id IS NOT NULL AND device_id = p_device_id)
    );
END;
$$;
