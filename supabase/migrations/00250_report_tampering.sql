CREATE OR REPLACE FUNCTION report_tampering(device_id text, hardware_hash text, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into device_bans
  INSERT INTO device_bans (device_fp, device_id, hardware_hash, ban_reason, ban_type, is_permanent, is_active)
  VALUES (
    gen_random_uuid()::text, -- fallback
    device_id,
    hardware_hash,
    reason,
    'system',
    true,
    true
  ) ON CONFLICT DO NOTHING;

  -- Attempt to cancel subscriptions if user is logged in
  IF auth.uid() IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'cancelled'
    WHERE user_id = auth.uid() AND status = 'active';

    -- Also update profile to inactive just to be sure
    UPDATE core_profiles
    SET is_active = false
    WHERE id = auth.uid();
  END IF;
END;
$$;