
-- إصلاح: استثناء مالك التاجر من قائمة الأعضاء
-- المشكلة الرابعة: التاجر يظهر كمستخدم تابع لنفسه

CREATE OR REPLACE FUNCTION public.get_merchant_members_paged(
  p_merchant_id uuid,
  p_search      text    DEFAULT NULL,
  p_status      text    DEFAULT NULL,
  p_page        integer DEFAULT 1,
  p_page_size   integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_offset  int := (p_page - 1) * p_page_size;
  v_total   bigint;
  v_items   jsonb;
  v_owner   uuid;
BEGIN
  -- جلب معرف المالك لاستثنائه
  SELECT owner_id INTO v_owner FROM merchants WHERE id = p_merchant_id;

  SELECT COUNT(DISTINCT mm.id) INTO v_total
  FROM merchant_members mm
  JOIN profiles p ON p.id = mm.user_id
  WHERE mm.merchant_id = p_merchant_id
    AND mm.user_id != COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (p_status IS NULL OR mm.status::text = p_status)
    AND (p_search IS NULL
      OR p.username ILIKE '%' || p_search || '%'
      OR p.phone    ILIKE '%' || p_search || '%'
      OR p.email    ILIKE '%' || p_search || '%');

  SELECT jsonb_agg(row_to_json(t)) INTO v_items FROM (
    SELECT
      mm.id                 AS member_id,
      mm.user_id,
      mm.status             AS member_status,
      mm.assigned_points,
      mm.consumed_points,
      mm.remaining_points,
      mm.created_at         AS member_created_at,
      mm.activated_at,
      mm.expired_at,
      mm.last_operation_at,
      p.username,
      p.phone,
      p.email,
      s.status              AS sub_status,
      s.start_date,
      s.end_date,
      CASE WHEN s.end_date IS NULL OR s.end_date < CURRENT_DATE THEN 0
           ELSE (s.end_date - CURRENT_DATE)
      END                   AS remaining_days,
      s.assigned_points     AS sub_assigned_points,
      s.remaining_points    AS sub_remaining_points
    FROM merchant_members mm
    JOIN profiles p ON p.id = mm.user_id
    LEFT JOIN merchant_member_subscriptions s ON s.member_id = mm.id
    WHERE mm.merchant_id = p_merchant_id
      AND mm.user_id != COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (p_status IS NULL OR mm.status::text = p_status)
      AND (p_search IS NULL
        OR p.username ILIKE '%' || p_search || '%'
        OR p.phone    ILIKE '%' || p_search || '%'
        OR p.email    ILIKE '%' || p_search || '%')
    ORDER BY mm.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'total',   v_total,
    'page',    p_page,
    'pages',   CEIL(v_total::numeric / p_page_size),
    'items',   COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

-- إصلاح get_merchant_members_stats أيضاً لاستثناء المالك
CREATE OR REPLACE FUNCTION public.get_merchant_members_stats(
  p_merchant_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM merchants WHERE id = p_merchant_id;

  RETURN (
    SELECT jsonb_build_object(
      'success',         true,
      'total',           COUNT(*),
      'active',          COUNT(*) FILTER (WHERE mm.status = 'active'),
      'pending',         COUNT(*) FILTER (WHERE mm.status = 'pending'),
      'suspended',       COUNT(*) FILTER (WHERE mm.status = 'suspended'),
      'expired',         COUNT(*) FILTER (WHERE mm.status = 'expired'),
      'total_points',    COALESCE(SUM(mm.assigned_points), 0),
      'consumed_points', COALESCE(SUM(mm.consumed_points), 0)
    )
    FROM merchant_members mm
    WHERE mm.merchant_id = p_merchant_id
      AND mm.user_id != COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
  );
END;
$$;
