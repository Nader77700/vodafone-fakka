-- إصلاح جدول preview_mode_logs: إضافة قيد فريد على user_id لتعمل ON CONFLICT
-- قد يكون هناك صفوف مكررة؛ نحذف التكرارات ونبقي أحدث entered_at

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY entered_at DESC) AS rn
  FROM public.preview_mode_logs
)
DELETE FROM public.preview_mode_logs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.preview_mode_logs
  ADD CONSTRAINT preview_mode_logs_user_id_key UNIQUE (user_id);

-- التأكد من أن دالة enter_preview_mode تستخدم القيد الجديد
CREATE OR REPLACE FUNCTION public.enter_preview_mode(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.core_profiles
  SET access_mode = 'preview',
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.preview_mode_logs (user_id, entered_at)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET entered_at = EXCLUDED.entered_at,
        converted_at = NULL,
        updated_at = NOW();

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enter_preview_mode failed: %', SQLERRM;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_preview_mode(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_preview_to_subscribed(uuid) TO authenticated;