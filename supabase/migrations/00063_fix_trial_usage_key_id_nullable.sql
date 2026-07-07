
-- المشكلة: عمود key_id في trial_usage عنده NOT NULL
-- لكن RPC الجديد يستخدم license_key_id فقط ويترك key_id فارغاً
-- الحل: نجعل key_id قابلاً للـ NULL + نحدّث RPC ليملأ الاثنين معاً

-- الخطوة 1: اجعل key_id قابلاً للـ NULL (للتوافق مع الكود الجديد)
ALTER TABLE trial_usage ALTER COLUMN key_id DROP NOT NULL;
