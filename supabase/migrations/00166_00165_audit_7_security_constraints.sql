-- Audit 7: Security Constraints (Bans, Conflicts)

-- 1. Create a function to check if the current user or device is banned
CREATE OR REPLACE FUNCTION check_security_constraints(
  p_user_id UUID,
  p_device_fp TEXT DEFAULT NULL,
  p_hardware_hash TEXT DEFAULT NULL,
  p_native_id TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active BOOLEAN;
  v_banned_device BOOLEAN;
BEGIN
  -- Check Profile is_active
  SELECT is_active INTO v_is_active FROM profiles WHERE id = p_user_id;
  IF v_is_active = FALSE THEN
    RAISE EXCEPTION 'حسابك موقوف، لا يمكنك تنفيذ عمليات';
  END IF;

  -- Check Device Ban (if parameters provided)
  IF p_device_fp IS NOT NULL OR p_native_id IS NOT NULL OR p_hardware_hash IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM device_bans
      WHERE is_active = TRUE
        AND (
          (p_device_fp IS NOT NULL AND device_fp = p_device_fp)
          OR (p_native_id IS NOT NULL AND device_id = p_native_id)
          OR (p_hardware_hash IS NOT NULL AND hardware_hash = p_hardware_hash)
        )
    ) INTO v_banned_device;

    IF v_banned_device THEN
      RAISE EXCEPTION 'جهازك محظور، لا يمكنك تنفيذ عمليات';
    END IF;
  END IF;
END;
$$;

-- 2. Trigger on Operations to prevent inserts if user is banned
CREATE OR REPLACE FUNCTION trg_check_operation_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM check_security_constraints(NEW.user_id, NEW.device_fp, NEW.hardware_hash);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_banned_operations ON operations;
CREATE TRIGGER trg_prevent_banned_operations
BEFORE INSERT ON operations
FOR EACH ROW
EXECUTE FUNCTION trg_check_operation_security();
