
-- ══════════════════════════════════════════════════════════════════
-- Phase 10: Merchant Client Control Center — ADDITIVE ONLY
-- ══════════════════════════════════════════════════════════════════

-- ─── merchant_control_config ─────────────────────────────────────
-- سجل واحد لكل تاجر — جميع مفاتيح التحكم اللحظي
CREATE TABLE IF NOT EXISTS merchant_control_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID UNIQUE NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- مفاتيح التحكم الرئيسية
  kill_switch       BOOLEAN NOT NULL DEFAULT false,
  maintenance_mode  BOOLEAN NOT NULL DEFAULT false,
  force_update      BOOLEAN NOT NULL DEFAULT false,
  force_logout      BOOLEAN NOT NULL DEFAULT false,

  -- إعدادات الإصدار
  app_version       TEXT,
  min_version       TEXT,
  config_version    INTEGER NOT NULL DEFAULT 1,

  -- التحكم في الدعوة
  invite_enabled    BOOLEAN NOT NULL DEFAULT true,

  -- رسائل مخصصة
  kill_switch_msg   TEXT DEFAULT 'تم إيقاف هذه النسخة مؤقتاً. يرجى التواصل مع التاجر.',
  maintenance_msg   TEXT DEFAULT 'الخدمة تحت الصيانة حالياً. يرجى المحاولة لاحقاً.',
  force_update_msg  TEXT DEFAULT 'يوجد تحديث إجباري. يرجى تحديث التطبيق للمتابعة.',
  force_update_url  TEXT,

  -- توقيتات آخر تفعيل
  kill_switch_at    TIMESTAMPTZ,
  maintenance_at    TIMESTAMPTZ,
  force_update_at   TIMESTAMPTZ,
  force_logout_at   TIMESTAMPTZ,
  last_config_push  TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcc_merchant ON merchant_control_config(merchant_id);

ALTER TABLE merchant_control_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcc_admin_all ON merchant_control_config FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
-- مستخدم التاجر يقرأ إعدادات تاجره فقط (للـ Realtime)
CREATE POLICY mcc_user_read ON merchant_control_config FOR SELECT USING (
  merchant_id IN (SELECT merchant_id FROM profiles WHERE id = auth.uid() AND merchant_id IS NOT NULL)
);

-- إنشاء سجل افتراضي لكل تاجر موجود
INSERT INTO merchant_control_config (merchant_id)
SELECT id FROM merchants
ON CONFLICT (merchant_id) DO NOTHING;

-- ─── merchant_admin_audit_log ─────────────────────────────────────
-- سجل كل إجراء إداري
CREATE TABLE IF NOT EXISTS merchant_admin_audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  admin_id       UUID NOT NULL,
  action         TEXT NOT NULL,
  reason         TEXT,
  metadata       JSONB DEFAULT '{}',
  correlation_id TEXT DEFAULT gen_random_uuid()::TEXT,
  ip_address     TEXT,
  device_info    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maal_merchant ON merchant_admin_audit_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_maal_admin    ON merchant_admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_maal_action   ON merchant_admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_maal_created  ON merchant_admin_audit_log(created_at DESC);

ALTER TABLE merchant_admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY maal_admin_all ON merchant_admin_audit_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- ─── merchant_heartbeats ──────────────────────────────────────────
-- صحة الاتصال لكل مستخدم تاجر
CREATE TABLE IF NOT EXISTS merchant_heartbeats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id          UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_version          TEXT,
  config_version       INTEGER DEFAULT 0,
  is_online            BOOLEAN DEFAULT true,
  realtime_connected   BOOLEAN DEFAULT true,
  notification_ok      BOOLEAN DEFAULT true,
  db_sync_ok           BOOLEAN DEFAULT true,
  connection_quality   TEXT DEFAULT 'good'
    CHECK (connection_quality IN ('excellent','good','fair','poor','offline')),
  last_heartbeat_at    TIMESTAMPTZ DEFAULT NOW(),
  last_api_at          TIMESTAMPTZ,
  last_sync_at         TIMESTAMPTZ,
  last_activity_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mhb_merchant ON merchant_heartbeats(merchant_id);
CREATE INDEX IF NOT EXISTS idx_mhb_user     ON merchant_heartbeats(user_id);
CREATE INDEX IF NOT EXISTS idx_mhb_online   ON merchant_heartbeats(is_online, last_heartbeat_at DESC);

