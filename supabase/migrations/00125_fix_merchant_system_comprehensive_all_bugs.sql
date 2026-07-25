
-- ═══════════════════════════════════════════════════════════════════════
-- إصلاح شامل لنظام التاجر — يصلح كل الأخطاء المكتشفة:
-- 1. get_merchant_member: member_id → id, member_status → status
-- 2. created_by FK: استخدام user_id صاحب التاجر بدل merchants.id
-- 3. merchant_invites مفقودة للتجار الجدد
-- 4. promote_to_merchant: إنشاء invite تلقائياً
-- 5. demote_from_merchant: تحويل تاجر لمستخدم عادي
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. FIX: get_merchant_member (كان يستخدم member_id و member_status اللي مش موجودين) ──────
CREATE OR REPLACE FUNCTION public.get_merchant_member(p_merchant_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  merchant_members%ROWTYPE;
  v_sub     merchant_member_subscriptions%ROWTYPE;
  v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_member
  FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود', 'member', null, 'subscription', null);
  END IF;

  -- FIX: v_member.id (ليس member_id)
  SELECT * INTO v_sub
  FROM merchant_member_subscriptions
  WHERE member_id = v_member.id
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'member', jsonb_build_object(
      'id',                 v_member.id,
      'member_id',          v_member.id,   -- للتوافق مع الكود القديم
      'merchant_id',        v_member.merchant_id,
      'user_id',            v_member.user_id,
      'member_status',      v_member.status,  -- FIX: status → member_status في الـ JSON
      'status',             v_member.status,
      'assigned_points',    v_member.assigned_points,
      'consumed_points',    v_member.consumed_points,
      'remaining_points',   v_member.remaining_points,
      'member_created_at',  v_member.created_at,
      'activated_at',       v_member.activated_at,
      'expired_at',         v_member.expired_at,
      'last_operation_at',  v_member.last_operation_at,
      'last_login_at',      v_member.last_login_at,
      'username',           v_profile.username,
      'phone',              v_profile.phone,
      'email',              v_profile.email,
      'sub_status',         v_sub.status,
      'start_date',         v_sub.start_date,
      'end_date',           v_sub.end_date
    ),
    'subscription', CASE WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
      'id',               v_sub.id,
      'member_id',        v_sub.member_id,
      'status',           v_sub.status,
      'start_date',       v_sub.start_date,
      'end_date',         v_sub.end_date,
      'assigned_points',  v_sub.assigned_points,
      'consumed_points',  v_sub.consumed_points,
      'remaining_points', v_sub.remaining_points,
      'created_at',       v_sub.created_at
    ) ELSE null END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'member', null, 'subscription', null);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_merchant_member(uuid, uuid) TO authenticated;

