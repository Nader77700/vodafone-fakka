
-- ══════════════════════════════════════════════════════════════
-- 1. حذف أي subscriptions مكررة للمستخدم نفسه (أبقِ الأحدث)
-- ══════════════════════════════════════════════════════════════
DELETE FROM public.subscriptions a
USING public.subscriptions b
WHERE a.user_id = b.user_id
  AND a.id < b.id;

-- ══════════════════════════════════════════════════════════════
-- 2. إضافة UNIQUE constraint على user_id
--    (هذا ما كان مفقوداً — بدونه يفشل upsert onConflict:'user_id')
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
