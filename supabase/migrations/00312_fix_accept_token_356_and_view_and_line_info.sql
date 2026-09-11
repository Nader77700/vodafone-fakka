
-- ═══════════════════════════════════════════════════════════════════
-- 1. تحديث is_valid_app_version() لتقبل token 356
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_valid_app_version()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req_headers jsonb;
  secure_token text;
  v_app_build int;
  v_jwt_role text;
BEGIN
  -- Bypass for service_role (Edge Functions)
  BEGIN
    v_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role = 'service_role' THEN
    RETURN true;
  END IF;

  BEGIN
    v_req_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_req_headers := NULL;
  END;

  IF v_req_headers IS NULL THEN
    RETURN false;
  END IF;

  -- Bypass for localhost/vodafone web origins
  IF (v_req_headers->>'origin') LIKE '%localhost%'
  OR (v_req_headers->>'origin') LIKE '%vodafone%' THEN
    RETURN true;
  END IF;

  secure_token := v_req_headers->>'x-app-secure-token';

  IF v_req_headers ? 'x-app-build' THEN
    v_app_build := (v_req_headers->>'x-app-build')::int;
  ELSE
    v_app_build := 0;
  END IF;

  -- ✅ قبول token 356 (الإصدار الجديد v3.5.24 / code 504)
  IF secure_token = 'vfp_secure_356_kill_switch' THEN
    RETURN true;
  END IF;

  -- ✅ قبول token 355 (الإصدار السابق — للتوافق العكسي)
  IF secure_token = 'vfp_secure_355_kill_switch' THEN
    RETURN true;
  END IF;

  -- قبول versionCode >= 504 مباشرة
  IF v_app_build >= 504 THEN
    RETURN true;
  END IF;

  -- EMERGENCY FIX legacy: 355 APK built with old 354 token
  IF secure_token = 'vfp_secure_354_omega' AND v_app_build >= 355 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. تحديث balance_products VIEW لتقبل token 355 و 356 كلاهما
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.balance_products AS
SELECT
  id,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN product_id
    ELSE 'BURNED_VERSION_DO_NOT_USE_' || id::text
  END AS product_id,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN name
    ELSE '⚠️ تم تدمير وحرق هذه النسخة ⚠️'
  END AS name,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN display_name
    ELSE 'النسخة مهكرة ومحروقة'
  END AS display_name,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN category
    ELSE 'banned'
  END AS category,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN price
    ELSE 999999.00
  END AS price,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN net_balance
    ELSE 0.00
  END AS net_balance,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN units
    ELSE 0
  END AS units,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN product_type
    ELSE 'banned'
  END AS product_type,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN validity
    ELSE '0'
  END AS validity,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN is_visible
    ELSE true
  END AS is_visible,
  CASE
    WHEN (current_setting('request.headers', true)::jsonb ->> 'x-app-secure-token')
         IN ('vfp_secure_356_kill_switch', 'vfp_secure_355_kill_switch')
    THEN is_enabled
    ELSE false
  END AS is_enabled,
  sort_order,
  notes,
  usage_count,
  success_count,
  fail_count,
  last_used_at,
  created_at,
  updated_at,
  is_poison
FROM core_balance_products;

-- ═══════════════════════════════════════════════════════════════════
-- 3. تحقق — عدد الصفوف في كل جدول
-- ═══════════════════════════════════════════════════════════════════
SELECT
  (SELECT COUNT(*) FROM core_balance_products) AS core_rows,
  (SELECT COUNT(*) FROM core_balance_products WHERE category = 'fakka') AS fakka_rows,
  (SELECT COUNT(*) FROM core_balance_products WHERE category = 'mared') AS mared_rows;
