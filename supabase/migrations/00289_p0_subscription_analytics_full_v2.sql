
-- ═══════════════════════════════════════════════════════════════
-- P0: Subscription Analytics Full Rewrite
-- كل اشتراك يُعيد Usage مستقل تماماً مع:
--   allowed_operations (limit من license_key)
--   used_operations (successful فقط)
--   remaining_operations
--   start_date / end_date
--   subscription_type (limited / unlimited)
--   plan name
-- ═══════════════════════════════════════════════════════════════

-- حذف الإصدارات القديمة
DROP FUNCTION IF EXISTS get_subscription_stats(uuid);
DROP FUNCTION IF EXISTS get_subscription_usage_analytics(uuid);

-- ── get_subscription_stats: إحصائيات خفيفة لعرض قائمة الاشتراكات ──
CREATE OR REPLACE FUNCTION get_subscription_stats(p_subscription_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_user_id     uuid;
  v_start       timestamptz;
  v_end         timestamptz;
  v_lk_id       uuid;
  v_ops_limit   integer;
  v_code_type   text;
  v_plan        text;
BEGIN
  -- جلب بيانات الاشتراك
  SELECT s.user_id, s.created_at, s.expires_at, s.license_key_id, s.ops_limit
    INTO v_user_id, v_start, v_end, v_lk_id, v_ops_limit
  FROM subscriptions s
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN json_build_object('total',0,'success',0,'failed',0,'revenue',0,
      'allowed_operations',NULL,'used_operations',0,'remaining_operations',NULL,
      'subscription_type','unlimited','start_date',NULL,'end_date',NULL,'plan','');
  END IF;

  -- جلب ops_limit و code_type من license_key إن لم يكن في subscriptions
  IF v_lk_id IS NOT NULL THEN
    SELECT
      COALESCE(lk.operations_per_user, lk.max_ops_per_user),
      lk.code_type,
      COALESCE(lk.plan_name, lk.code_type, 'اشتراك')
    INTO v_ops_limit, v_code_type, v_plan
    FROM license_keys lk
    WHERE lk.id = v_lk_id;
  END IF;

  -- ops_limit = 0 يعني Unlimited في منطق العمل
  IF v_ops_limit IS NOT NULL AND v_ops_limit = 0 THEN
    v_ops_limit := NULL;
  END IF;

  -- حساب الإحصائيات داخل فترة الاشتراك فقط
  SELECT json_build_object(
    'total',         COUNT(*),
    'success',       COUNT(*) FILTER (WHERE co.status = 'success'),
    'failed',        COUNT(*) FILTER (WHERE co.status != 'success'),
    'revenue',       COALESCE(SUM(co.amount) FILTER (WHERE co.status = 'success'), 0),
    'allowed_operations',  v_ops_limit,
    'used_operations',     COUNT(*) FILTER (WHERE co.status = 'success'),
    'remaining_operations',
      CASE WHEN v_ops_limit IS NULL THEN NULL
           ELSE GREATEST(0, v_ops_limit - COUNT(*) FILTER (WHERE co.status = 'success')::integer)
      END,
    'subscription_type',  CASE WHEN v_ops_limit IS NULL THEN 'unlimited' ELSE 'limited' END,
    'start_date',    v_start::text,
    'end_date',      v_end::text,
    'plan',          COALESCE(v_plan, '')
  ) INTO v_result
  FROM core_operations co
  WHERE co.user_id = v_user_id
    AND (
      co.subscription_id = p_subscription_id
      OR (
        co.subscription_id IS NULL
        AND co.performed_at >= v_start
        AND (v_end IS NULL OR co.performed_at <= v_end)
      )
    );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_stats(uuid) TO authenticated;

-- ── get_subscription_usage_analytics: تفصيلي مع daily_usage ──
CREATE OR REPLACE FUNCTION get_subscription_usage_analytics(p_subscription_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result    json;
  v_user_id   uuid;
  v_start     timestamptz;
  v_end       timestamptz;
  v_lk_id     uuid;
  v_ops_limit integer;
  v_code_type text;
  v_plan      text;
BEGIN
  SELECT s.user_id, s.created_at, s.expires_at, s.license_key_id, s.ops_limit
    INTO v_user_id, v_start, v_end, v_lk_id, v_ops_limit
  FROM subscriptions s
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'total',0,'success',0,'failed',0,'revenue',0,'unique_phones',0,
      'first_op_at',NULL,'last_op_at',NULL,'daily_usage',NULL,
      'allowed_operations',NULL,'used_operations',0,'remaining_operations',NULL,
      'subscription_type','unlimited','start_date',NULL,'end_date',NULL,'plan',''
    );
  END IF;

  IF v_lk_id IS NOT NULL THEN
    SELECT
      COALESCE(lk.operations_per_user, lk.max_ops_per_user),
      lk.code_type,
      COALESCE(lk.plan_name, lk.code_type, 'اشتراك')
    INTO v_ops_limit, v_code_type, v_plan
    FROM license_keys lk
    WHERE lk.id = v_lk_id;
  END IF;

  IF v_ops_limit IS NOT NULL AND v_ops_limit = 0 THEN
    v_ops_limit := NULL;
  END IF;

  WITH ops AS (
    SELECT co.*
    FROM core_operations co
    WHERE co.user_id = v_user_id
      AND (
        co.subscription_id = p_subscription_id
        OR (
          co.subscription_id IS NULL
          AND co.performed_at >= v_start
          AND (v_end IS NULL OR co.performed_at <= v_end)
        )
      )
  ),
  daily AS (
    SELECT
      DATE(o.performed_at AT TIME ZONE 'Africa/Cairo')::text AS day,
      COUNT(*)                                               AS total,
      COUNT(*) FILTER (WHERE o.status = 'success')          AS success,
      COUNT(*) FILTER (WHERE o.status != 'success')         AS failed,
      COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'success'), 0) AS revenue
    FROM ops o
    GROUP BY DATE(o.performed_at AT TIME ZONE 'Africa/Cairo')
    ORDER BY day
  ),
  agg AS (
    SELECT
      COUNT(*)                                         AS total,
      COUNT(*) FILTER (WHERE status = 'success')       AS success,
      COUNT(*) FILTER (WHERE status != 'success')      AS failed,
      COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS revenue,
      COUNT(DISTINCT phone_number)                     AS unique_phones,
      MIN(performed_at)                                AS first_op_at,
      MAX(performed_at)                                AS last_op_at
    FROM ops
  )
  SELECT json_build_object(
    'total',          agg.total,
    'success',        agg.success,
    'failed',         agg.failed,
    'revenue',        agg.revenue,
    'unique_phones',  agg.unique_phones,
    'first_op_at',    agg.first_op_at::text,
    'last_op_at',     agg.last_op_at::text,
    'daily_usage',    (
      SELECT json_agg(
        json_build_object('day',d.day,'total',d.total,'success',d.success,'failed',d.failed,'revenue',d.revenue)
        ORDER BY d.day
      ) FROM daily d
    ),
    'allowed_operations',  v_ops_limit,
    'used_operations',     agg.success,
    'remaining_operations',
      CASE WHEN v_ops_limit IS NULL THEN NULL
           ELSE GREATEST(0, v_ops_limit - agg.success::integer)
      END,
    'subscription_type', CASE WHEN v_ops_limit IS NULL THEN 'unlimited' ELSE 'limited' END,
    'start_date',  v_start::text,
    'end_date',    v_end::text,
    'plan',        COALESCE(v_plan, '')
  ) INTO v_result
  FROM agg;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_usage_analytics(uuid) TO authenticated;

-- تأكد من وجود عمود plan_name في license_keys (مرن — لا يفشل إن كان موجود)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='license_keys' AND column_name='plan_name'
  ) THEN
    ALTER TABLE license_keys ADD COLUMN plan_name text;
  END IF;
END $$;
