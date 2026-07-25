
-- ══════════════════════════════════════════════════════════
-- 1. ملء ops_limit في subscriptions من license_keys مباشرةً
--    لكل الاشتراكات التي لديها ops_limit = NULL
--    وكودها لديه operations_per_user > 0
-- ══════════════════════════════════════════════════════════
UPDATE subscriptions s
SET 
  ops_limit     = lk.operations_per_user,
  ops_remaining = GREATEST(0, lk.operations_per_user - COALESCE(s.ops_count, 0)),
  updated_at    = now()
FROM license_keys lk
WHERE s.license_key_id = lk.id
  AND s.ops_limit IS NULL
  AND lk.operations_per_user IS NOT NULL
  AND lk.operations_per_user > 0;

-- ══════════════════════════════════════════════════════════
-- 2. Trigger: كل تفعيل اشتراك جديد يملأ ops_limit تلقائياً
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_ops_limit_from_key()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ops_limit INT;
BEGIN
  -- إذا ops_limit فارغ وlicense_key_id موجود
  IF NEW.ops_limit IS NULL AND NEW.license_key_id IS NOT NULL THEN
    SELECT operations_per_user INTO v_ops_limit
    FROM license_keys
    WHERE id = NEW.license_key_id;
    
    IF v_ops_limit IS NOT NULL AND v_ops_limit > 0 THEN
      NEW.ops_limit     := v_ops_limit;
      NEW.ops_remaining := GREATEST(0, v_ops_limit - COALESCE(NEW.ops_count, 0));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ops_limit ON subscriptions;
CREATE TRIGGER trg_sync_ops_limit
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_sync_ops_limit_from_key();

-- ══════════════════════════════════════════════════════════
-- 3. تحديث ops_remaining لكل الاشتراكات الفعلية
-- ══════════════════════════════════════════════════════════
UPDATE subscriptions
SET ops_remaining = GREATEST(0, ops_limit - COALESCE(ops_count, 0))
WHERE ops_limit IS NOT NULL
  AND status = 'active';
