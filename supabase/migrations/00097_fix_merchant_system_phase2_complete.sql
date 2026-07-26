
-- ════════════════════════════════════════════════════════════
-- PHASE 2: إصلاح نظام التجار الكامل
-- ════════════════════════════════════════════════════════════

-- ── 1. إضافة invite_locked_by_owner لجدول merchants ──────
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS invite_locked_by_owner boolean NOT NULL DEFAULT false;

-- ── 2. إضافة invite_locked_by_owner لـ merchant_control_config ──
ALTER TABLE merchant_control_config
  ADD COLUMN IF NOT EXISTS invite_locked_by_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_locked_at       timestamptz;

-- ── 3. إضافة app_base_url في app_config ──────────────────
INSERT INTO app_config (key, value) 
VALUES ('app_base_url', 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/index.html')
ON CONFLICT (key) DO NOTHING;

-- ── 4. إصلاح RLS على merchant_invites ─────────────────────
-- حذف policy القديمة التي تسمح لـ merchant بـ UPDATE
DROP POLICY IF EXISTS invite_merchant_write ON merchant_invites;
DROP POLICY IF EXISTS invite_merchant_all   ON merchant_invites;

-- منح التاجر SELECT فقط (لا UPDATE/DELETE/INSERT)
DROP POLICY IF EXISTS invite_merchant_read ON merchant_invites;
CREATE POLICY invite_merchant_read ON merchant_invites
  FOR SELECT TO authenticated
  USING (
    merchant_id = (
      SELECT merchant_id FROM profiles
      WHERE id = auth.uid() AND role = 'merchant'
    )
  );

-- ── 5. إصلاح set_invite_token_status: منع التاجر من تغيير الحالة ──
CREATE OR REPLACE FUNCTION public.set_invite_token_status(
  p_merchant_id uuid,
  p_status      text,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role   text;
  v_locked        boolean;
  v_caller_id     uuid := COALESCE(p_admin_id, auth.uid());
  affected        integer;
BEGIN
  IF p_status NOT IN ('active','disabled','expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- تحديد دور المستدعي
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

  -- التحقق من invite_locked_by_owner
  SELECT invite_locked_by_owner INTO v_locked FROM merchants WHERE id = p_merchant_id;

  -- إذا كان مقفلاً من Owner: فقط admin/super_admin يستطيع التغيير
  IF v_locked AND v_caller_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'invite_locked_by_owner',
      'message', 'رابط الدعوة مقفل من قِبل المالك ولا يمكن تغييره'
    );
  END IF;

  -- التاجر نفسه لا يستطيع تغيير الحالة أبداً
  IF v_caller_role = 'merchant' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'merchant_cannot_change_invite_status',
      'message', 'التاجر لا يملك صلاحية تغيير حالة رابط الدعوة'
    );
  END IF;

  UPDATE merchant_invites
  SET status = p_status::invite_token_status, updated_at = NOW()
  WHERE id = (
    SELECT id FROM merchant_invites WHERE merchant_id = p_merchant_id 
    ORDER BY created_at DESC LIMIT 1
  );
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_found');
  END IF;

  -- تسجيل في audit log
  INSERT INTO merchant_admin_audit_log (merchant_id, admin_id, action, reason, metadata)
  VALUES (p_merchant_id, v_caller_id, 'invite_status_change', 'تغيير حالة رابط الدعوة',
          jsonb_build_object('new_status', p_status));

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- ── 6. إصلاح regenerate_invite_token: Admin فقط ──────────
CREATE OR REPLACE FUNCTION public.regenerate_invite_token(
  p_merchant_id uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_token   text;
  v_invite_id   uuid;
  v_caller_id   uuid := COALESCE(p_admin_id, auth.uid());
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

  -- فقط admin/super_admin يستطيع regenerate
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'admin_only',
      'message', 'إعادة توليد رابط الدعوة للإدارة فقط'
    );
  END IF;

  v_new_token := _gen_invite_token();

  UPDATE merchant_invites SET status = 'expired', updated_at = NOW()
  WHERE merchant_id = p_merchant_id AND status = 'active';

  INSERT INTO merchant_invites(merchant_id, token, status)
  VALUES (p_merchant_id, v_new_token, 'active')
  RETURNING id INTO v_invite_id;

  -- تسجيل في audit log
  INSERT INTO merchant_admin_audit_log (merchant_id, admin_id, action, reason)
  VALUES (p_merchant_id, v_caller_id, 'invite_regenerate', 'إعادة توليد رابط الدعوة');

  RETURN jsonb_build_object('success', true, 'token', v_new_token, 'id', v_invite_id);
END;
$$;

-- ── 7. إضافة invite_lock / invite_unlock لـ admin_merchant_action ──
CREATE OR REPLACE FUNCTION public.admin_merchant_action(
  p_merchant_id uuid,
  p_action      text,
  p_admin_id    uuid,
  p_reason      text    DEFAULT NULL,
  p_metadata    jsonb   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant merchants%ROWTYPE;
  v_msg      text := 'تم تنفيذ الإجراء بنجاح';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND role IN ('admin','super_admin')
  ) THEN
    RETURN jsonb_build_object('success',false,'error','unauthorized');
  END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','merchant_not_found');
  END IF;

  INSERT INTO merchant_control_config (merchant_id)
  VALUES (p_merchant_id) ON CONFLICT (merchant_id) DO NOTHING;

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
      UPDATE merchant_control_config SET kill_switch=true, kill_switch_at=NOW(), updated_at=NOW(), config_version=config_version+1,
        kill_switch_msg=COALESCE(p_metadata->>'message', kill_switch_msg) WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل Kill Switch';
    WHEN 'kill_switch_off' THEN
      UPDATE merchant_control_config SET kill_switch=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إيقاف Kill Switch';
    WHEN 'maintenance_on' THEN
      UPDATE merchant_control_config SET maintenance_mode=true, maintenance_at=NOW(), updated_at=NOW(), config_version=config_version+1,
        maintenance_msg=COALESCE(p_metadata->>'message', maintenance_msg) WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل وضع الصيانة';
    WHEN 'maintenance_off' THEN
      UPDATE merchant_control_config SET maintenance_mode=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إيقاف وضع الصيانة';
    WHEN 'force_update_on' THEN
      UPDATE merchant_control_config SET force_update=true, force_update_at=NOW(), updated_at=NOW(), config_version=config_version+1,
        force_update_msg=COALESCE(p_metadata->>'message', force_update_msg), min_version=COALESCE(p_metadata->>'min_version', min_version)
        WHERE merchant_id=p_merchant_id;
      v_msg := 'تم تفعيل التحديث الإجباري';
    WHEN 'force_update_off' THEN
      UPDATE merchant_control_config SET force_update=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إيقاف التحديث الإجباري';
    WHEN 'force_logout' THEN
      UPDATE merchant_control_config SET force_logout=true, force_logout_at=NOW(), updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
        SELECT p.id, '⚠️ تسجيل خروج إجباري', 'تم تسجيل خروجك من قِبل المسؤول.', 'force_logout', false, false
        FROM profiles p WHERE p.merchant_id = p_merchant_id;
      v_msg := 'تم تفعيل تسجيل الخروج الإجباري';
    WHEN 'force_logout_clear' THEN
      UPDATE merchant_control_config SET force_logout=false, updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم مسح علامة Force Logout';
    WHEN 'force_sync' THEN
      UPDATE merchant_control_config SET last_config_push=NOW(), updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إرسال أمر المزامنة الإجبارية';
    WHEN 'force_refresh_config' THEN
      UPDATE merchant_control_config SET last_config_push=NOW(), updated_at=NOW(), config_version=config_version+1 WHERE merchant_id=p_merchant_id;
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
      INSERT INTO merchant_invites (merchant_id, token, status) VALUES (p_merchant_id, _gen_invite_token(), 'active');
      UPDATE merchant_control_config SET config_version=config_version+1, updated_at=NOW() WHERE merchant_id=p_merchant_id;
      v_msg := 'تم إعادة توليد رابط الدعوة';
    -- ✅ جديد: قفل رابط الدعوة من Owner
    WHEN 'invite_lock' THEN
      UPDATE merchants SET invite_enabled=false, invite_locked_by_owner=true, updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config
        SET invite_enabled=false, invite_locked_by_owner=true, invite_locked_at=NOW(),
            updated_at=NOW(), config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      -- تعطيل الرابط الحالي
      UPDATE merchant_invites SET status='disabled', updated_at=NOW()
        WHERE merchant_id=p_merchant_id AND status='active';
      v_msg := 'تم قفل رابط الدعوة بواسطة الإدارة — التاجر لا يستطيع تغييره';
    -- ✅ جديد: فك قفل رابط الدعوة من Owner
    WHEN 'invite_unlock' THEN
      UPDATE merchants SET invite_enabled=true, invite_locked_by_owner=false, updated_at=NOW() WHERE id=p_merchant_id;
      UPDATE merchant_control_config
        SET invite_enabled=true, invite_locked_by_owner=false, invite_locked_at=NULL,
            updated_at=NOW(), config_version=config_version+1
        WHERE merchant_id=p_merchant_id;
      -- إعادة تفعيل الرابط
      UPDATE merchant_invites SET status='active', updated_at=NOW()
        WHERE merchant_id=p_merchant_id
          AND id=(SELECT id FROM merchant_invites WHERE merchant_id=p_merchant_id ORDER BY created_at DESC LIMIT 1);
      v_msg := 'تم فك قفل رابط الدعوة';
    ELSE
      RETURN jsonb_build_object('success',false,'error','unknown_action','action',p_action);
  END CASE;

  INSERT INTO merchant_admin_audit_log (merchant_id, admin_id, action, reason, metadata)
  VALUES (p_merchant_id, p_admin_id, p_action, p_reason, COALESCE(p_metadata,'{}'));

  RETURN jsonb_build_object('success',true,'message',v_msg,'action',p_action);
END;
$$;

-- ── 8. إنشاء get_merchant_detail RPC (كانت مفقودة تماماً) ─
CREATE OR REPLACE FUNCTION public.get_merchant_detail(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m   merchants%ROWTYPE;
  v_w   merchant_wallets%ROWTYPE;
  v_cc  merchant_control_config%ROWTYPE;
  v_inv merchant_invites%ROWTYPE;
  v_owner_profile jsonb;
  v_stats  jsonb;
  v_ledger jsonb;
  v_audit  jsonb;
  v_app_base_url text;
BEGIN
  SELECT * INTO v_m FROM merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  -- محفظة التاجر
  SELECT * INTO v_w FROM merchant_wallets WHERE merchant_id = p_merchant_id;

  -- إعدادات التحكم
  SELECT * INTO v_cc FROM merchant_control_config WHERE merchant_id = p_merchant_id;

  -- رابط الدعوة النشط
  SELECT * INTO v_inv FROM merchant_invites 
  WHERE merchant_id = p_merchant_id ORDER BY created_at DESC LIMIT 1;

  -- بيانات المالك
  SELECT jsonb_build_object(
    'id',       p.id,
    'username', p.username,
    'phone',    p.phone,
    'email',    p.email,
    'role',     p.role
  ) INTO v_owner_profile
  FROM profiles p WHERE p.merchant_id = p_merchant_id AND p.role = 'merchant' LIMIT 1;

  -- إحصائيات المستخدمين (بدون حساب التاجر)
  SELECT jsonb_build_object(
    'total_users',   COUNT(*) FILTER (WHERE role NOT IN ('admin','super_admin','merchant')),
    'active_users',  COUNT(*) FILTER (WHERE role NOT IN ('admin','super_admin','merchant') AND is_active = true),
    'pending_users', COUNT(*) FILTER (WHERE role NOT IN ('admin','super_admin','merchant') AND merchant_user_status = 'pending')
  ) INTO v_stats
  FROM profiles WHERE merchant_id = p_merchant_id;

  -- آخر 5 سجلات في ledger
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type',           l.type,
      'amount',         l.amount,
      'balance_before', l.balance_before,
      'balance_after',  l.balance_after,
      'reason',         l.reason,
      'created_at',     l.created_at
    ) ORDER BY l.created_at DESC
  ), '[]'::jsonb) INTO v_ledger
  FROM (SELECT * FROM merchant_ledger WHERE merchant_id = p_merchant_id ORDER BY created_at DESC LIMIT 5) l;

  -- آخر 5 سجلات في audit log
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'action',     a.action,
      'admin_id',   a.admin_id,
      'reason',     a.reason,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_audit
  FROM (SELECT * FROM merchant_admin_audit_log WHERE merchant_id = p_merchant_id ORDER BY created_at DESC LIMIT 5) a;

  -- رابط التطبيق
  SELECT value INTO v_app_base_url FROM app_config WHERE key = 'app_base_url';

  RETURN jsonb_build_object(
    'success',             true,
    'id',                  v_m.id,
    'name',                v_m.name,
    'status',              v_m.status,
    'invite_code',         v_m.invite_code,
    'invite_enabled',      v_m.invite_enabled,
    'invite_locked_by_owner', v_m.invite_locked_by_owner,
    'notes',               v_m.notes,
    'total_points',        v_m.total_points,
    'used_points',         v_m.used_points,
    'created_at',          v_m.created_at,
    'updated_at',          v_m.updated_at,
    'owner_profile',       v_owner_profile,
    'wallet', jsonb_build_object(
      'current_points',      COALESCE(v_w.current_points, 0),
      'used_points',         COALESCE(v_w.used_points, 0),
      'lifetime_purchased',  COALESCE(v_w.lifetime_purchased, 0),
      'lifetime_consumed',   COALESCE(v_w.lifetime_consumed, 0),
      'last_recharge_at',    v_w.last_recharge_at,
      'last_operation_at',   v_w.last_operation_at
    ),
    'control_config', jsonb_build_object(
      'kill_switch',            COALESCE(v_cc.kill_switch, false),
      'maintenance_mode',       COALESCE(v_cc.maintenance_mode, false),
      'force_update',           COALESCE(v_cc.force_update, false),
      'invite_enabled',         COALESCE(v_cc.invite_enabled, true),
      'invite_locked_by_owner', COALESCE(v_cc.invite_locked_by_owner, false),
      'config_version',         COALESCE(v_cc.config_version, 0)
    ),
    'invite', CASE WHEN v_inv.id IS NOT NULL THEN jsonb_build_object(
      'id',         v_inv.id,
      'token',      v_inv.token,
      'status',     v_inv.status,
      'view_count', v_inv.view_count,
      'join_count', v_inv.join_count,
      'invite_link', COALESCE(v_app_base_url, 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/index.html') || '?merchant=' || v_m.invite_code,
      'created_at', v_inv.created_at
    ) ELSE NULL END,
    'stats',   v_stats,
    'ledger',  v_ledger,
    'audit',   v_audit
  );
END;
$$;

-- ── 9. إصلاح activate_member_subscription ليسجّل في ledger ──
CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id  uuid;
  v_sub_id     uuid;
  v_end_date   date;
  v_bal_before bigint;
BEGIN
  v_end_date := CURRENT_DATE + p_days;

  SELECT id INTO v_member_id
  FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  UPDATE merchant_members
  SET status = 'active', activated_at = now(),
      assigned_points  = COALESCE(assigned_points, 0) + p_points,
      remaining_points = COALESCE(remaining_points, 0) + p_points
  WHERE id = v_member_id;

  INSERT INTO merchant_member_subscriptions
    (member_id, merchant_id, user_id, status, assigned_points, consumed_points, remaining_points, start_date, end_date)
  VALUES
    (v_member_id, p_merchant_id, p_user_id, 'active', p_points, 0, p_points, CURRENT_DATE, v_end_date)
  ON CONFLICT (member_id) DO UPDATE SET
    status = 'active', assigned_points = merchant_member_subscriptions.assigned_points + p_points,
    remaining_points = merchant_member_subscriptions.remaining_points + p_points,
    start_date = CURRENT_DATE, end_date = v_end_date, renewed_at = now()
  RETURNING id INTO v_sub_id;

  -- خصم من محفظة التاجر مع تسجيل في ledger
  IF p_points > 0 THEN
    SELECT current_points INTO v_bal_before FROM merchant_wallets WHERE merchant_id = p_merchant_id;

    UPDATE merchant_wallets
    SET current_points = current_points - p_points, used_points = used_points + p_points, last_operation_at = now()
    WHERE merchant_id = p_merchant_id AND current_points >= p_points;

    -- تسجيل في merchant_ledger
    INSERT INTO merchant_ledger (merchant_id, type, amount, balance_before, balance_after, reason, notes, created_by)
    VALUES (
      p_merchant_id, 'deduct', p_points,
      v_bal_before, v_bal_before - p_points,
      'activate_subscription',
      'تفعيل اشتراك عضو: ' || p_user_id::text || ' | ' || p_days || ' يوم | ' || p_points || ' نقطة',
      COALESCE(p_admin_id, auth.uid())
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'subscription_id', v_sub_id, 'end_date', v_end_date, 'points', p_points
  );
END;
$$;

-- ── 10. إصلاح renew_member_subscription ليسجّل في ledger ──
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id  uuid;
  v_new_end    date;
  v_bal_before bigint;
BEGIN
  SELECT id INTO v_member_id
  FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  UPDATE merchant_member_subscriptions
  SET end_date = GREATEST(CURRENT_DATE, end_date) + p_days,
      assigned_points = assigned_points + p_points,
      remaining_points = remaining_points + p_points,
      status = 'active', renewed_at = now()
  WHERE member_id = v_member_id
  RETURNING end_date INTO v_new_end;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  UPDATE merchant_members
  SET status = 'active',
      assigned_points  = COALESCE(assigned_points, 0) + p_points,
      remaining_points = COALESCE(remaining_points, 0) + p_points
  WHERE id = v_member_id;

  IF p_points > 0 THEN
    SELECT current_points INTO v_bal_before FROM merchant_wallets WHERE merchant_id = p_merchant_id;

    UPDATE merchant_wallets
    SET current_points = current_points - p_points, used_points = used_points + p_points, last_operation_at = now()
    WHERE merchant_id = p_merchant_id AND current_points >= p_points;

    INSERT INTO merchant_ledger (merchant_id, type, amount, balance_before, balance_after, reason, notes, created_by)
    VALUES (
      p_merchant_id, 'deduct', p_points,
      v_bal_before, v_bal_before - p_points,
      'renew_subscription',
      'تجديد اشتراك عضو: ' || p_user_id::text || ' | ' || p_days || ' يوم إضافي | ' || p_points || ' نقطة',
      COALESCE(p_admin_id, auth.uid())
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'end_date', v_new_end, 'points_added', p_points);
END;
$$;

-- ── 11. get_merchant_invite: إضافة invite_locked_by_owner ──
CREATE OR REPLACE FUNCTION public.get_merchant_invite(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite     merchant_invites%ROWTYPE;
  v_joined     jsonb;
  v_locked     boolean;
  v_app_base   text;
  v_inv_code   text;
BEGIN
  SELECT * INTO v_invite
  FROM merchant_invites WHERE merchant_id = p_merchant_id
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO merchant_invites(merchant_id, token, status)
    VALUES (p_merchant_id, _gen_invite_token(), 'active')
    RETURNING * INTO v_invite;
  END IF;

  SELECT invite_locked_by_owner, invite_code INTO v_locked, v_inv_code
  FROM merchants WHERE id = p_merchant_id;

  SELECT value INTO v_app_base FROM app_config WHERE key = 'app_base_url';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',   l.user_id,
    'username',  p.username,
    'phone',     p.phone,
    'joined_at', l.created_at
  ) ORDER BY l.created_at DESC), '[]'::jsonb)
  INTO v_joined
  FROM (
    SELECT * FROM invite_usage_logs
    WHERE invite_id = v_invite.id AND action = 'join'
    ORDER BY created_at DESC LIMIT 5
  ) l
  LEFT JOIN profiles p ON p.id = l.user_id;

  RETURN jsonb_build_object(
    'id',                  v_invite.id,
    'token',               v_invite.token,
    'status',              v_invite.status,
    'expires_at',          v_invite.expires_at,
    'view_count',          v_invite.view_count,
    'join_count',          v_invite.join_count,
    'last_viewed_at',      v_invite.last_viewed_at,
    'last_joined_at',      v_invite.last_joined_at,
    'last_joined_user_id', v_invite.last_joined_user_id,
    'created_at',          v_invite.created_at,
    'recent_joins',        v_joined,
    'locked_by_owner',     COALESCE(v_locked, false),
    'invite_link',         COALESCE(v_app_base, 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/index.html') || '?merchant=' || COALESCE(v_inv_code, v_invite.token)
  );
END;
$$;

-- GRANTS
GRANT EXECUTE ON FUNCTION public.get_merchant_detail(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_merchant_invite(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_invite_token_status(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_invite_token(uuid, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merchant_action(uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid, uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid, uuid, integer, integer, uuid)    TO authenticated;
