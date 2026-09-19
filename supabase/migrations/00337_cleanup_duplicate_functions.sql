
-- ═══════════════════════════════════════════════════════
-- 1. حذف النسخة الجديدة من update_product_config (p_status text)
--    نبقي على القديمة (p_status product_status) لأن RLS تعتمد عليها
-- ═══════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.update_product_config(
  text, boolean, boolean, text, numeric, integer, text, numeric, numeric, integer, jsonb, text
);

-- ═══════════════════════════════════════════════════════
-- 2. إصلاح is_admin_user() (oid=18538) بدون حذف — نستبدل الـ body
--    هذا هو الذي تعتمد عليه RLS policies
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- يتحقق من core_profiles أولاً (admin + super_admin)
  IF EXISTS (
    SELECT 1 FROM core_profiles
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'super_admin')
  ) THEN
    RETURN true;
  END IF;
  -- fallback: جدول profiles
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'super_admin')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- 3. إصلاح update_product_config الأصلية (p_status product_status)
--    لتستخدم is_admin_user() المُصلَحة
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_product_config(
  p_product_id    text,
  p_is_visible    boolean        DEFAULT NULL,
  p_is_enabled    boolean        DEFAULT NULL,
  p_status        product_status DEFAULT NULL,
  p_price         numeric        DEFAULT NULL,
  p_units         integer        DEFAULT NULL,
  p_validity      text           DEFAULT NULL,
  p_net_balance   numeric        DEFAULT NULL,
  p_profit_margin numeric        DEFAULT NULL,
  p_sort_order    integer        DEFAULT NULL,
  p_api_override  jsonb          DEFAULT NULL,
  p_notes         text           DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  UPDATE product_config SET
    is_visible    = COALESCE(p_is_visible,    is_visible),
    is_enabled    = COALESCE(p_is_enabled,    is_enabled),
    status        = COALESCE(p_status,        status),
    price         = COALESCE(p_price,         price),
    units         = COALESCE(p_units,         units),
    validity      = COALESCE(p_validity,      validity),
    net_balance   = COALESCE(p_net_balance,   net_balance),
    profit_margin = COALESCE(p_profit_margin, profit_margin),
    sort_order    = COALESCE(p_sort_order,    sort_order),
    api_override  = COALESCE(p_api_override,  api_override),
    notes         = COALESCE(p_notes,         notes),
    updated_by    = auth.uid()
  WHERE product_id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user()           TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_config(
  text, boolean, boolean, product_status, numeric, integer, text, numeric, numeric, integer, jsonb, text
)                                                          TO authenticated, service_role;
