
-- إصلاح admin_get_merchants_overview — حذف JOIN merchant_license_codes غير الموجودة
CREATE OR REPLACE FUNCTION public.admin_get_merchants_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT
      m.id,
      m.name,
      m.status,
      m.brand_color,
      m.created_at,
      COALESCE(w.current_points,      0) AS current_balance,
      COALESCE(w.used_points,         0) AS total_points_given,
      COALESCE(w.lifetime_purchased,  0) AS total_points_received,
      COALESCE(w.current_points, 0) + COALESCE(w.used_points, 0) AS remaining_points,
      COUNT(DISTINCT mm.user_id)          AS member_count,
      COUNT(DISTINCT mo.id)               AS operation_count,
      COUNT(DISTINCT CASE WHEN ms.status::text = 'active' THEN ms.id END)  AS active_subs,
      COUNT(DISTINCT CASE WHEN ms.status::text = 'expired' THEN ms.id END) AS expired_subs,
      0                                   AS code_count,
      MAX(mo.created_at)                  AS last_activity
    FROM public.merchants m
    LEFT JOIN public.merchant_wallets             w  ON w.merchant_id  = m.id
    LEFT JOIN public.merchant_members             mm ON mm.merchant_id = m.id
    LEFT JOIN public.merchant_operations          mo ON mo.merchant_id = m.id
    LEFT JOIN public.merchant_member_subscriptions ms ON ms.merchant_id = m.id
    WHERE m.status::text != 'deleted'
    GROUP BY m.id, m.name, m.status, m.brand_color, m.created_at,
             w.current_points, w.used_points, w.lifetime_purchased
    ORDER BY m.created_at DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'data', '[]'::jsonb);
END;
$function$;