ALTER TABLE merchant_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY mhb_admin_all ON merchant_heartbeats FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY mhb_user_own ON merchant_heartbeats FOR ALL USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════
-- RPC: admin_merchant_action
-- نقطة تحكم موحدة لجميع إجراءات الأدمن على التاجر
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_merchant_action(
  p_merchant_id UUID,
  p_action      TEXT,
  p_admin_id    UUID,
  p_reason      TEXT    DEFAULT NULL,
  p_metadata    JSONB   DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant merchants%ROWTYPE;
  v_msg      TEXT := 'تم تنفيذ الإجراء بنجاح';
BEGIN
  -- التحقق من صلاحيات الأدمن
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND role IN ('admin','super_admin')
  ) THEN
    RETURN jsonb_build_object('success',false,'error','unauthorized');
  END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','merchant_not_found');
  END IF;

  -- ضمان وجود سجل control_config
  INSERT INTO merchant_control_config (merchant_id)
  VALUES (p_merchant_id)
  ON CONFLICT (merchant_id) DO NOTHING;

  -- تنفيذ الإجراء المطلوب
  CASE p_action

    WHEN 'enable' THEN
      UPDATE merchants SET status='active', updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config SET kill_switch=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل التاجر';

    WHEN 'disable' THEN
      UPDATE merchants SET status='disabled', updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config SET kill_switch=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تعطيل التاجر';

    WHEN 'suspend' THEN
      UPDATE merchants SET status='suspended', updated_at=NOW() WHERE id=p_merchant_id;
      v_msg := 'تم إيقاف التاجر مؤقتاً';

    WHEN 'resume' THEN
      UPDATE merchants SET status='active', updated_at=NOW() WHERE id=p_merchant_id;
      v_msg := 'تم استئناف التاجر';

    WHEN 'kill_switch_on' THEN
      UPDATE merchant_control_config
      SET kill_switch=true, kill_switch_at=NOW(), updated_at=NOW(), config_version=config_version+1,
          kill_switch_msg=COALESCE(p_metadata->>'message', kill_switch_msg)
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل Kill Switch';

    WHEN 'kill_switch_off' THEN
      UPDATE merchant_control_config
      SET kill_switch=false, updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إيقاف Kill Switch';

    WHEN 'maintenance_on' THEN
      UPDATE merchant_control_config
      SET maintenance_mode=true, maintenance_at=NOW(), updated_at=NOW(), config_version=config_version+1,
          maintenance_msg=COALESCE(p_metadata->>'message', maintenance_msg)
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل وضع الصيانة';

    WHEN 'maintenance_off' THEN
      UPDATE merchant_control_config
      SET maintenance_mode=false, updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إيقاف وضع الصيانة';

    WHEN 'force_update_on' THEN
      UPDATE merchant_control_config
      SET force_update=true, force_update_at=NOW(), updated_at=NOW(), config_version=config_version+1,
          force_update_msg=COALESCE(p_metadata->>'message', force_update_msg),
          min_version=COALESCE(p_metadata->>'min_version', min_version)
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل التحديث الإجباري';

    WHEN 'force_update_off' THEN
      UPDATE merchant_control_config
      SET force_update=false, updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إيقاف التحديث الإجباري';

    WHEN 'force_logout' THEN
      UPDATE merchant_control_config
      SET force_logout=true, force_logout_at=NOW(), updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      -- إشعار لجميع مستخدمي التاجر
      INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
      SELECT p.id, '⚠️ تسجيل خروج إجباري', 'تم تسجيل خروجك من قِبل المسؤول.', 'force_logout', false, false
      FROM profiles p WHERE p.merchant_id = p_merchant_id;
      v_msg := 'تم تفعيل تسجيل الخروج الإجباري';

    WHEN 'force_logout_clear' THEN
      UPDATE merchant_control_config
      SET force_logout=false, updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم مسح علامة Force Logout';

    WHEN 'force_sync' THEN
      UPDATE merchant_control_config
      SET last_config_push=NOW(), updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إرسال أمر المزامنة الإجبارية';

    WHEN 'force_refresh_config' THEN
      UPDATE merchant_control_config
      SET last_config_push=NOW(), updated_at=NOW(), config_version=config_version+1
      WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إرسال أمر تحديث الإعدادات';

    WHEN 'invite_enable' THEN
      UPDATE merchants SET invite_enabled=true, updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config SET invite_enabled=true, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل الدعوة';

    WHEN 'invite_disable' THEN
      UPDATE merchants SET invite_enabled=false, updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config SET invite_enabled=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تعطيل الدعوة';

    WHEN 'invite_regenerate' THEN
      UPDATE merchant_invites SET status='disabled', updated_at=NOW() WHERE merchant_id=p_merchant_id AND status='active';
      INSERT INTO merchant_invites (merchant_id, token, status)
      VALUES (p_merchant_id, encode(gen_random_bytes(24), 'base64url'), 'active');
      UPDATE merchant_control_config SET config_version=config_version+1, updated_at=NOW() WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إعادة توليد رابط الدعوة';

    ELSE
      RETURN jsonb_build_object('success',false,'error','unknown_action','action',p_action);
  END CASE;

  -- تسجيل في Audit Log
  INSERT INTO merchant_admin_audit_log (merchant_id, admin_id, action, reason, metadata)
  VALUES (p_merchant_id, p_admin_id, p_action, p_reason, COALESCE(p_metadata,'{}'));

  RETURN jsonb_build_object('success',true,'message',v_msg,'action',p_action);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_merchant_action(UUID,TEXT,UUID,TEXT,JSONB) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: get_merchant_live_stats
