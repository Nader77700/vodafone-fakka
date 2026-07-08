
-- ══════════════════════════════════════════════════════════════
-- PHASE 19: Audit Log Table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.merchant_audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     uuid        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  operation       text        NOT NULL,
  entity_type     text        NOT NULL DEFAULT 'member',
  entity_id       text,
  sub_status_before text,
  sub_status_after  text,
  member_status_before text,
  member_status_after  text,
  points_before   bigint,
  points_after    bigint,
  points_delta    bigint,
  balance_before  bigint,
  balance_after   bigint,
  correlation_id  text,
  reason          text,
  error_message   text,
  success         boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant   ON public.merchant_audit_log(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user       ON public.merchant_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operation  ON public.merchant_audit_log(operation, created_at DESC);

ALTER TABLE public.merchant_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_merchant_access" ON public.merchant_audit_log;
CREATE POLICY "audit_merchant_access" ON public.merchant_audit_log
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM public.merchants WHERE created_by = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ══════════════════════════════════════════════════════════════
-- PHASE 15: Merchant Notifications Table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.merchant_notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     uuid        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope           text        NOT NULL DEFAULT 'merchant',
  type            text        NOT NULL,
  title           text        NOT NULL,
  body            text        NOT NULL,
  data            jsonb,
  is_read         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mn_user     ON public.merchant_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mn_merchant ON public.merchant_notifications(merchant_id, created_at DESC);

ALTER TABLE public.merchant_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mn_user_read" ON public.merchant_notifications;
CREATE POLICY "mn_user_read" ON public.merchant_notifications
  FOR SELECT USING (user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ══════════════════════════════════════════════════════════════
-- Helper: insert audit record
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._merchant_audit(
  p_merchant_id         uuid,
  p_user_id             uuid,
  p_actor_id            uuid,
  p_operation           text,
  p_entity_type         text DEFAULT 'member',
  p_entity_id           text DEFAULT NULL,
  p_sub_status_before   text DEFAULT NULL,
  p_sub_status_after    text DEFAULT NULL,
  p_member_status_before text DEFAULT NULL,
  p_member_status_after text DEFAULT NULL,
  p_points_before       bigint DEFAULT NULL,
  p_points_after        bigint DEFAULT NULL,
  p_points_delta        bigint DEFAULT NULL,
  p_balance_before      bigint DEFAULT NULL,
  p_balance_after       bigint DEFAULT NULL,
  p_correlation_id      text DEFAULT NULL,
  p_reason              text DEFAULT NULL,
  p_error_message       text DEFAULT NULL,
  p_success             boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.merchant_audit_log(
    merchant_id, user_id, actor_id, operation, entity_type, entity_id,
    sub_status_before, sub_status_after, member_status_before, member_status_after,
    points_before, points_after, points_delta,
    balance_before, balance_after,
    correlation_id, reason, error_message, success
  ) VALUES (
    p_merchant_id, p_user_id, p_actor_id, p_operation, p_entity_type, p_entity_id,
    p_sub_status_before, p_sub_status_after, p_member_status_before, p_member_status_after,
    p_points_before, p_points_after, p_points_delta,
    p_balance_before, p_balance_after,
    p_correlation_id, p_reason, p_error_message, p_success
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- لا تكسر العملية الأصلية بسبب فشل تسجيل الـ audit
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- Helper: send merchant notification
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._merchant_notify(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_data        jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.merchant_notifications(merchant_id, user_id, scope, type, title, body, data)
  VALUES (p_merchant_id, p_user_id, 'merchant', p_type, p_title, p_body, p_data);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- Helper: validate merchant is active (PHASE 16)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._validate_merchant_active(
  p_merchant_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_merchant merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'التاجر غير موجود');
  END IF;
  IF v_merchant.status = 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر غير نشط');
  END IF;
  IF v_merchant.status = 'suspended' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر موقوف');
  END IF;
  IF v_merchant.status = 'blocked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'حساب التاجر محظور');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 12 + 16 + 18 + 19: increase_member_points
-- أضفنا: تحقق محفظة التاجر + صلاحية النقاط + merchant active check + audit
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.increase_member_points(
  p_merchant_id     uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_reason          text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_admin_id        uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member   merchant_members%ROWTYPE;
  v_wallet   merchant_wallets%ROWTYPE;
  v_tx_id    text;
  v_bal_before bigint;
  v_check    jsonb;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;

  -- Idempotency
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  -- PHASE 16: تحقق حالة التاجر
  v_check := _validate_merchant_active(p_merchant_id);
  IF NOT (v_check->>'ok')::boolean THEN
    PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'increase_points',
      'member', p_user_id::text, NULL, NULL, NULL, NULL, NULL, NULL, p_amount,
      NULL, NULL, NULL, p_reason, v_check->>'error', false);
    RETURN jsonb_build_object('success', false, 'error', v_check->>'error');
  END IF;

  -- PHASE 12: تحقق رصيد محفظة التاجر
  SELECT * INTO v_wallet FROM public.merchant_wallets
  WHERE merchant_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.current_points < p_amount THEN
    PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'increase_points',
      'member', p_user_id::text, NULL, NULL, NULL, NULL, NULL, NULL, p_amount,
      COALESCE(v_wallet.current_points,0), NULL, p_idempotency_key, p_reason,
      'رصيد نقاط التاجر غير كافٍ', false);
    RETURN jsonb_build_object('success', false, 'error', 'رصيد نقاط التاجر غير كافٍ',
      'current_balance', COALESCE(v_wallet.current_points, 0));
  END IF;

  -- PHASE 12: تحقق صلاحية النقاط
  IF v_wallet.points_expires_at IS NOT NULL AND v_wallet.points_expires_at < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية نقاط التاجر',
      'expired_at', v_wallet.points_expires_at::text);
  END IF;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  -- PHASE 18: Atomic — خصم من التاجر + إضافة للعضو في نفس الـ transaction
  UPDATE public.merchant_wallets
  SET current_points    = current_points    - p_amount,
      used_points       = used_points       + p_amount,
      lifetime_consumed = lifetime_consumed + p_amount,
      last_operation_at = NOW(),
      updated_at        = NOW()
  WHERE merchant_id = p_merchant_id;

  UPDATE public.merchant_members
  SET remaining_points  = remaining_points + p_amount,
      assigned_points   = assigned_points  + p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, notes, created_by
  ) VALUES (
    v_tx_id, v_member.id, p_merchant_id, p_user_id,
    'increase', p_amount, v_bal_before, v_bal_before + p_amount,
    p_reason, p_notes, p_admin_id
  );

  INSERT INTO public.merchant_ledger(
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, created_by
  ) VALUES (
    'INC-' || v_tx_id,
    p_merchant_id, 'deduct', p_amount,
    v_wallet.current_points, v_wallet.current_points - p_amount,
    'زيادة نقاط عضو — ' || p_user_id::text, p_admin_id
  );

  -- PHASE 19: Audit + PHASE 15: Notification
  PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'increase_points',
    'member', p_user_id::text, NULL, NULL, NULL, NULL,
    v_bal_before, v_bal_before + p_amount, p_amount,
    v_wallet.current_points, v_wallet.current_points - p_amount,
    v_tx_id, p_reason, NULL, true);

  PERFORM _merchant_notify(p_merchant_id, p_user_id, 'points_added',
    'تم إضافة نقاط',
    'تمت إضافة ' || p_amount || ' نقطة إلى حسابك',
    jsonb_build_object('amount', p_amount, 'balance_after', v_bal_before + p_amount));

  RETURN jsonb_build_object('success', true, 'balance_after', v_bal_before + p_amount);
EXCEPTION WHEN OTHERS THEN
  PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'increase_points',
    'member', p_user_id::text, NULL, NULL, NULL, NULL, v_bal_before, NULL, p_amount,
    NULL, NULL, v_tx_id, p_reason, SQLERRM, false);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 11 + 16 + 18 + 19: decrease_member_points
