
-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 FIX: validate_merchant_charge_eligibility
-- pending يُعامل كـ غير مفعّل — الاشتراك يجب أن يكون active فقط
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_merchant_charge_eligibility(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_merchant merchants%ROWTYPE;
  v_member   merchant_members%ROWTYPE;
  v_sub      merchant_member_subscriptions%ROWTYPE;
BEGIN
  -- ── 1. المستخدم ──────────────────────────────────────────────────────────
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND     THEN RETURN jsonb_build_object('eligible',false,'reason','user_not_found',   'stage','user'); END IF;
  IF NOT v_profile.is_active THEN RETURN jsonb_build_object('eligible',false,'reason','user_inactive','stage','user'); END IF;
  IF v_profile.merchant_id IS NULL THEN RETURN jsonb_build_object('eligible',false,'reason','not_merchant_client','stage','user'); END IF;

  -- ── 2. التاجر ─────────────────────────────────────────────────────────────
  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','merchant_not_found','stage','merchant'); END IF;
  IF v_merchant.status <> 'active' THEN
    RETURN jsonb_build_object('eligible',false,'reason','merchant_'||v_merchant.status,
      'stage','merchant','merchant_name',v_merchant.name,'merchant_status',v_merchant.status);
  END IF;

  -- ── 3. العضوية — PHASE 3 FIX: pending مرفوض (يجب active فقط) ────────────
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','member_not_found','stage','member'); END IF;

  IF v_member.status::text <> 'active' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason',   CASE v_member.status::text
                    WHEN 'pending'   THEN 'no_active_subscription'
                    WHEN 'suspended' THEN 'member_suspended'
                    WHEN 'blocked'   THEN 'member_blocked'
                    WHEN 'expired'   THEN 'member_expired'
                    ELSE 'member_' || v_member.status::text
                  END,
      'stage', 'member'
    );
  END IF;

  -- ── 4. الاشتراك ───────────────────────────────────────────────────────────
  SELECT * INTO v_sub FROM merchant_member_subscriptions
  WHERE member_id = v_member.id
    AND status IN ('active','grace_period','trial')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible',false,'reason','no_active_subscription','stage','subscription');
  END IF;

  -- ── 5. تحقق انتهاء الاشتراك بالتاريخ ────────────────────────────────────
  IF v_sub.end_date IS NOT NULL AND v_sub.end_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('eligible',false,'reason','member_expired','stage','subscription');
  END IF;

  -- ── 6. تحقق عمليات الاشتراك ──────────────────────────────────────────────
  IF v_sub.ops_limit IS NOT NULL AND v_sub.ops_used IS NOT NULL THEN
    DECLARE v_ops_remaining integer := v_sub.ops_limit - v_sub.ops_used;
    BEGIN
      IF v_ops_remaining <= 0 THEN
        RETURN jsonb_build_object('eligible',false,'reason','ops_exhausted','stage','subscription',
          'ops_used',v_sub.ops_used,'ops_limit',v_sub.ops_limit);
      END IF;
      RETURN jsonb_build_object(
        'eligible',true,
        'merchant_id',v_merchant.id,'merchant_name',v_merchant.name,'merchant_status',v_merchant.status::text,
        'member_status',v_member.status::text,
        'sub_status',v_sub.status::text,
        'ops_remaining',v_ops_remaining,'ops_limit',v_sub.ops_limit,'ops_count',v_sub.ops_used,
        'end_date',v_sub.end_date::text
      );
    END;
  END IF;

  RETURN jsonb_build_object(
    'eligible',true,
    'merchant_id',v_merchant.id,'merchant_name',v_merchant.name,'merchant_status',v_merchant.status::text,
    'member_status',v_member.status::text,
    'sub_status',v_sub.status::text,
    'ops_remaining',null,'ops_limit',null,'ops_count',null,
    'end_date',v_sub.end_date::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('eligible',false,'reason','rpc_error','stage','system','detail',SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 7-8: إضافة points_expires_at لـ merchant_wallets
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='merchant_wallets' AND column_name='points_expires_at'
  ) THEN
    ALTER TABLE merchant_wallets ADD COLUMN points_expires_at DATE DEFAULT NULL;
    COMMENT ON COLUMN merchant_wallets.points_expires_at IS 'تاريخ انتهاء صلاحية نقاط التاجر — يُحدَّث عند كل شحن';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5-9: activate_member_subscription — مع تحقق wallet + خصم atomically
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        int     DEFAULT 30,
  p_points      bigint  DEFAULT 0,
  p_start_date  timestamptz DEFAULT NULL,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_wallet         merchant_wallets%ROWTYPE;
  v_sub_id         uuid;
  v_start          date;
  v_end            date;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_start  := COALESCE(p_start_date::date, CURRENT_DATE);
  v_end    := v_start + p_days;

  -- ── PHASE 5: تحقق رصيد النقاط قبل التوزيع ────────────────────────────────
  IF p_points > 0 THEN
    SELECT * INTO v_wallet FROM public.merchant_wallets
    WHERE merchant_id = p_merchant_id FOR UPDATE;

    IF NOT FOUND OR v_wallet.current_points < p_points THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'رصيد نقاط التاجر غير كافٍ',
        'current_balance', COALESCE(v_wallet.current_points, 0)
      );
    END IF;

    -- ── PHASE 7: تحقق صلاحية النقاط ──────────────────────────────────────
    IF v_wallet.points_expires_at IS NOT NULL AND v_end > v_wallet.points_expires_at THEN
      RETURN jsonb_build_object(
        'success',         false,
        'error',           'مدة الاشتراك المطلوبة تتجاوز مدة صلاحية نقاط التاجر',
        'points_expire',   v_wallet.points_expires_at::text,
        'sub_end',         v_end::text
      );
    END IF;
  END IF;

  v_sub_id := gen_random_uuid();

  -- إلغاء الاشتراكات السابقة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'::subscription_status, updated_at = NOW()
  WHERE member_id = v_member.id AND status = 'active'::subscription_status;

  -- إنشاء الاشتراك الجديد
  INSERT INTO public.merchant_member_subscriptions(
    id, member_id, merchant_id, user_id, status,
    start_date, end_date, expires_at,
    assigned_points, consumed_points, remaining_points
  ) VALUES (
    v_sub_id, v_member.id, p_merchant_id, p_user_id, 'active'::subscription_status,
    v_start, v_end, v_end::timestamptz + interval '23 hours 59 minutes',
    p_points, 0, p_points
  );

  -- تحديث العضو
  UPDATE public.merchant_members
  SET status            = 'active',
      activated_at      = NOW(),
      expired_at        = v_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- ── PHASE 6: خصم النقاط من محفظة التاجر atomically ─────────────────────
  IF p_points > 0 THEN
    UPDATE public.merchant_wallets
    SET current_points    = current_points    - p_points,
        used_points       = used_points       + p_points,
        lifetime_consumed = lifetime_consumed + p_points,
        last_operation_at = NOW(),
        updated_at        = NOW()
    WHERE merchant_id = p_merchant_id;

    -- تسجيل حركة المحفظة
    INSERT INTO public.merchant_ledger(
      transaction_id, merchant_id, type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      'SUB-' || v_sub_id::text,
      p_merchant_id, 'deduct', p_points,
      v_wallet.current_points, v_wallet.current_points - p_points,
      'تفعيل اشتراك — ' || p_user_id::text,
      COALESCE(p_admin_id, v_merchant_owner)
    );

    -- تسجيل منحة للعضو
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points, v_member.remaining_points + p_points,
      'تفعيل اشتراك', COALESCE(p_admin_id, v_merchant_owner), v_sub_id
    );

    UPDATE public.merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'start_date', v_start, 'end_date', v_end);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5-9: renew_member_subscription — مع تحقق wallet atomically
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        int     DEFAULT 30,
  p_points      bigint  DEFAULT 0,
  p_start_date  timestamptz DEFAULT NULL,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_sub            merchant_member_subscriptions%ROWTYPE;
  v_wallet         merchant_wallets%ROWTYPE;
  v_new_end        date;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT * INTO v_sub FROM public.merchant_member_subscriptions
  WHERE member_id = v_member.id AND status = 'active'::subscription_status
  ORDER BY created_at DESC LIMIT 1;

  v_new_end := COALESCE(
    CASE WHEN v_sub.end_date > CURRENT_DATE THEN v_sub.end_date ELSE NULL END,
    COALESCE(p_start_date::date, CURRENT_DATE)
  ) + p_days;

  -- ── PHASE 5: تحقق رصيد النقاط ────────────────────────────────────────────
  IF p_points > 0 THEN
    SELECT * INTO v_wallet FROM public.merchant_wallets
    WHERE merchant_id = p_merchant_id FOR UPDATE;

    IF NOT FOUND OR v_wallet.current_points < p_points THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'رصيد نقاط التاجر غير كافٍ',
        'current_balance', COALESCE(v_wallet.current_points, 0)
      );
    END IF;

    -- ── PHASE 7: تحقق صلاحية النقاط ──────────────────────────────────────
    IF v_wallet.points_expires_at IS NOT NULL AND v_new_end > v_wallet.points_expires_at THEN
      RETURN jsonb_build_object(
        'success',       false,
        'error',         'مدة الاشتراك المطلوبة تتجاوز مدة صلاحية نقاط التاجر',
        'points_expire', v_wallet.points_expires_at::text,
        'sub_end',       v_new_end::text
      );
    END IF;
  END IF;

  -- تحديث أو إنشاء اشتراك
  IF v_sub.id IS NOT NULL THEN
    UPDATE public.merchant_member_subscriptions
    SET end_date         = v_new_end,
        expires_at       = v_new_end::timestamptz + interval '23 hours 59 minutes',
        assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points,
        updated_at       = NOW()
    WHERE id = v_sub.id;
  ELSE
    INSERT INTO public.merchant_member_subscriptions(
      member_id, merchant_id, user_id, status,
      start_date, end_date, expires_at,
      assigned_points, consumed_points, remaining_points
    ) VALUES (
      v_member.id, p_merchant_id, p_user_id, 'active'::subscription_status,
      COALESCE(p_start_date::date, CURRENT_DATE), v_new_end,
      v_new_end::timestamptz + interval '23 hours 59 minutes',
      p_points, 0, p_points
    );
  END IF;

  UPDATE public.merchant_members
  SET status            = 'active',
      expired_at        = v_new_end::timestamptz + interval '23 hours 59 minutes',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- ── PHASE 6: خصم atomically ───────────────────────────────────────────────
  IF p_points > 0 THEN
    UPDATE public.merchant_wallets
    SET current_points    = current_points    - p_points,
        used_points       = used_points       + p_points,
        lifetime_consumed = lifetime_consumed + p_points,
        last_operation_at = NOW(),
        updated_at        = NOW()
    WHERE merchant_id = p_merchant_id;

    INSERT INTO public.merchant_ledger(
      transaction_id, merchant_id, type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      'RNW-' || gen_random_uuid()::text,
      p_merchant_id, 'deduct', p_points,
      v_wallet.current_points, v_wallet.current_points - p_points,
      'تجديد اشتراك — ' || p_user_id::text,
      COALESCE(p_admin_id, v_merchant_owner)
    );

    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after, reason, created_by
    ) VALUES (
      gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points,
      v_member.remaining_points, v_member.remaining_points + p_points,
      'تجديد اشتراك', COALESCE(p_admin_id, v_merchant_owner)
    );

    UPDATE public.merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_end_date', v_new_end);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 10: cancel_member_subscription — إلغاء كامل مع notification + log
