-- ══════════════════════════════════════════════════════════════════════
-- استعادة جميع الاشتراكات المعلقة (is_paused=true)
-- ══════════════════════════════════════════════════════════════════════

-- 1. الاشتراكات المدفوعة (12) — رجّع active
UPDATE subscriptions
SET
  status        = 'active',
  is_paused     = false,
  paused_status = NULL,
  paused_at     = NULL,
  suspend_reason = NULL,
  updated_at    = now()
WHERE
  status    = 'suspended'
  AND is_paused  = true
  AND code_type  = 'paid';

-- 2. الاشتراكات المجانية الصالحة (expires_at > now) — رجّع active
UPDATE subscriptions
SET
  status        = 'active',
  is_paused     = false,
  paused_status = NULL,
  paused_at     = NULL,
  suspend_reason = NULL,
  updated_at    = now()
WHERE
  status     = 'suspended'
  AND is_paused   = true
  AND code_type   = 'trial'
  AND expires_at  > now();

-- 3. الاشتراكات المجانية المنتهية (expires_at <= now) — اجعلها expired
UPDATE subscriptions
SET
  status        = 'expired',
  is_paused     = false,
  paused_status = NULL,
  paused_at     = NULL,
  suspend_reason = NULL,
  updated_at    = now()
WHERE
  status     = 'suspended'
  AND is_paused   = true
  AND code_type   = 'trial'
  AND expires_at  <= now();