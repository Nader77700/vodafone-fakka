
-- 1. توسيع ENUM notification_type
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_expiry';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_activated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_failed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'update_available';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'update_downloaded';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'update_installed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'update_critical';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'message';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'announcement';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'offer';

-- 2. إضافة أعمدة جديدة لجدول notifications
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. جدول fcm_tokens
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_info JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fcm_tokens_own_read"   ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_own_insert" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_own_update" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_own_delete" ON fcm_tokens;
DROP POLICY IF EXISTS "fcm_tokens_admin_all"  ON fcm_tokens;
CREATE POLICY "fcm_tokens_own_read"   ON fcm_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fcm_tokens_own_insert" ON fcm_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fcm_tokens_own_update" ON fcm_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "fcm_tokens_own_delete" ON fcm_tokens FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "fcm_tokens_admin_all"  ON fcm_tokens FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 4. جدول notification_deliveries
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  push_sent BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_nd_notification_id ON notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_nd_user_id ON notification_deliveries(user_id);
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nd_own_read"   ON notification_deliveries;
DROP POLICY IF EXISTS "nd_own_insert" ON notification_deliveries;
DROP POLICY IF EXISTS "nd_own_update" ON notification_deliveries;
DROP POLICY IF EXISTS "nd_admin_all"  ON notification_deliveries;
CREATE POLICY "nd_own_read"   ON notification_deliveries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nd_own_insert" ON notification_deliveries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nd_own_update" ON notification_deliveries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "nd_admin_all"  ON notification_deliveries FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 5. جدول scheduled_notifications
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  action_url TEXT,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all','specific')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sn_scheduled_at ON scheduled_notifications(scheduled_at) WHERE sent_at IS NULL;
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sn_admin_all" ON scheduled_notifications;
CREATE POLICY "sn_admin_all" ON scheduled_notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 6. دالة مساعدة لحذف ناعم وقراءة الكل
CREATE OR REPLACE FUNCTION get_unread_notifications_count(p_user_id UUID)
RETURNS INT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(*)::INT FROM notifications
  WHERE (user_id = p_user_id OR is_global = TRUE)
    AND is_read = FALSE
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION soft_delete_all_notifications(p_user_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE notifications SET deleted_at = now()
  WHERE (user_id = p_user_id OR is_global = TRUE) AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE notifications SET is_read = TRUE
  WHERE (user_id = p_user_id OR is_global = TRUE) AND is_read = FALSE;
$$;