-- ═══════════════════════════════════════════════════════════════════════════════
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
BEGIN
  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  -- إلغاء كل الاشتراكات النشطة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'::subscription_status, updated_at = NOW()
  WHERE member_id = v_member.id
    AND status IN ('active'::subscription_status, 'grace_period'::subscription_status)
  RETURNING id INTO v_sub_id;

  -- تحديث حالة العضو → pending (غير مفعّل)
  UPDATE public.merchant_members
  SET status            = 'pending',
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  -- تسجيل في member_ledger
  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, created_by
  ) VALUES (
    gen_random_uuid(), v_member.id, p_merchant_id, p_user_id,
    'adjustment', 0,
    v_member.remaining_points, v_member.remaining_points,
    'إلغاء اشتراك', COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true, 'cancelled_sub_id', v_sub_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 9: تحقق قبل إنشاء اشتراك (validate_merchant_subscription_eligibility)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_merchant_subscription_eligibility(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        int    DEFAULT 30,
  p_points      bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_merchant merchants%ROWTYPE;
  v_member   merchant_members%ROWTYPE;
  v_wallet   merchant_wallets%ROWTYPE;
  v_end_date date;
BEGIN
  -- تحقق التاجر
  SELECT * INTO v_merchant FROM merchants WHERE id = p_merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'error','التاجر غير موجود'); END IF;
  IF v_merchant.status <> 'active' THEN RETURN jsonb_build_object('eligible',false,'error','التاجر غير نشط'); END IF;

  -- تحقق العضو
  SELECT * INTO v_member FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'error','العضو غير موجود'); END IF;

  v_end_date := CURRENT_DATE + p_days;

  -- تحقق رصيد النقاط
  IF p_points > 0 THEN
    SELECT * INTO v_wallet FROM merchant_wallets WHERE merchant_id = p_merchant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'error','محفظة التاجر غير موجودة'); END IF;
    IF v_wallet.current_points < p_points THEN
      RETURN jsonb_build_object(
        'eligible',false,
        'error','رصيد نقاط التاجر غير كافٍ',
        'current_balance', v_wallet.current_points,
        'required', p_points
      );
    END IF;
    -- تحقق صلاحية النقاط
    IF v_wallet.points_expires_at IS NOT NULL AND v_end_date > v_wallet.points_expires_at THEN
      RETURN jsonb_build_object(
        'eligible',false,
        'error','مدة الاشتراك المطلوبة تتجاوز مدة صلاحية نقاط التاجر',
        'points_expire', v_wallet.points_expires_at::text
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible',true,
    'merchant_status', v_merchant.status,
    'member_status',   v_member.status::text,
    'wallet_balance',  COALESCE(v_wallet.current_points, 0),
    'end_date',        v_end_date::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('eligible',false,'error',SQLERRM);
END;
$$;

-- تحديث merchant_wallet_recharge لضبط points_expires_at
CREATE OR REPLACE FUNCTION public.merchant_wallet_recharge(
  p_merchant_id     uuid,
  p_amount          integer,
  p_admin_id        uuid    DEFAULT NULL,
  p_reason          text    DEFAULT 'admin_recharge',
  p_notes           text    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL,
  p_points_expires_at date  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id  uuid;
  v_before     integer;
  v_after      integer;
  v_tx_id      text;
  v_now        timestamptz := now();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM 1 FROM merchant_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('success', true, 'idempotent', true); END IF;
  END IF;

  SELECT id, current_points INTO v_wallet_id, v_before
  FROM merchant_wallets WHERE merchant_id = p_merchant_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'wallet_not_found');
  END IF;

  v_after := v_before + p_amount;

  UPDATE merchant_wallets
  SET current_points      = v_after,
      lifetime_purchased  = lifetime_purchased + p_amount,
      last_recharge_at    = v_now,
      updated_at          = v_now,
      -- تحديث points_expires_at: اختر الأبعد بين الحالي والجديد
      points_expires_at   = CASE
        WHEN p_points_expires_at IS NOT NULL THEN
          GREATEST(COALESCE(points_expires_at, p_points_expires_at), p_points_expires_at)
        ELSE points_expires_at
      END
  WHERE id = v_wallet_id;

  v_tx_id := 'RCH-' || gen_random_uuid()::text;

  INSERT INTO merchant_ledger(
    transaction_id, merchant_id, type, amount, balance_before, balance_after,
    reason, notes, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_merchant_id, 'recharge', p_amount, v_before, v_after,
    p_reason, p_notes, p_admin_id, p_idempotency_key, v_now
  );

  RETURN jsonb_build_object('success',true,'transaction_id',v_tx_id,'balance_before',v_before,'balance_after',v_after);
END;
$$;