-- ─── 2. FIX: assign_points_to_member — created_by يستخدم merchants.created_by (user_id الصحيح) ──
CREATE OR REPLACE FUNCTION public.assign_points_to_member(
  p_merchant_id     uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_reason          text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_admin_id        uuid    DEFAULT NULL,
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member          merchant_members%ROWTYPE;
  v_wallet          merchant_wallets%ROWTYPE;
  v_tx_id           text;
  v_bal_before      integer;
  v_bal_after       integer;
  v_merchant_owner  uuid;  -- FIX: user_id صاحب التاجر
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  -- FIX: جلب user_id صاحب التاجر (يوجد في profiles)
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT * INTO v_wallet FROM public.merchant_wallets
  WHERE merchant_id = p_merchant_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'رصيد المحفظة غير كافٍ');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_bal_after  := v_bal_before + p_amount;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  UPDATE public.merchant_wallets
  SET balance = balance - p_amount, updated_at = NOW()
  WHERE merchant_id = p_merchant_id;

  UPDATE public.merchant_members
  SET assigned_points   = assigned_points  + p_amount,
      remaining_points  = remaining_points + p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after,
    reason, notes, created_by
  ) VALUES (
    v_tx_id,
    v_member.id,
    p_merchant_id, p_user_id,
    'assign', p_amount, v_bal_before, v_bal_after,
    p_reason, p_notes,
    COALESCE(p_admin_id, v_merchant_owner)  -- FIX: استخدام user_id الصحيح
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'balance_before', v_bal_before,
    'balance_after',  v_bal_after
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_points_to_member(uuid,uuid,integer,text,text,uuid,text) TO authenticated;

-- ─── 3. FIX: increase_member_points ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increase_member_points(
  p_merchant_id     uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_reason          text DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_admin_id        uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_tx_id          text;
  v_bal_before     integer;
  v_merchant_owner uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::text);

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
    p_reason, p_notes, COALESCE(p_admin_id, v_merchant_owner)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.increase_member_points(uuid,uuid,integer,text,text,uuid,text) TO authenticated;

-- ─── 4. FIX: decrease_member_points ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrease_member_points(
  p_merchant_id     uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_reason          text DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_admin_id        uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_tx_id          text;
  v_bal_before     integer;
  v_merchant_owner uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  IF v_member.remaining_points < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'النقاط المتبقية غير كافية');
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
    p_reason, p_notes, COALESCE(p_admin_id, v_merchant_owner)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrease_member_points(uuid,uuid,integer,text,text,uuid,text) TO authenticated;

-- ─── 5. FIX: activate_member_subscription ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_start_date  timestamptz DEFAULT NULL,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_sub_id         uuid;
  v_start          timestamptz;
  v_end            timestamptz;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_start := COALESCE(p_start_date, NOW());
  v_end   := v_start + (p_days || ' days')::interval;
  v_sub_id := gen_random_uuid();

  -- إلغاء الاشتراكات النشطة السابقة
  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE member_id = v_member.id AND status = 'active';

  INSERT INTO public.merchant_member_subscriptions(
    id, member_id, merchant_id, user_id, status,
    start_date, end_date, assigned_points, consumed_points, remaining_points
  ) VALUES (
    v_sub_id, v_member.id, p_merchant_id, p_user_id, 'active',
    v_start, v_end, p_points, 0, p_points
  );

  UPDATE public.merchant_members
  SET status            = 'active',
      activated_at      = v_start,
      expired_at        = v_end,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by, correlation_id
    ) VALUES (
      gen_random_uuid()::text, v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points, v_member.remaining_points, v_member.remaining_points + p_points,
      'تفعيل اشتراك', COALESCE(p_admin_id, v_merchant_owner), v_sub_id::text
    );

    UPDATE public.merchant_members
    SET assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points
    WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'start_date', v_start,
    'end_date', v_end
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid,uuid,integer,integer,timestamptz,uuid) TO authenticated;

-- ─── 6. FIX: renew_member_subscription ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_start_date  timestamptz DEFAULT NULL,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member         merchant_members%ROWTYPE;
  v_sub            merchant_member_subscriptions%ROWTYPE;
  v_new_end        timestamptz;
  v_merchant_owner uuid;
BEGIN
  SELECT created_by INTO v_merchant_owner FROM public.merchants WHERE id = p_merchant_id;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT * INTO v_sub
  FROM public.merchant_member_subscriptions
  WHERE member_id = v_member.id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  -- تمديد من نهاية الاشتراك الحالي أو من الآن
  v_new_end := COALESCE(
    CASE WHEN v_sub.end_date > NOW() THEN v_sub.end_date ELSE NULL END,
    COALESCE(p_start_date, NOW())
  ) + (p_days || ' days')::interval;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.merchant_member_subscriptions
    SET end_date = v_new_end,
        assigned_points  = assigned_points  + p_points,
        remaining_points = remaining_points + p_points,
        updated_at       = NOW()
    WHERE id = v_sub.id;
  ELSE
    INSERT INTO public.merchant_member_subscriptions(
      member_id, merchant_id, user_id, status,
      start_date, end_date, assigned_points, consumed_points, remaining_points
    ) VALUES (
      v_member.id, p_merchant_id, p_user_id, 'active',
      COALESCE(p_start_date, NOW()), v_new_end, p_points, 0, p_points
    );
  END IF;

  UPDATE public.merchant_members
  SET expired_at = v_new_end, last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger(
      transaction_id, member_id, merchant_id, user_id,
      type, amount, balance_before, balance_after,
      reason, created_by
    ) VALUES (
      gen_random_uuid()::text, v_member.id, p_merchant_id, p_user_id,
      'subscription_bonus', p_points, v_member.remaining_points, v_member.remaining_points + p_points,
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
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid,uuid,integer,integer,timestamptz,uuid) TO authenticated;