-- أضفنا: merchant active check + audit + notification
-- (balance check already existed)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decrease_member_points(
  p_merchant_id     uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_reason          text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_admin_id        uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member   merchant_members%ROWTYPE;
  v_tx_id    text;
  v_bal_before bigint;
  v_check    jsonb;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  -- PHASE 16: تحقق حالة التاجر
  v_check := _validate_merchant_active(p_merchant_id);
  IF NOT (v_check->>'ok')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_check->>'error');
  END IF;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- PHASE 11: تحقق رصيد العضو
  IF v_member.remaining_points < p_amount THEN
    PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'decrease_points',
      'member', p_user_id::text, NULL, NULL, NULL, NULL,
      v_member.remaining_points, NULL, -p_amount::bigint,
      NULL, NULL, p_idempotency_key, p_reason,
      'لا يمكن خصم قيمة أكبر من الرصيد الحالي', false);
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن خصم قيمة أكبر من الرصيد الحالي',
      'current_balance', v_member.remaining_points);
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  UPDATE public.merchant_members
  SET remaining_points  = remaining_points - p_amount,
      consumed_points   = consumed_points  + p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, notes, created_by
  ) VALUES (
    v_tx_id, v_member.id, p_merchant_id, p_user_id,
    'decrease', -p_amount, v_bal_before, v_bal_before - p_amount,
    p_reason, p_notes, p_admin_id
  );

  -- PHASE 19: Audit + PHASE 15: Notification
  PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'decrease_points',
    'member', p_user_id::text, NULL, NULL, NULL, NULL,
    v_bal_before, v_bal_before - p_amount, -p_amount::bigint,
    NULL, NULL, v_tx_id, p_reason, NULL, true);

  PERFORM _merchant_notify(p_merchant_id, p_user_id, 'points_deducted',
    'تم خصم نقاط',
    'تم خصم ' || p_amount || ' نقطة من حسابك',
    jsonb_build_object('amount', p_amount, 'balance_after', v_bal_before - p_amount));

  RETURN jsonb_build_object('success', true,
    'balance_before', v_bal_before, 'balance_after', v_bal_before - p_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 14 + 16 + 17 + 19: set_member_status
-- أضفنا: merchant active check + audit + notification
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_member_status(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_new_status  text,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member  merchant_members%ROWTYPE;
  v_check   jsonb;
  v_notify_title text;
  v_notify_body  text;
BEGIN
  -- PHASE 16
  v_check := _validate_merchant_active(p_merchant_id);
  IF NOT (v_check->>'ok')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_check->>'error');
  END IF;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  UPDATE public.merchant_members
  SET status            = p_new_status::member_status,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- رسائل الإشعار حسب الحالة الجديدة
  v_notify_title := CASE p_new_status
    WHEN 'active'    THEN 'تم تفعيل الحساب'
    WHEN 'suspended' THEN 'تم تعليق الحساب'
    WHEN 'blocked'   THEN 'تم حظر الحساب'
    WHEN 'pending'   THEN 'حالة الحساب: انتظار'
    ELSE 'تحديث حالة الحساب'
  END;
  v_notify_body := CASE p_new_status
    WHEN 'active'    THEN 'تم استئناف وصولك لجميع الخدمات.'
    WHEN 'suspended' THEN 'تم تعليق حسابك مؤقتاً. تواصل مع التاجر للاستفسار.'
    WHEN 'blocked'   THEN 'تم حظر حسابك. تواصل مع التاجر.'
    ELSE 'تم تحديث حالة حسابك إلى: ' || p_new_status
  END;

  -- PHASE 19: Audit
  PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'set_status',
    'member', p_user_id::text,
    NULL, NULL, v_member.status::text, p_new_status,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true);

  -- PHASE 15: Notification
  PERFORM _merchant_notify(p_merchant_id, p_user_id,
    'status_change', v_notify_title, v_notify_body,
    jsonb_build_object('old_status', v_member.status::text, 'new_status', p_new_status));

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status,
    'old_status', v_member.status::text);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 15+19: patch cancel_member_subscription to notify+audit
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cancel_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member   merchant_members%ROWTYPE;
  v_sub_id   uuid;
  v_sub_status text;
