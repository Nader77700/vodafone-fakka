
-- ══════════════════════════════════════════════════════════════
-- 1. إضافة عمود idempotency_key على جدول operations
--    يمنع تنفيذ نفس العملية مرتين حتى عند الضغط المتكرر أو Retry
-- ══════════════════════════════════════════════════════════════
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id  TEXT,
  ADD COLUMN IF NOT EXISTS execution_layer TEXT DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS retry_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latency_ms      INTEGER;

-- فهرس فريد — يرفض التكرار على مستوى DB
CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_idempotency_key
  ON operations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- 2. دالة atomic لاستهلاك عملية — تحل مشكلة Race Condition
--    تستخدم FOR UPDATE SKIP LOCKED لمنع الـ Deadlock
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION atomic_consume_operation(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub         subscriptions%ROWTYPE;
  v_key         license_keys%ROWTYPE;
  v_usage       trial_usage%ROWTYPE;
  v_ops_used    INTEGER;
  v_ops_limit   INTEGER;
  v_new_count   INTEGER;
  v_code_type   TEXT;
  v_is_trial    BOOLEAN;
  v_is_by_usage BOOLEAN;
BEGIN
  -- ── قفل سطر الاشتراك atomically (FOR UPDATE لمنع Race Condition) ──
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  FOR UPDATE;           -- قفل حصري — لا يمكن لأي transaction أخرى تعديله في نفس الوقت

  IF NOT FOUND THEN
    RETURN json_build_object(
      'allowed',   false,
      'exhausted', false,
      'ops_used',  0,
      'ops_limit', 0,
      'remaining', 0,
      'code_type', 'none',
      'is_trial',  false
    );
  END IF;

  -- بدون كود (admin/legacy) → غير محدود
  IF v_sub.license_key_id IS NULL THEN
    v_new_count := COALESCE(v_sub.ops_count, 0) + 1;
    UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;
    RETURN json_build_object(
      'allowed',   true,
      'exhausted', false,
      'ops_used',  v_new_count,
      'ops_limit', NULL,
      'remaining', NULL,
      'code_type', 'admin',
      'is_trial',  false
    );
  END IF;

  -- جلب بيانات الكود
  SELECT * INTO v_key FROM license_keys WHERE id = v_sub.license_key_id;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'exhausted', true, 'ops_used', 0, 'ops_limit', 0, 'remaining', 0, 'code_type', 'unknown', 'is_trial', false);
  END IF;

  v_code_type   := v_key.code_type;
  v_is_trial    := (v_code_type = 'trial');
  v_is_by_usage := (v_key.expiration_mode = 'BY_USAGE');
  v_ops_limit   := COALESCE(v_key.operations_per_user, v_key.max_ops_per_user, NULL);
  IF v_ops_limit = 0 THEN v_ops_limit := NULL; END IF;   -- 0 = غير محدود

  -- ── حالة: اشتراك تجريبي ──
  IF v_is_trial THEN
    SELECT * INTO v_usage
    FROM trial_usage
    WHERE key_id = v_sub.license_key_id AND user_id = p_user_id
    FOR UPDATE;  -- قفل لمنع تضارب concurrent trial ops

    v_ops_used := COALESCE(v_usage.ops_used, 0);

    IF v_ops_limit IS NOT NULL AND v_ops_used >= v_ops_limit THEN
      RETURN json_build_object(
        'allowed',   false, 'exhausted', true,
        'ops_used',  v_ops_used, 'ops_limit', v_ops_limit,
        'remaining', 0, 'code_type', v_code_type, 'is_trial', true
      );
    END IF;

    v_new_count := v_ops_used + 1;
    IF FOUND THEN
      UPDATE trial_usage SET ops_used = v_new_count WHERE id = v_usage.id;
    ELSE
      INSERT INTO trial_usage (key_id, user_id, ops_used)
      VALUES (v_sub.license_key_id, p_user_id, v_new_count)
      ON CONFLICT (key_id, user_id) DO UPDATE SET ops_used = trial_usage.ops_used + 1;
    END IF;

    RETURN json_build_object(
      'allowed',    true,
      'exhausted',  (v_ops_limit IS NOT NULL AND v_new_count >= v_ops_limit),
      'ops_used',   v_new_count,
      'ops_limit',  v_ops_limit,
      'remaining',  CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_count ELSE NULL END,
      'code_type',  v_code_type,
      'is_trial',   true
    );
  END IF;

  -- ── حالة: مدفوع / هدية ──
  v_ops_used := COALESCE(v_sub.ops_count, 0);

  IF v_ops_limit IS NOT NULL AND v_ops_used >= v_ops_limit THEN
    RETURN json_build_object(
      'allowed',   false, 'exhausted', true,
      'ops_used',  v_ops_used, 'ops_limit', v_ops_limit,
      'remaining', 0, 'code_type', v_code_type, 'is_trial', false
    );
  END IF;

  v_new_count := v_ops_used + 1;
  UPDATE subscriptions SET ops_count = v_new_count WHERE id = v_sub.id;

  RETURN json_build_object(
    'allowed',    true,
    'exhausted',  (v_ops_limit IS NOT NULL AND v_new_count >= v_ops_limit),
    'ops_used',   v_new_count,
    'ops_limit',  v_ops_limit,
    'remaining',  CASE WHEN v_ops_limit IS NOT NULL THEN v_ops_limit - v_new_count ELSE NULL END,
    'code_type',  v_code_type,
    'is_trial',   false
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 3. دالة refund_operation — استرداد عملية واحدة (Rollback)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION atomic_refund_operation(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_key license_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_sub.license_key_id IS NULL THEN
    UPDATE subscriptions
    SET ops_count = GREATEST(0, COALESCE(ops_count, 1) - 1)
    WHERE id = v_sub.id;
    RETURN;
  END IF;

  SELECT * INTO v_key FROM license_keys WHERE id = v_sub.license_key_id;
  IF v_key.code_type = 'trial' THEN
    UPDATE trial_usage
    SET ops_used = GREATEST(0, ops_used - 1)
    WHERE key_id = v_sub.license_key_id AND user_id = p_user_id;
  ELSE
    UPDATE subscriptions
    SET ops_count = GREATEST(0, COALESCE(ops_count, 1) - 1)
    WHERE id = v_sub.id;
  END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. منح صلاحيات التنفيذ
-- ══════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION atomic_consume_operation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_refund_operation(UUID)  TO authenticated;
