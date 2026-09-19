
-- إصلاح نهائي: update_product_config تستدعي is_admin_user(uuid) صراحةً
-- لتجنب التعارض بين is_admin_user() و is_admin_user(uuid)
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
  -- نستدعي is_admin_user(uuid) صراحةً لتجنب التعارض
  IF NOT public.is_admin_user(auth.uid()) THEN
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

-- كذلك get_product_config تستدعي is_admin_user() بدون args — نُصلحها
CREATE OR REPLACE FUNCTION public.get_product_config()
RETURNS TABLE (
  product_id    text,
  display_name  text,
  category      text,
  is_visible    boolean,
  is_enabled    boolean,
  status        product_status,
  price         numeric,
  units         integer,
  validity      text,
  net_balance   numeric,
  profit_margin numeric,
  sort_order    integer,
  api_override  jsonb,
  notes         text,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_valid  BOOLEAN := false;
  v_is_admin  BOOLEAN := false;
BEGIN
  -- استدعاء is_admin_user(uuid) صراحةً
  BEGIN
    v_is_admin := public.is_admin_user(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF v_is_admin THEN
    RETURN QUERY
    SELECT c.product_id, c.display_name, c.category,
           c.is_visible, c.is_enabled, c.status,
           c.price, c.units, c.validity, c.net_balance, c.profit_margin,
           c.sort_order, c.api_override, c.notes, c.updated_at
    FROM product_config c
    ORDER BY c.sort_order ASC;
    RETURN;
  END IF;

  BEGIN
    v_is_valid := is_valid_app_version();
  EXCEPTION WHEN OTHERS THEN
    v_is_valid := false;
  END;

  IF v_is_valid THEN
    RETURN QUERY
    SELECT c.product_id, c.display_name, c.category,
           c.is_visible, c.is_enabled, c.status,
           c.price, c.units, c.validity, c.net_balance, c.profit_margin,
           c.sort_order, c.api_override, c.notes, c.updated_at
    FROM product_config c
    ORDER BY c.sort_order ASC;
  ELSE
    RETURN QUERY
    SELECT c.product_id, c.display_name, c.category,
           false::boolean, false::boolean,
           'unavailable'::product_status,
           999999.00::numeric, 0::integer, 'محظور'::text,
           0.00::numeric, 0.00::numeric,
           c.sort_order, c.api_override, 'BURNED'::text, now()
    FROM product_config c
    ORDER BY c.sort_order ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_config(
  text, boolean, boolean, product_status, numeric, integer, text, numeric, numeric, integer, jsonb, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_config() TO authenticated, anon, service_role;
