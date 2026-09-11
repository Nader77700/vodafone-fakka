
-- ══════════════════════════════════════════════════════════════
-- تنظيف السجلات المكررة في subscription_history
-- نحتفظ بالسجل الأحدث (activate_license_key يكتب بـ notes الحقيقي)
-- ونحذف السجلات المكررة من الـ trigger (notes = 'تفعيل تلقائي (trigger)')
-- ══════════════════════════════════════════════════════════════
WITH duplicates AS (
  SELECT
    sh.id,
    sh.user_id,
    sh.license_key_id,
    sh.expires_at,
    sh.notes,
    ROW_NUMBER() OVER (
      PARTITION BY sh.user_id, sh.license_key_id, sh.expires_at
      ORDER BY
        -- نحتفظ بالسجل اللي notes بتاعه مش trigger (الأصلي من activate_license_key)
        CASE WHEN sh.notes = 'تفعيل تلقائي (trigger)' THEN 1 ELSE 0 END,
        sh.created_at DESC
    ) AS rn
  FROM public.subscription_history sh
  WHERE EXISTS (
    SELECT 1 FROM public.subscription_history sh2
    WHERE sh2.user_id        = sh.user_id
      AND sh2.license_key_id = sh.license_key_id
      AND sh2.expires_at     = sh.expires_at
      AND sh2.id != sh.id
  )
)
DELETE FROM public.subscription_history
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