-- ─── 7. FIX: set_member_status — تأكيد الإصلاح ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_member_status(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_new_status  text,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member merchant_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  UPDATE public.merchant_members
  SET status            = p_new_status::member_status,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_member_status(uuid, uuid, text, uuid) TO authenticated;

-- ─── 8. FIX: promote_to_merchant — إنشاء merchant_invite تلقائياً ─────────────────
CREATE OR REPLACE FUNCTION public.promote_to_merchant(
  p_user_id   uuid,
  p_name      text DEFAULT NULL,
  p_admin_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant   merchants%ROWTYPE;
  v_new_code   text;
  v_profile    profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'مستخدم غير موجود');
  END IF;

  -- تحقق هل عنده merchant مرتبط مسبقاً
  SELECT * INTO v_merchant FROM merchants WHERE created_by = p_user_id LIMIT 1;

  IF NOT FOUND THEN
    -- توليد كود دعوة فريد
    LOOP
      v_new_code := lower(substring(md5(random()::text || clock_timestamp()::text), 1, 12));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM merchants WHERE invite_code = v_new_code);
    END LOOP;

    INSERT INTO merchants(name, invite_code, status, created_by)
    VALUES (
      COALESCE(p_name, v_profile.username, 'Merchant'),
      v_new_code,
      'active',
      p_user_id
    )
    RETURNING * INTO v_merchant;
  ELSE
    -- إعادة تفعيل
    UPDATE merchants
    SET status = 'active', updated_at = NOW()
    WHERE id = v_merchant.id
    RETURNING * INTO v_merchant;
  END IF;

  -- ربط المستخدم بالمتجر
  UPDATE profiles
  SET role = 'merchant', merchant_id = v_merchant.id, updated_at = NOW()
  WHERE id = p_user_id;

  -- FIX: إنشاء merchant_invite تلقائياً إن لم تكن موجودة
  IF NOT EXISTS (SELECT 1 FROM merchant_invites WHERE merchant_id = v_merchant.id) THEN
    INSERT INTO merchant_invites(merchant_id, token, status)
    VALUES (v_merchant.id, _gen_invite_token(), 'active');
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'merchant_id', v_merchant.id,
    'invite_code', v_merchant.invite_code
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.promote_to_merchant(uuid, text, uuid) TO authenticated;

-- ─── 9. NEW: demote_from_merchant — تحويل تاجر إلى مستخدم عادي ──────────────────
CREATE OR REPLACE FUNCTION public.demote_from_merchant(
  p_user_id  uuid,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant merchants%ROWTYPE;
BEGIN
  SELECT * INTO v_merchant FROM merchants WHERE created_by = p_user_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'المستخدم ليس تاجراً');
  END IF;

  -- إيقاف المتجر مؤقتاً (لا حذف — يبقى البيانات محفوظة)
  UPDATE merchants
  SET status = 'inactive', updated_at = NOW()
  WHERE id = v_merchant.id;

  -- تغيير role المستخدم وإزالة merchant_id
  UPDATE profiles
  SET role = 'user', merchant_id = NULL, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success',     true,
    'merchant_id', v_merchant.id,
    'message',     'تم تحويل المستخدم إلى user — بيانات المتجر محفوظة'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.demote_from_merchant(uuid, uuid) TO authenticated;

-- ─── 10. FIX: إنشاء merchant_invites للتجار الموجودين بدون invite ─────────────────
INSERT INTO merchant_invites (merchant_id, token, status)
SELECT m.id, _gen_invite_token(), 'active'
FROM merchants m
WHERE m.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM merchant_invites mi WHERE mi.merchant_id = m.id
  );

-- ─── 11. FIX: get_merchant_member history (member_id reference) ──────────────────
CREATE OR REPLACE FUNCTION public.get_member_history(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member   merchant_members%ROWTYPE;
  v_total    integer;
  v_rows     jsonb;
BEGIN
  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'total', 0, 'items', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM merchant_member_ledger
  WHERE member_id = v_member.id;  -- FIX: v_member.id (not member_id)

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          l.id,
      'type',        l.type,
      'amount',      l.amount,
      'balance_before', l.balance_before,
      'balance_after',  l.balance_after,
      'reason',      l.reason,
      'created_at',  l.created_at
    ) ORDER BY l.created_at DESC
  ), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT * FROM merchant_member_ledger
    WHERE member_id = v_member.id  -- FIX
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) l;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'items', v_rows);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'total', 0, 'items', '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_member_history(uuid, uuid, integer, integer) TO authenticated;
