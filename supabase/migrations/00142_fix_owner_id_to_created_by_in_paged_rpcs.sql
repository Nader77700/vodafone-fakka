
-- ══════════════════════════════════════════════════════
-- CRITICAL FIX: owner_id → created_by في RPCs الأعضاء
-- هذا كان سبب فشل SubscriptionsTab بصمت تام
-- ══════════════════════════════════════════════════════

-- 1) إصلاح get_merchant_members_paged
CREATE OR REPLACE FUNCTION public.get_merchant_members_paged(
  p_merchant_id uuid,
  p_search      text    DEFAULT NULL,
  p_status      text    DEFAULT NULL,
  p_page        int     DEFAULT 1,
  p_page_size   int     DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offset  int  := (p_page - 1) * p_page_size;
  v_total   bigint;
  v_owner   uuid;
  v_items   jsonb;
BEGIN
  -- FIX: created_by بدلاً من owner_id
  SELECT created_by INTO v_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT COUNT(DISTINCT mm.id) INTO v_total
  FROM public.merchant_members mm
  JOIN public.profiles p ON p.id = mm.user_id
  WHERE mm.merchant_id = p_merchant_id
    AND mm.user_id != COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (p_status IS NULL OR mm.status::text = p_status)
    AND (p_search IS NULL
      OR p.username ILIKE '%' || p_search || '%'
      OR p.phone    ILIKE '%' || p_search || '%'
      OR p.email    ILIKE '%' || p_search || '%');

  SELECT jsonb_agg(row_to_json(t.*)) INTO v_items FROM (
    SELECT
      mm.id                 AS member_id,
      mm.user_id,
      mm.merchant_id,
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
      -- FIX: LATERAL JOIN للحصول على آخر اشتراك فقط (تفادي التكرار)
      s.status              AS sub_status,
      s.start_date,
      s.end_date,
      CASE WHEN s.end_date IS NULL OR s.end_date < CURRENT_DATE THEN 0
           ELSE (s.end_date::date - CURRENT_DATE)
      END                   AS remaining_days,
      COALESCE(s.assigned_points, 0)   AS sub_assigned_points,
      COALESCE(s.remaining_points, 0)  AS sub_remaining_points
    FROM public.merchant_members mm
    JOIN public.profiles p ON p.id = mm.user_id
    -- LATERAL: آخر اشتراك نشط، وإلا آخر اشتراك على الإطلاق
    LEFT JOIN LATERAL (
      SELECT * FROM public.merchant_member_subscriptions sub
      WHERE sub.member_id = mm.id
      ORDER BY
        CASE sub.status::text
          WHEN 'active'      THEN 1
          WHEN 'grace_period' THEN 2
          WHEN 'pending'     THEN 3
          WHEN 'expired'     THEN 4
          WHEN 'cancelled'   THEN 5
          ELSE 6
        END,
        sub.created_at DESC
      LIMIT 1
    ) s ON true
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
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'items', '[]'::jsonb, 'total', 0, 'pages', 0);
END;
$$;

-- 2) إصلاح get_merchant_members_stats
CREATE OR REPLACE FUNCTION public.get_merchant_members_stats(
  p_merchant_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_owner uuid;
BEGIN
  -- FIX: created_by بدلاً من owner_id
  SELECT created_by INTO v_owner FROM public.merchants WHERE id = p_merchant_id;

  RETURN (
    SELECT jsonb_build_object(
      'success',         true,
      'total',           COUNT(*),
      'active',          COUNT(*) FILTER (WHERE mm.status = 'active'),
      'pending',         COUNT(*) FILTER (WHERE mm.status = 'pending'),
      'suspended',       COUNT(*) FILTER (WHERE mm.status = 'suspended'),
      'blocked',         COUNT(*) FILTER (WHERE mm.status = 'blocked'),
      'expired',         COUNT(*) FILTER (WHERE mm.status = 'expired'::member_status),
      'total_assigned',  COALESCE(SUM(mm.assigned_points), 0),
      'total_consumed',  COALESCE(SUM(mm.consumed_points), 0),
      'total_remaining', COALESCE(SUM(mm.remaining_points), 0)
    )
    FROM public.merchant_members mm
    WHERE mm.merchant_id = p_merchant_id
      AND mm.user_id != COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
