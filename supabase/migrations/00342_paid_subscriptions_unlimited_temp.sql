-- ══════════════════════════════════════════════════════════════════════
-- جعل الاشتراكات المدفوعة النشطة غير محدودة الأيام والعمليات (مؤقتاً)
-- يحفظ القيم الأصلية في حقول جديدة للرجوع إليها لاحقاً
-- ══════════════════════════════════════════════════════════════════════

-- أضف أعمدة backup إذا لم تكن موجودة
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS orig_expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS orig_ops_limit      integer,
  ADD COLUMN IF NOT EXISTS orig_ops_remaining  integer,
  ADD COLUMN IF NOT EXISTS made_unlimited_at   timestamptz;

-- حفظ القيم الأصلية ثم تعيين unlimited
UPDATE subscriptions
SET
  -- احتفظ بالقيم الأصلية (للرجوع لاحقاً)
  orig_expires_at    = COALESCE(orig_expires_at,    expires_at),
  orig_ops_limit     = COALESCE(orig_ops_limit,     ops_limit),
  orig_ops_remaining = COALESCE(orig_ops_remaining, ops_remaining),
  made_unlimited_at  = COALESCE(made_unlimited_at,  now()),
  -- تعيين unlimited
  expires_at         = NULL,
  ops_limit          = NULL,
  ops_remaining      = NULL,
  updated_at         = now()
WHERE
  status    = 'active'
  AND code_type = 'paid';