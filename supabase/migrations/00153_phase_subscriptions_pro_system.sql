
-- ══════════════════════════════════════════════════════════════════
-- PHASE: نظام الاشتراكات والأكواد الاحترافي
-- ══════════════════════════════════════════════════════════════════

-- 1. إضافة حقول التعليق / الإلغاء / الاستبدال / الأرشفة لجدول subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS suspend_reason     TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason      TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replace_reason     TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replace_notes      TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspended_at       TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replaced_at        TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replaced_by_sub_id UUID     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_archived        BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS modified_by        UUID     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS code_type          TEXT     DEFAULT 'paid';

-- 2. إضافة حقول للسجل التاريخي
ALTER TABLE subscription_history
  ADD COLUMN IF NOT EXISTS operation_type   TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS performed_by     UUID     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspend_reason   TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason    TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replace_reason  TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS days_remaining_at_end INT DEFAULT NULL;

-- 3. إضافة حقل code_status للأكواد (حالة مستقلة لعرض الـ badge)
ALTER TYPE public.license_key_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE public.license_key_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.license_key_status ADD VALUE IF NOT EXISTS 'archived';
ALTER TYPE public.license_key_status ADD VALUE IF NOT EXISTS 'replaced';
ALTER TYPE public.license_key_status ADD VALUE IF NOT EXISTS 'trial';

-- 4. جدول سجل العمليات الكاملة (دائم للأبد)
CREATE TABLE IF NOT EXISTS subscription_operations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID        REFERENCES subscriptions(id) ON DELETE SET NULL,
  license_key_id  UUID        REFERENCES license_keys(id)  ON DELETE SET NULL,
  code            TEXT        DEFAULT NULL,
  operation_type  TEXT        NOT NULL,
  -- activation | renewal | extension | suspension | unsuspension
  -- cancellation | reactivation | replacement | archival | restoration
  -- merge | trial_start | trial_end
  reason          TEXT        DEFAULT NULL,
  notes           TEXT        DEFAULT NULL,
  days_before     INT         DEFAULT NULL,
  days_after      INT         DEFAULT NULL,
  expires_before  TIMESTAMPTZ DEFAULT NULL,
  expires_after   TIMESTAMPTZ DEFAULT NULL,
  performed_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by_name TEXT      DEFAULT NULL,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB       DEFAULT '{}'
);

-- RLS
ALTER TABLE subscription_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_sub_ops" ON subscription_operations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );
CREATE POLICY "users_own_sub_ops" ON subscription_operations
  FOR SELECT USING (user_id = auth.uid());

-- فهارس
CREATE INDEX IF NOT EXISTS idx_sub_ops_user       ON subscription_operations(user_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_ops_type       ON subscription_operations(operation_type, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_ops_sub        ON subscription_operations(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_ops_by         ON subscription_operations(performed_by, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_history_op     ON subscription_history(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_archived      ON subscriptions(user_id, is_archived, status);
CREATE INDEX IF NOT EXISTS idx_subs_modified_by   ON subscriptions(modified_by);
