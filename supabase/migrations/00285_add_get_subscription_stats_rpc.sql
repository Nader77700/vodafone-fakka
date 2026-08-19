
-- ═══════════════════════════════════════════════════════════════
-- RPC: get_subscription_stats
-- يُعيد إحصائيات العمليات لاشتراك واحد محدد بـ subscription_id
-- يُستخدم في صفحة تفاصيل المستخدم لعرض إحصائيات كل اشتراك مستقلة
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_subscription_stats(p_subscription_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    integer := 0;
  v_success  integer := 0;
  v_failed   integer := 0;
  v_last_op  timestamptz;
BEGIN
  SELECT
    COUNT(*)                                              INTO v_total
  FROM operations
  WHERE subscription_id = p_subscription_id;

  SELECT
    COUNT(*) FILTER (WHERE status = 'success')            INTO v_success
  FROM operations
  WHERE subscription_id = p_subscription_id;

  SELECT
    COUNT(*) FILTER (WHERE status != 'success')           INTO v_failed
  FROM operations
  WHERE subscription_id = p_subscription_id;

  SELECT MAX(performed_at) INTO v_last_op
  FROM operations
  WHERE subscription_id = p_subscription_id;

  RETURN jsonb_build_object(
    'total',      v_total,
    'success',    v_success,
    'failed',     v_failed,
    'last_op_at', v_last_op
  );
END;
$$;

-- منح صلاحية للمستخدمين المصادق عليهم (الإدارة فقط بسبب RLS)
GRANT EXECUTE ON FUNCTION get_subscription_stats(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_user_lifetime_stats
-- يُعيد إجمالي العمليات للمستخدم عبر كل الاشتراكات (Lifetime)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_user_lifetime_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   integer := 0;
  v_success integer := 0;
  v_failed  integer := 0;
  v_last_op timestamptz;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status != 'success'),
    MAX(performed_at)
  INTO v_total, v_success, v_failed, v_last_op
  FROM operations
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'total',      v_total,
    'success',    v_success,
    'failed',     v_failed,
    'last_op_at', v_last_op
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_lifetime_stats(UUID) TO authenticated;