-- إحصائيات لحظية للتاجر من لوحة الأدمن
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_merchant_live_stats(p_merchant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; cfg RECORD;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE h.is_online AND h.last_heartbeat_at > NOW()-INTERVAL '5 minutes') AS online_now,
    COUNT(*)                                                                                   AS total_connected,
    MAX(h.last_heartbeat_at)                                                                   AS last_heartbeat,
    MAX(h.last_activity_at)                                                                    AS last_activity,
    MAX(h.last_sync_at)                                                                        AS last_sync,
    COUNT(*) FILTER (WHERE h.connection_quality IN ('excellent','good'))                       AS healthy_connections,
    COUNT(*) FILTER (WHERE h.connection_quality IN ('poor','offline'))                         AS poor_connections
  INTO r FROM merchant_heartbeats h WHERE h.merchant_id = p_merchant_id;

  SELECT * INTO cfg FROM merchant_control_config WHERE merchant_id = p_merchant_id;

  RETURN jsonb_build_object(
    'success',true,
    'online_now',         COALESCE(r.online_now,0),
    'total_connected',    COALESCE(r.total_connected,0),
    'last_heartbeat',     r.last_heartbeat,
    'last_activity',      r.last_activity,
    'last_sync',          r.last_sync,
    'healthy_connections',COALESCE(r.healthy_connections,0),
    'poor_connections',   COALESCE(r.poor_connections,0),
    'kill_switch',        COALESCE(cfg.kill_switch,false),
    'maintenance_mode',   COALESCE(cfg.maintenance_mode,false),
    'force_update',       COALESCE(cfg.force_update,false),
    'config_version',     COALESCE(cfg.config_version,1)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_merchant_live_stats(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: upsert_merchant_heartbeat
-- يُرسله العميل كل 30 ثانية للإشارة بالاتصال
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION upsert_merchant_heartbeat(
  p_user_id           UUID,
  p_app_version       TEXT    DEFAULT NULL,
  p_config_version    INTEGER DEFAULT 0,
  p_realtime_ok       BOOLEAN DEFAULT true,
  p_notification_ok   BOOLEAN DEFAULT true,
  p_db_sync_ok        BOOLEAN DEFAULT true,
  p_connection_quality TEXT   DEFAULT 'good'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_merchant_id UUID;
  v_cfg         merchant_control_config%ROWTYPE;
BEGIN
  SELECT merchant_id INTO v_merchant_id FROM profiles WHERE id = p_user_id;
  IF v_merchant_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_merchant_client'); END IF;

  INSERT INTO merchant_heartbeats (
    merchant_id, user_id, app_version, config_version,
    is_online, realtime_connected, notification_ok, db_sync_ok,
    connection_quality, last_heartbeat_at, last_activity_at
  ) VALUES (
    v_merchant_id, p_user_id, p_app_version, p_config_version,
    true, p_realtime_ok, p_notification_ok, p_db_sync_ok,
    COALESCE(p_connection_quality,'good'), NOW(), NOW()
  )
  ON CONFLICT (merchant_id, user_id) DO UPDATE SET
    app_version        = EXCLUDED.app_version,
    config_version     = EXCLUDED.config_version,
    is_online          = true,
    realtime_connected = EXCLUDED.realtime_connected,
    notification_ok    = EXCLUDED.notification_ok,
    db_sync_ok         = EXCLUDED.db_sync_ok,
    connection_quality = EXCLUDED.connection_quality,
    last_heartbeat_at  = NOW(),
    last_activity_at   = NOW(),
    updated_at         = NOW();

  -- إرجاع الإعدادات الحالية للعميل
  SELECT * INTO v_cfg FROM merchant_control_config WHERE merchant_id = v_merchant_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'kill_switch',    COALESCE(v_cfg.kill_switch,false),
    'maintenance',    COALESCE(v_cfg.maintenance_mode,false),
    'force_update',   COALESCE(v_cfg.force_update,false),
    'force_logout',   COALESCE(v_cfg.force_logout,false),
    'config_version', COALESCE(v_cfg.config_version,1),
    'min_version',    v_cfg.min_version,
    'kill_msg',       v_cfg.kill_switch_msg,
    'maintenance_msg',v_cfg.maintenance_msg,
    'force_update_msg',v_cfg.force_update_msg
  );
END;
$$;
GRANT EXECUTE ON FUNCTION upsert_merchant_heartbeat(UUID,TEXT,INTEGER,BOOLEAN,BOOLEAN,BOOLEAN,TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: get_merchant_audit_log
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_merchant_audit_log(
  p_merchant_id UUID, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows JSONB; v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM merchant_admin_audit_log WHERE merchant_id=p_merchant_id;
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',l.id,'action',l.action,'reason',l.reason,'metadata',l.metadata,
      'created_at',l.created_at,'admin_username',p.username,'correlation_id',l.correlation_id
    ) ORDER BY l.created_at DESC
  ) INTO v_rows
  FROM merchant_admin_audit_log l
  LEFT JOIN profiles p ON p.id=l.admin_id
  WHERE l.merchant_id=p_merchant_id
  LIMIT p_limit OFFSET p_offset;
  RETURN jsonb_build_object('success',true,'total',v_total,'rows',COALESCE(v_rows,'[]'::JSONB));
END;
$$;
GRANT EXECUTE ON FUNCTION get_merchant_audit_log(UUID,INTEGER,INTEGER) TO authenticated;
