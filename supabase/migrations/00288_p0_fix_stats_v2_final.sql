
-- Drop all conflicting functions first
DROP FUNCTION IF EXISTS get_operations_stats_v2(uuid, text, text, text, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS get_user_lifetime_stats(uuid);
DROP FUNCTION IF EXISTS get_operations_amounts_stats(uuid);
DROP FUNCTION IF EXISTS get_operations_amounts_stats(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS get_subscription_stats(uuid);
DROP FUNCTION IF EXISTS get_subscription_usage_analytics(uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_core_ops_sub_id    ON core_operations(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_core_ops_user_stat ON core_operations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_core_ops_amount    ON core_operations(amount) WHERE amount IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_core_ops_performed ON core_operations(performed_at);
CREATE INDEX IF NOT EXISTS idx_core_ops_card_type ON core_operations(card_type);

-- Backfill subscription_id
UPDATE core_operations op
SET subscription_id = (
  SELECT s.id FROM subscriptions s
  WHERE s.user_id = op.user_id
    AND s.created_at <= op.performed_at
    AND (s.expires_at IS NULL OR s.expires_at >= op.performed_at)
  ORDER BY s.created_at DESC LIMIT 1
)
WHERE op.subscription_id IS NULL AND op.user_id IS NOT NULL;

-- get_user_lifetime_stats
CREATE FUNCTION get_user_lifetime_stats(p_user_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v json;
BEGIN
  SELECT json_build_object(
    'total',      COUNT(*),
    'success',    COUNT(*) FILTER (WHERE status = 'success'),
    'failed',     COUNT(*) FILTER (WHERE status != 'success'),
    'last_op_at', MAX(performed_at)::text,
    'revenue',    COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0)
  ) INTO v FROM core_operations WHERE user_id = p_user_id;
  RETURN v;
END; $$;

-- get_operations_amounts_stats
CREATE FUNCTION get_operations_amounts_stats(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(amount numeric, count bigint, label text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT o.amount::numeric, COUNT(*) AS count, (o.amount::text || ' جنيه') AS label
  FROM core_operations o
  WHERE (p_user_id IS NULL OR o.user_id = p_user_id)
    AND o.amount IS NOT NULL AND o.amount > 0
  GROUP BY o.amount ORDER BY o.amount ASC;
$$;

-- get_subscription_stats
CREATE FUNCTION get_subscription_stats(p_subscription_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v json;
BEGIN
  WITH si AS (SELECT id,user_id,created_at,expires_at FROM subscriptions WHERE id=p_subscription_id),
  ops AS (
    SELECT co.* FROM core_operations co JOIN si ON co.user_id=si.user_id
    WHERE co.subscription_id=p_subscription_id
       OR (co.subscription_id IS NULL AND co.performed_at>=si.created_at
           AND (si.expires_at IS NULL OR co.performed_at<=si.expires_at))
  )
  SELECT json_build_object(
    'total',   COUNT(*),
    'success', COUNT(*) FILTER (WHERE status='success'),
    'failed',  COUNT(*) FILTER (WHERE status!='success'),
    'revenue', COALESCE(SUM(amount) FILTER (WHERE status='success'),0)
  ) INTO v FROM ops;
  RETURN v;
END; $$;

-- get_subscription_usage_analytics
CREATE FUNCTION get_subscription_usage_analytics(p_subscription_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v json;
BEGIN
  WITH si AS (SELECT id,user_id,created_at,expires_at FROM subscriptions WHERE id=p_subscription_id),
  ops AS (
    SELECT co.* FROM core_operations co JOIN si ON co.user_id=si.user_id
    WHERE co.subscription_id=p_subscription_id
       OR (co.subscription_id IS NULL AND co.performed_at>=si.created_at
           AND (si.expires_at IS NULL OR co.performed_at<=si.expires_at))
  ),
  daily AS (
    SELECT DATE(o.performed_at)::text AS day,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE o.status='success') AS success,
      COUNT(*) FILTER (WHERE o.status!='success') AS failed,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status='success'),0) AS revenue
    FROM ops o GROUP BY DATE(o.performed_at) ORDER BY day
  )
  SELECT json_build_object(
    'total',         COUNT(*),
    'success',       COUNT(*) FILTER (WHERE status='success'),
    'failed',        COUNT(*) FILTER (WHERE status!='success'),
    'revenue',       COALESCE(SUM(amount) FILTER (WHERE status='success'),0),
    'daily_usage',   (SELECT json_agg(json_build_object('day',day,'total',total,'success',success,'failed',failed,'revenue',revenue) ORDER BY day) FROM daily),
    'unique_phones', COUNT(DISTINCT phone_number),
    'first_op_at',   MIN(performed_at)::text,
    'last_op_at',    MAX(performed_at)::text
  ) INTO v FROM ops;
  RETURN v;
END; $$;

-- get_operations_stats_v2
CREATE FUNCTION get_operations_stats_v2(
  filter_user_id uuid DEFAULT NULL,
  filter_phone text DEFAULT NULL,
  filter_card_type text DEFAULT NULL,
  filter_status text DEFAULT NULL,
  filter_date_from timestamptz DEFAULT NULL,
  filter_date_to timestamptz DEFAULT NULL,
  filter_operation_source text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v json;
BEGIN
  SELECT json_build_object(
    'total_count',   COUNT(*),
    'success_count', COUNT(*) FILTER (WHERE status='success'),
    'failed_count',  COUNT(*) FILTER (WHERE status::text!='success' AND status::text!='pending'),
    'pending_count', COUNT(*) FILTER (WHERE status::text='pending'),
    'total_amount',  COALESCE(SUM(amount) FILTER (WHERE status='success'),0)
  ) INTO v
  FROM core_operations
  WHERE (filter_user_id IS NULL OR user_id=filter_user_id)
    AND (filter_phone IS NULL OR phone_number ILIKE '%'||filter_phone||'%')
    AND (filter_card_type IS NULL OR card_type ILIKE '%'||filter_card_type||'%')
    AND (filter_status IS NULL OR status::text=filter_status)
    AND (filter_date_from IS NULL OR performed_at>=filter_date_from)
    AND (filter_date_to IS NULL OR performed_at<=filter_date_to)
    AND (filter_operation_source IS NULL OR operation_source=filter_operation_source);
  RETURN v;
END; $$;

-- admin_override_logs
CREATE TABLE IF NOT EXISTS admin_override_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_username text,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_username text,
  subscription_code text NOT NULL,
  prev_code_status text,
  prev_activation_user_id uuid,
  prev_activation_username text,
  prev_activation_date timestamptz,
  prev_subscription_id uuid,
  new_subscription_id uuid,
  new_subscription_start timestamptz,
  new_subscription_expiry timestamptz,
  bypass_reasons text[],
  activation_type text DEFAULT 'ADMIN_OVERRIDE',
  override_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_override_logs_admin  ON admin_override_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_override_logs_target ON admin_override_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_override_logs_code   ON admin_override_logs(subscription_code);

ALTER TABLE admin_override_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_read_override_logs" ON admin_override_logs;
DROP POLICY IF EXISTS "service_all_override_logs"  ON admin_override_logs;

CREATE POLICY "admins_read_override_logs" ON admin_override_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin'::user_role, 'super_admin'::user_role)
  ));

CREATE POLICY "service_all_override_logs" ON admin_override_logs FOR ALL
  USING (auth.role() = 'service_role');

-- log_admin_override helper
CREATE OR REPLACE FUNCTION log_admin_override(
  p_admin_id uuid, p_admin_username text,
  p_target_user_id uuid, p_target_username text,
  p_subscription_code text,
  p_prev_code_status text DEFAULT NULL,
  p_prev_activation_user_id uuid DEFAULT NULL,
  p_prev_activation_username text DEFAULT NULL,
  p_prev_activation_date timestamptz DEFAULT NULL,
  p_prev_subscription_id uuid DEFAULT NULL,
  p_new_subscription_id uuid DEFAULT NULL,
  p_new_subscription_start timestamptz DEFAULT NULL,
  p_new_subscription_expiry timestamptz DEFAULT NULL,
  p_bypass_reasons text[] DEFAULT '{}',
  p_override_reason text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO admin_override_logs (
    admin_id,admin_username,target_user_id,target_username,
    subscription_code,prev_code_status,
    prev_activation_user_id,prev_activation_username,prev_activation_date,
    prev_subscription_id,new_subscription_id,
    new_subscription_start,new_subscription_expiry,
    bypass_reasons,override_reason
  ) VALUES (
    p_admin_id,p_admin_username,p_target_user_id,p_target_username,
    p_subscription_code,p_prev_code_status,
    p_prev_activation_user_id,p_prev_activation_username,p_prev_activation_date,
    p_prev_subscription_id,p_new_subscription_id,
    p_new_subscription_start,p_new_subscription_expiry,
    p_bypass_reasons,p_override_reason
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
