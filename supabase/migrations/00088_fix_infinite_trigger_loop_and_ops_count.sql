
-- ① إصلاح auto_expire_subscriptions: إضافة guard لمنع التعاود اللانهائي
-- المشكلة: trigger على UPDATE يستدعي UPDATE على نفس الجدول → infinite recursion
CREATE OR REPLACE FUNCTION public.auto_expire_subscriptions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- guard: نشغّل فقط عند INSERT أو عند تغيير expires_at أو status
  -- نتجنب UPDATE ↔ trigger ↔ UPDATE loop بالتحقق من NEW vs OLD
  IF TG_OP = 'UPDATE' THEN
    -- فقط نعمل expire للصف الحالي إذا انتهى وقته
    IF NEW.status = 'active'
       AND NEW.expires_at IS NOT NULL
       AND NEW.expires_at < now() THEN
      NEW.status     := 'expired';
      NEW.updated_at := now();
    END IF;
    RETURN NEW;
  END IF;
  -- INSERT: لا نفعل شيئاً هنا
  RETURN NEW;
END;
$$;

-- تحويل trigger من AFTER إلى BEFORE حتى يعدّل NEW مباشرةً بدون UPDATE ثانية
DROP TRIGGER IF EXISTS trg_auto_expire ON subscriptions;
CREATE TRIGGER trg_auto_expire
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION auto_expire_subscriptions();

-- ② استرداد 13 عملية فاشلة لـ Ahmedaly223344 (ops_count 18 → 5 ناجحة فقط)
UPDATE subscriptions
SET ops_count  = 5,
    updated_at = now()
WHERE user_id = '5b8a3374-2ffb-4693-b535-033729375cb9';
