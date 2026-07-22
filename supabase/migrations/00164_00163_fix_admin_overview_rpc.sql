CREATE OR REPLACE FUNCTION get_admin_overview_stats_v2()
RETURNS JSON AS $$
DECLARE
  v_total_users BIGINT;
  v_active_subs BIGINT;
  v_expired_subs BIGINT;
  v_ops_success BIGINT;
  v_ops_failed BIGINT;
  v_total_revenue NUMERIC;
  v_total_codes BIGINT;
  v_used_codes BIGINT;
BEGIN
  -- إجمالي المستخدمين
  SELECT COUNT(*) INTO v_total_users FROM profiles;

  -- الاشتراكات النشطة
  SELECT COUNT(*) INTO v_active_subs FROM subscriptions 
  WHERE status = 'active' AND (expires_at IS NULL OR expires_at >= NOW());

  -- الاشتراكات المنتهية
  SELECT COUNT(*) INTO v_expired_subs FROM subscriptions 
  WHERE status = 'expired' OR (status = 'active' AND expires_at < NOW());

  -- العمليات (باستخدام نفس مصدر get_operations_stats_v2)
  SELECT 
    COUNT(*) FILTER (WHERE status = 'success'::operation_status),
    COUNT(*) FILTER (WHERE status = 'failed'::operation_status),
    COALESCE(SUM(amount) FILTER (WHERE status = 'success'::operation_status), 0)
  INTO v_ops_success, v_ops_failed, v_total_revenue
  FROM operations;

  -- الأكواد
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'used')
  INTO v_total_codes, v_used_codes
  FROM license_keys;

  RETURN json_build_object(
    'total_users', v_total_users,
    'active_subs', v_active_subs,
    'expired_subs', v_expired_subs,
    'total_operations', v_ops_success + v_ops_failed,
    'total_success_operations', v_ops_success,
    'total_failed_operations', v_ops_failed,
    'total_cards', v_ops_success,
    'total_revenue', v_total_revenue,
    'total_codes', v_total_codes,
    'used_codes', v_used_codes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;