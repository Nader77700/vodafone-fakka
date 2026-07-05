
-- =====================================================
-- PHASE 4+5: gift_claims — add status + code snapshot
-- =====================================================
ALTER TABLE gift_claims
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed')),
  ADD COLUMN IF NOT EXISTS code_snapshot text;

-- =====================================================
-- PHASE 6: subscriptions — add ops_count for tracking
-- =====================================================
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS ops_count integer NOT NULL DEFAULT 0;

-- =====================================================
-- PHASE 13: Rebuild get_global_code_stats with correct counts
-- =====================================================
CREATE OR REPLACE FUNCTION get_global_code_stats()
RETURNS TABLE(
  total_codes bigint, active_codes bigint, used_codes bigint,
  expired_codes bigint, disabled_codes bigint, closed_codes bigint,
  trial_codes bigint, paid_codes bigint, gift_codes bigint,
  total_linked_users bigint, total_renewals bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COUNT(*)                                         AS total_codes,
    COUNT(*) FILTER (WHERE status='active')          AS active_codes,
    COUNT(*) FILTER (WHERE status='used')            AS used_codes,
    COUNT(*) FILTER (WHERE status='expired')         AS expired_codes,
    COUNT(*) FILTER (WHERE status='disabled')        AS disabled_codes,
    COUNT(*) FILTER (WHERE status='closed')          AS closed_codes,
    COUNT(*) FILTER (WHERE code_type='trial')        AS trial_codes,
    COUNT(*) FILTER (WHERE code_type='paid' OR code_type IS NULL) AS paid_codes,
    COUNT(*) FILTER (WHERE code_type='gift')         AS gift_codes,
    (SELECT COUNT(DISTINCT user_id) FROM subscriptions WHERE license_key_id IS NOT NULL AND status='active') AS total_linked_users,
    (SELECT COUNT(*) FROM subscription_history)      AS total_renewals
  FROM license_keys;
$$;

-- =====================================================
-- PHASE 14: System Integrity Check function
-- =====================================================
CREATE OR REPLACE FUNCTION get_system_integrity_report()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_profiles',       (SELECT COUNT(*) FROM profiles),
    'total_subscriptions',  (SELECT COUNT(*) FROM subscriptions),
    'active_subscriptions', (SELECT COUNT(*) FROM subscriptions WHERE status='active'),
    'expired_subscriptions',(SELECT COUNT(*) FROM subscriptions WHERE status='expired'),
    'total_license_keys',   (SELECT COUNT(*) FROM license_keys),
    'active_keys',          (SELECT COUNT(*) FROM license_keys WHERE status='active'),
    'used_keys',            (SELECT COUNT(*) FROM license_keys WHERE status='used'),
    'total_gift_claims',    (SELECT COUNT(*) FROM gift_claims),
    'pending_gift_claims',  (SELECT COUNT(*) FROM gift_claims WHERE status='pending'),
    'claimed_gifts',        (SELECT COUNT(*) FROM gift_claims WHERE status='claimed'),
    'total_operations',     (SELECT COUNT(*) FROM operations),
    'orphan_subscriptions', (SELECT COUNT(*) FROM subscriptions s WHERE s.license_key_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM license_keys k WHERE k.id=s.license_key_id)),
    'mismatched_used_count',(SELECT COUNT(*) FROM license_keys k WHERE k.used_count != (SELECT COUNT(*) FROM gift_claims gc WHERE gc.license_key_id=k.id AND gc.status='claimed') AND k.code_type='gift'),
    'duplicate_active_subs',(SELECT COUNT(*) FROM (SELECT user_id FROM subscriptions WHERE status='active' GROUP BY user_id HAVING COUNT(*)>1) x),
    'check_time',           now()
  );
$$;

-- =====================================================
-- PHASE 1: Cascade delete function — atomic
-- =====================================================
CREATE OR REPLACE FUNCTION delete_license_key_cascade(p_key_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key license_keys%ROWTYPE;
  v_affected_users integer;
BEGIN
  SELECT * INTO v_key FROM license_keys WHERE id = p_key_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Key not found');
  END IF;

  -- Count affected subscriptions
  SELECT COUNT(*) INTO v_affected_users
  FROM subscriptions WHERE license_key_id = p_key_id AND status = 'active';

  -- Cancel all active subscriptions linked to this key
  UPDATE subscriptions
  SET
    status       = 'expired',
    expires_at   = now(),
    updated_at   = now()
  WHERE license_key_id = p_key_id AND status = 'active';

  -- Log in activity_log for each affected user
  INSERT INTO activity_log (user_id, event_type, title, description, metadata)
  SELECT
    s.user_id,
    'subscription_cancelled',
    'تم إلغاء الاشتراك',
    'تم إلغاء اشتراكك بسبب حذف الكود من قبل الإدارة',
    jsonb_build_object('key_id', p_key_id, 'key_code', v_key.code, 'admin_id', p_admin_id)
  FROM subscriptions s
  WHERE s.license_key_id = p_key_id;

  -- Log the deletion in activity_log for admin
  INSERT INTO activity_log (user_id, event_type, title, description, metadata)
  VALUES (
    p_admin_id,
    'key_deleted',
    'حذف كود',
    format('تم حذف الكود %s وإلغاء %s اشتراك', v_key.code, v_affected_users),
    jsonb_build_object('key_id', p_key_id, 'key_code', v_key.code, 'affected_users', v_affected_users)
  );

  -- Delete the key
  DELETE FROM license_keys WHERE id = p_key_id;

  RETURN jsonb_build_object('success', true, 'affected_users', v_affected_users, 'key_code', v_key.code);
END;
$$;

-- =====================================================
-- PHASE 13: DB Audit repair function
-- =====================================================
CREATE OR REPLACE FUNCTION repair_used_count()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fixed integer := 0;
BEGIN
  -- Fix used_count for gift codes: count claimed gift_claims
  WITH correct AS (
    SELECT license_key_id, COUNT(*) AS real_count
    FROM gift_claims WHERE status='claimed'
    GROUP BY license_key_id
  )
  UPDATE license_keys k
  SET used_count = c.real_count
  FROM correct c
  WHERE k.id = c.license_key_id AND k.code_type='gift' AND k.used_count != c.real_count;

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RETURN jsonb_build_object('fixed_rows', v_fixed, 'repaired_at', now());
END;
$$;

-- Ensure activity_log RLS allows inserts from service role functions
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_write_activity" ON activity_log;
CREATE POLICY "service_write_activity" ON activity_log FOR ALL USING (true) WITH CHECK (true);
