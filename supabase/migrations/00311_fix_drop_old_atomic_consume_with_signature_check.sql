
-- حذف النسخة القديمة التي تحتوي verify_request_signature (تعطل الشحن)
-- النسخة القديمة: atomic_consume_operation(p_user_id uuid) — بدون p_is_trial
-- النسخة الجديدة الصحيحة: atomic_consume_operation(p_user_id uuid, p_is_trial boolean DEFAULT false)
DROP FUNCTION IF EXISTS public.atomic_consume_operation(uuid);

-- تأكيد أن النسخة الجديدة موجودة وسليمة
SELECT proname, pg_get_function_arguments(oid) 
FROM pg_proc 
WHERE proname = 'atomic_consume_operation' 
  AND pronamespace = 'public'::regnamespace;
