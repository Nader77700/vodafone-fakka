-- P5: إصلاح UNIQUE constraint في gift_claims
-- القديم: UNIQUE(user_id) — يمنع المستخدم من الحصول على هدايا مختلفة مستقبلاً
-- الجديد: UNIQUE(user_id, license_key_id) — يمنع العد المكرر لنفس الكود فقط

-- حذف الـ constraint القديم
ALTER TABLE public.gift_claims
  DROP CONSTRAINT IF EXISTS gift_claims_user_id_key;

-- إضافة الـ constraint الجديد (user_id + license_key_id فريد معاً)
ALTER TABLE public.gift_claims
  ADD CONSTRAINT gift_claims_user_license_unique UNIQUE (user_id, license_key_id);

-- حذف السجلات المعلقة (pending) غير المكتملة — نسخ لم تتم
-- هذه ناتجة عن الخلل القديم الذي كان يُسجل عند الفتح وليس النسخ
DELETE FROM public.gift_claims WHERE status = 'pending';