BEGIN
  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT id, status::text INTO v_sub_id, v_sub_status
  FROM public.merchant_member_subscriptions
  WHERE member_id = v_member.id
    AND status IN ('active'::subscription_status, 'grace_period'::subscription_status)
  LIMIT 1;

  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'::subscription_status, updated_at = NOW()
  WHERE member_id = v_member.id
    AND status IN ('active'::subscription_status, 'grace_period'::subscription_status);

  UPDATE public.merchant_members
  SET status            = 'pending',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, created_by
  ) VALUES (
    gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
    'adjustment', 0,
    v_member.remaining_points, v_member.remaining_points,
    'إلغاء اشتراك', p_admin_id
  );

  -- PHASE 19
  PERFORM _merchant_audit(p_merchant_id, p_user_id, p_admin_id, 'cancel_subscription',
    'subscription', v_sub_id::text, v_sub_status, 'cancelled',
    v_member.status::text, 'pending',
    NULL, NULL, NULL, NULL, NULL, v_sub_id::text, NULL, NULL, true);

  -- PHASE 15
  PERFORM _merchant_notify(p_merchant_id, p_user_id, 'subscription_cancelled',
    'تم إلغاء الاشتراك',
    'تم إلغاء اشتراكك. تواصل مع التاجر لتفعيل اشتراك جديد.',
    jsonb_build_object('sub_id', v_sub_id));

  RETURN jsonb_build_object('success', true, 'cancelled_sub_id', COALESCE(v_sub_id::text, 'none'));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- API: get_merchant_audit_log (PHASE 19)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_merchant_audit_log(
  p_merchant_id uuid,
  p_user_id     uuid    DEFAULT NULL,
  p_operation   text    DEFAULT NULL,
  p_limit       int     DEFAULT 50,
  p_offset      int     DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total int;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.merchant_audit_log
  WHERE merchant_id = p_merchant_id
    AND (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_operation IS NULL OR operation = p_operation);

  RETURN jsonb_build_object(
    'success', true,
    'total', v_total,
    'items', (
      SELECT jsonb_agg(row_to_json(a.*))
      FROM (
        SELECT * FROM public.merchant_audit_log
        WHERE merchant_id = p_merchant_id
          AND (p_user_id IS NULL OR user_id = p_user_id)
          AND (p_operation IS NULL OR operation = p_operation)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) a
    )
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- API: get_merchant_notifications (PHASE 15)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_merchant_notifications(
  p_user_id    uuid,
  p_limit      int  DEFAULT 20,
  p_unread_only boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'items', (
      SELECT jsonb_agg(row_to_json(n.*))
      FROM (
        SELECT * FROM public.merchant_notifications
        WHERE user_id = p_user_id
          AND (NOT p_unread_only OR is_read = false)
        ORDER BY created_at DESC
        LIMIT p_limit
      ) n
    )
  );
END;
$$;

-- mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_merchant_notifications_read(
  p_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.merchant_notifications
  SET is_read = true
  WHERE user_id = p_user_id AND is_read = false;
END;
$$;
