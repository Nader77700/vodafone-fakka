
-- ══════════════════════════════════════════════════════════════════
-- Phase 11 Fixes — Production Validation
-- ══════════════════════════════════════════════════════════════════

-- B2 FIX: إضافة قيم مفقودة في notification_type enum
-- المشكلة: Phase 10 admin_merchant_action يُدرج type='force_logout'
--          لكن هذه القيمة غير موجودة في الـ ENUM → سيفشل INSERT
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'force_logout';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'merchant_control';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'kill_switch';

-- B5 FIX: invite_regenerate في admin_merchant_action كانت تستخدم
--         encode(...,'base64url') وهو غير مدعوم في PostgreSQL.
--         نُعيد تعريف الدالة باستخدام _gen_invite_token() الموجودة مسبقاً.
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

  CASE p_action

    WHEN 'enable' THEN
      UPDATE merchants SET status='active', updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config
        SET kill_switch=false, updated_at=NOW(), config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل التاجر';

    WHEN 'disable' THEN
      UPDATE merchants SET status='disabled', updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config
        SET kill_switch=false, updated_at=NOW(), config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تعطيل التاجر';

    WHEN 'suspend' THEN
      UPDATE merchants SET status='suspended', updated_at=NOW() WHERE id=p_merchant_id;
      v_msg := 'تم إيقاف التاجر مؤقتاً';

    WHEN 'resume' THEN
      UPDATE merchants SET status='active', updated_at=NOW() WHERE id=p_merchant_id;
      v_msg := 'تم استئناف التاجر';

    WHEN 'kill_switch_on' THEN
      UPDATE merchant_control_config
        SET kill_switch=true, kill_switch_at=NOW(), updated_at=NOW(),
            config_version=config_version+1,
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
        SET maintenance_mode=true, maintenance_at=NOW(), updated_at=NOW(),
            config_version=config_version+1,
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
        SET force_update=true, force_update_at=NOW(), updated_at=NOW(),
            config_version=config_version+1,
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
        SET force_logout=true, force_logout_at=NOW(), updated_at=NOW(),
            config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      -- B2 FIX: استخدم 'force_logout' الذي أضفناه الآن للـ ENUM
      INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
        SELECT p.id,
               '⚠️ تسجيل خروج إجباري',
               'تم تسجيل خروجك من قِبل المسؤول.',
               'force_logout',
               false, false
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
      UPDATE merchants
        SET invite_enabled=true, updated_at=NOW()
        WHERE id=p_merchant_id;
      UPDATE merchant_control_config
        SET invite_enabled=true, updated_at=NOW(), config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل الدعوة';

    WHEN 'invite_disable' THEN
      UPDATE merchants
        SET invite_enabled=false, updated_at=NOW()
        WHERE id=p_merchant_id;
      UPDATE merchant_control_config
        SET invite_enabled=false, updated_at=NOW(), config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تعطيل الدعوة';

    WHEN 'invite_regenerate' THEN
      -- B5 FIX: استخدم _gen_invite_token() بدلاً من encode(...,'base64url') غير المدعوم
      UPDATE merchant_invites
        SET status='disabled', updated_at=NOW()
        WHERE merchant_id=p_merchant_id AND status='active';
      INSERT INTO merchant_invites (merchant_id, token, status)
        VALUES (p_merchant_id, _gen_invite_token(), 'active');
      UPDATE merchant_control_config
        SET config_version=config_version+1, updated_at=NOW()
        WHERE merchant_id=p_merchant_id;
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
