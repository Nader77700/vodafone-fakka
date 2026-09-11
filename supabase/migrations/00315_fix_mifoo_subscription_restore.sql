
-- إصلاح اشتراك Mifoo: إعادة تفعيله (كان cancelled بسبب bug)
-- الكود NADER-QTXG-ZPX4 مفعّل بتاريخ 2026-09-11 15:49 ولسه فاضل ~23 ساعة
UPDATE subscriptions
SET 
  status = 'active',
  cancel_reason = NULL,
  cancelled_at = NULL,
  updated_at = now()
WHERE user_id = (SELECT id FROM profiles WHERE username = 'Mifoo')
  AND status = 'cancelled'
  AND code_used = 'NADER-QTXG-ZPX4'
  AND expires_at > now();

-- تحديث subscription_history بنفس الطريقة
UPDATE subscription_history
SET status = 'active', end_reason = NULL
WHERE user_id = (SELECT id FROM profiles WHERE username = 'Mifoo')
  AND code = 'NADER-QTXG-ZPX4'
  AND expires_at > now();
