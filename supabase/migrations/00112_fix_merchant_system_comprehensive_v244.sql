
-- ═══════════════════════════════════════════════════════════════════════════════
-- إصلاح شامل لنظام التجار — v3.0.245
-- يشمل: إصلاح member_id→id، حذف updated_at المفقود، welcome_instructions،
--        admin_get_merchants_overview، blocked_member_screen، RPC audit
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. إضافة عمود welcome_instructions للتجار ──────────────────────────────
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS welcome_instructions text   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instructions_version  integer NOT NULL DEFAULT 1;

-- ── 2. جدول تتبع قراءة التعليمات ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchant_welcome_seen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  seen_version    integer NOT NULL DEFAULT 1,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, user_id)
);
ALTER TABLE public.merchant_welcome_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member can manage own welcome_seen" ON public.merchant_welcome_seen;
CREATE POLICY "member can manage own welcome_seen" ON public.merchant_welcome_seen
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "merchant can read welcome_seen" ON public.merchant_welcome_seen;
CREATE POLICY "merchant can read welcome_seen" ON public.merchant_welcome_seen
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND merchant_id = merchant_welcome_seen.merchant_id)
  );

-- ── 3. إصلاح assign_points_to_member — v_member.member_id → v_member.id ──
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
  v_member     merchant_members%ROWTYPE;
  v_wallet     merchant_wallets%ROWTYPE;
  v_tx_id      text;
  v_bal_before integer;
  v_bal_after  integer;
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

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  SELECT * INTO v_wallet FROM public.merchant_wallets
  WHERE merchant_id = p_merchant_id
  FOR UPDATE;
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
    v_member.id,  -- FIX: كان v_member.member_id وهو خطأ
    p_merchant_id, p_user_id,
    'assign', p_amount, v_bal_before, v_bal_after,
    p_reason, p_notes, COALESCE(p_admin_id, p_merchant_id)
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
GRANT EXECUTE ON FUNCTION public.assign_points_to_member(uuid, uuid, integer, text, text, uuid, text) TO authenticated;

-- ── 4. إصلاح increase_member_points ─────────────────────────────────────────
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
  v_member     merchant_members%ROWTYPE;
  v_tx_id      text;
  v_bal_before integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  UPDATE public.merchant_members
  SET assigned_points   = assigned_points  + p_amount,
      remaining_points  = remaining_points + p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after, reason, notes, created_by
  ) VALUES (
    v_tx_id,
    v_member.id,  -- FIX
    p_merchant_id, p_user_id,
    'increase', p_amount, v_bal_before, v_bal_before + p_amount,
    p_reason, p_notes, COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.increase_member_points(uuid, uuid, integer, text, text, uuid, text) TO authenticated;

-- ── 5. إصلاح decrease_member_points ─────────────────────────────────────────
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
  v_member     merchant_members%ROWTYPE;
  v_tx_id      text;
  v_bal_before integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب أن يكون المبلغ أكبر من صفر');
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.merchant_member_ledger WHERE transaction_id = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO v_member FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'عضو غير موجود');
  END IF;

  IF v_member.remaining_points < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'نقاط غير كافية للخصم');
  END IF;

  v_bal_before := v_member.remaining_points;
  v_tx_id      := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  UPDATE public.merchant_members
  SET consumed_points   = consumed_points  + p_amount,
      remaining_points  = remaining_points - p_amount,
      last_operation_at = NOW()
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;

  INSERT INTO public.merchant_member_ledger(
    transaction_id, member_id, merchant_id, user_id,
    type, amount, balance_before, balance_after, reason, notes, created_by
  ) VALUES (
    v_tx_id,
    v_member.id,  -- FIX
    p_merchant_id, p_user_id,
    'decrease', -p_amount, v_bal_before, v_bal_before - p_amount,
    p_reason, p_notes, COALESCE(p_admin_id, p_merchant_id)
  );

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrease_member_points(uuid, uuid, integer, text, text, uuid, text) TO authenticated;

-- ── 6. إصلاح activate_member_subscription — حذف updated_at من merchant_members ─
CREATE OR REPLACE FUNCTION public.activate_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_start_date  date    DEFAULT NULL,
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
  v_real_start date;
BEGIN
  SELECT id INTO v_member_id FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العضو غير موجود');
  END IF;

  v_real_start := COALESCE(p_start_date, CURRENT_DATE);
  v_end_date   := v_real_start + p_days;

  UPDATE public.merchant_member_subscriptions
  SET status = 'cancelled'  -- لا updated_at هنا أيضاً
  WHERE member_id = v_member_id AND status = 'active';

  INSERT INTO public.merchant_member_subscriptions
    (member_id, merchant_id, user_id, status, start_date, end_date,
     assigned_points, remaining_points, activated_by)
  VALUES
    (v_member_id, p_merchant_id, p_user_id, 'active', v_real_start, v_end_date,
     p_points, p_points, COALESCE(p_admin_id, p_merchant_id))
  ON CONFLICT (member_id) DO UPDATE
  SET status = 'active', start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
      assigned_points = EXCLUDED.assigned_points, remaining_points = EXCLUDED.remaining_points,
      activated_by = EXCLUDED.activated_by
  RETURNING id INTO v_sub_id;

  -- تحديث merchant_members — بدون updated_at (لا يوجد هذا العمود)
  UPDATE public.merchant_members
  SET status            = 'active'::member_status,
      activated_at      = COALESCE(activated_at, NOW()),
      last_operation_at = NOW(),
      assigned_points   = assigned_points  + p_points,
      remaining_points  = remaining_points + p_points
  WHERE id = v_member_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger
      (member_id, merchant_id, user_id, type, amount, balance_after, reason, created_by)
    SELECT v_member_id, p_merchant_id, p_user_id,
           'subscription_bonus', p_points, remaining_points,
           'نقاط مع تفعيل الاشتراك', COALESCE(p_admin_id, p_merchant_id)
    FROM public.merchant_members WHERE id = v_member_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'start_date', v_real_start::text,
    'end_date',   v_end_date::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_member_subscription(uuid, uuid, integer, integer, date, uuid) TO authenticated;

-- ── 7. إصلاح renew_member_subscription — نفس الإصلاح ────────────────────────
CREATE OR REPLACE FUNCTION public.renew_member_subscription(
  p_merchant_id uuid,
  p_user_id     uuid,
  p_days        integer DEFAULT 30,
  p_points      integer DEFAULT 0,
  p_start_date  date    DEFAULT NULL,
  p_admin_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_cur_end   date;
  v_new_start date;
  v_new_end   date;
BEGIN
  SELECT id INTO v_member_id FROM public.merchant_members
  WHERE merchant_id = p_merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'العضو غير موجود');
  END IF;

  SELECT end_date INTO v_cur_end
  FROM public.merchant_member_subscriptions
  WHERE member_id = v_member_id AND status = 'active'
  ORDER BY end_date DESC LIMIT 1;

  v_new_start := COALESCE(
    p_start_date,
    CASE WHEN v_cur_end > CURRENT_DATE THEN v_cur_end ELSE CURRENT_DATE END
  );
  v_new_end := v_new_start + p_days;

  UPDATE public.merchant_member_subscriptions
  SET status = 'active', start_date = v_new_start, end_date = v_new_end,
      assigned_points = assigned_points + p_points,
      remaining_points = remaining_points + p_points
  WHERE member_id = v_member_id;

  UPDATE public.merchant_members
  SET status            = 'active'::member_status,
      last_operation_at = NOW(),
      assigned_points   = assigned_points  + p_points,
      remaining_points  = remaining_points + p_points
  WHERE id = v_member_id;

  IF p_points > 0 THEN
    INSERT INTO public.merchant_member_ledger
      (member_id, merchant_id, user_id, type, amount, balance_after, reason, created_by)
    SELECT v_member_id, p_merchant_id, p_user_id,
           'subscription_bonus', p_points, remaining_points,
           'نقاط مع تجديد الاشتراك', COALESCE(p_admin_id, p_merchant_id)
    FROM public.merchant_members WHERE id = v_member_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'start_date', v_new_start::text,
    'end_date',   v_new_end::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.renew_member_subscription(uuid, uuid, integer, integer, date, uuid) TO authenticated;

-- ── 8. RPC: welcome instructions ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_merchant_welcome_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id        uuid;
  v_instructions       text;
  v_inst_version       integer;
  v_seen_version       integer;
BEGIN
  SELECT m.id, m.welcome_instructions, m.instructions_version
  INTO v_merchant_id, v_instructions, v_inst_version
  FROM public.merchants m
  JOIN public.profiles p ON p.merchant_id = m.id
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('should_show', false);
  END IF;

  IF v_instructions IS NULL OR trim(v_instructions) = '' THEN
    RETURN jsonb_build_object('should_show', false);
  END IF;

  SELECT seen_version INTO v_seen_version
  FROM public.merchant_welcome_seen
  WHERE merchant_id = v_merchant_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'should_show',     (v_seen_version IS NULL OR v_seen_version < v_inst_version),
    'instructions',    v_instructions,
    'version',         v_inst_version,
    'merchant_id',     v_merchant_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_merchant_welcome_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_merchant_welcome(p_user_id uuid, p_merchant_id uuid, p_version integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.merchant_welcome_seen (merchant_id, user_id, seen_version)
  VALUES (p_merchant_id, p_user_id, p_version)
  ON CONFLICT (merchant_id, user_id) DO UPDATE SET seen_version = p_version, seen_at = NOW();
END;
$$;
GRANT EXECUTE ON FUNCTION public.dismiss_merchant_welcome(uuid, uuid, integer) TO authenticated;

-- RPC لتحديث تعليمات الترحيب من لوحة الأدمن
CREATE OR REPLACE FUNCTION public.admin_update_merchant_welcome(
  p_merchant_id  uuid,
  p_instructions text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  UPDATE public.merchants
  SET welcome_instructions  = p_instructions,
      instructions_version  = instructions_version + 1
  WHERE id = p_merchant_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_merchant_welcome(uuid, text) TO authenticated;

-- ── 9. RPC: admin merchants overview ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_merchants_overview(
  p_search   text    DEFAULT NULL,
  p_status   text    DEFAULT NULL,
  p_limit    integer DEFAULT 20,
  p_offset   integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  RETURN (
    WITH merchant_data AS (
      SELECT
        m.id,
        m.name,
        m.status,
        m.brand_color,
        m.logo_url,
        m.created_at,
        m.instructions_version,
        -- الرصيد
        COALESCE(w.balance, 0)         AS wallet_balance,
        -- إحصاءات الأعضاء
        COUNT(DISTINCT mm.id)          AS total_members,
        COUNT(DISTINCT CASE WHEN mm.status = 'active' THEN mm.id END) AS active_members,
        -- النقاط
        COALESCE(SUM(DISTINCT mm.assigned_points), 0)   AS total_points_assigned,
        COALESCE(SUM(DISTINCT mm.remaining_points), 0)  AS total_points_remaining,
        COALESCE(SUM(DISTINCT mm.consumed_points), 0)   AS total_points_consumed,
        -- الاشتراكات
        COUNT(DISTINCT CASE WHEN ms.status = 'active' THEN ms.id END)  AS active_subscriptions,
        COUNT(DISTINCT CASE WHEN ms.status = 'expired' THEN ms.id END) AS expired_subscriptions,
        -- الأكواد
        COUNT(DISTINCT lc.id)          AS total_codes,
        -- آخر نشاط
        MAX(mm.last_operation_at)      AS last_activity
      FROM public.merchants m
      LEFT JOIN public.merchant_wallets            w  ON w.merchant_id = m.id
      LEFT JOIN public.merchant_members            mm ON mm.merchant_id = m.id
      LEFT JOIN public.merchant_member_subscriptions ms ON ms.merchant_id = m.id
      LEFT JOIN public.license_codes               lc ON lc.merchant_id = m.id
      WHERE m.deleted_at IS NULL
        AND (p_search IS NULL OR m.name ILIKE '%' || p_search || '%')
        AND (p_status IS NULL OR m.status::text = p_status)
      GROUP BY m.id, w.balance
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ),
    total_count AS (
      SELECT COUNT(*) AS cnt FROM public.merchants
      WHERE deleted_at IS NULL
        AND (p_search IS NULL OR name ILIKE '%' || p_search || '%')
        AND (p_status IS NULL OR status::text = p_status)
    )
    SELECT jsonb_build_object(
      'success',   true,
      'total',     (SELECT cnt FROM total_count),
      'merchants', COALESCE(jsonb_agg(row_to_json(merchant_data.*)), '[]'::jsonb)
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_merchants_overview(text, text, integer, integer) TO authenticated;

-- ── 10. RPC: get_merchant_client_data — إضافة member_status للفرونتإند ──────
-- تحديث الـ RPC لإرجاع member_status بشكل صريح
CREATE OR REPLACE FUNCTION public.get_merchant_client_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant   record;
  v_member     record;
  v_sub        record;
  v_days_left  integer;
BEGIN
  -- التاجر
  SELECT m.id, m.name, m.status, m.brand_color, m.logo_url, m.welcome_msg
  INTO v_merchant
  FROM public.merchants m
  JOIN public.profiles p ON p.merchant_id = m.id
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_linked');
  END IF;

  -- العضو
  SELECT mm.id, mm.status AS member_status, mm.assigned_points,
         mm.consumed_points, mm.remaining_points,
         mm.created_at AS joined_at, mm.last_operation_at AS last_op_at,
         mm.activated_at
  INTO v_member
  FROM public.merchant_members mm
  WHERE mm.merchant_id = v_merchant.id AND mm.user_id = p_user_id;

  -- الاشتراك
  SELECT ms.id, ms.status, ms.start_date, ms.end_date,
         ms.assigned_points, ms.remaining_points, ms.consumed_points,
         CASE
           WHEN ms.end_date IS NOT NULL
           THEN GREATEST(0, ms.end_date - CURRENT_DATE)
           ELSE NULL
         END AS days_remaining
  INTO v_sub
  FROM public.merchant_member_subscriptions ms
  WHERE ms.member_id = v_member.id
  ORDER BY ms.created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'merchant', jsonb_build_object(
      'id',           v_merchant.id,
      'name',         v_merchant.name,
      'status',       v_merchant.status,
      'brand_color',  v_merchant.brand_color,
      'logo_url',     v_merchant.logo_url,
      'welcome_msg',  v_merchant.welcome_msg
    ),
    'member', CASE WHEN v_member.id IS NOT NULL THEN jsonb_build_object(
      'member_status',     v_member.member_status,
      'assigned_points',   v_member.assigned_points,
      'consumed_points',   v_member.consumed_points,
      'remaining_points',  v_member.remaining_points,
      'joined_at',         v_member.joined_at,
      'last_op_at',        v_member.last_op_at,
      'activated_at',      v_member.activated_at
    ) ELSE NULL END,
    'subscription', CASE WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
      'id',               v_sub.id,
      'status',           v_sub.status,
      'start_date',       v_sub.start_date,
      'end_date',         v_sub.end_date,
      'days_remaining',   v_sub.days_remaining,
      'assigned_points',  v_sub.assigned_points,
      'remaining_points', v_sub.remaining_points,
      'consumed_points',  v_sub.consumed_points
    ) ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_merchant_client_data(uuid) TO authenticated;

-- ── 11. RLS: فصل merchant_members من views المستخدمين الأساسيين ─────────────
-- التأكد أن profiles لا تكشف بيانات merchant_members
-- RLS على merchant_members: يرى التاجر أعضاءه فقط، والعضو يرى نفسه فقط
DO $$ BEGIN
  DROP POLICY IF EXISTS "merchant_member_own_read" ON public.merchant_members;
  DROP POLICY IF EXISTS "merchant_owner_read_members" ON public.merchant_members;
  DROP POLICY IF EXISTS "merchant_member_self_read" ON public.merchant_members;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "merchant_member_self_read" ON public.merchant_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "merchant_owner_read_members" ON public.merchant_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (merchant_id = merchant_members.merchant_id OR role IN ('admin', 'super_admin'))
    )
  );

-- ── 12. update_merchant_settings — دعم welcome_instructions ─────────────────
CREATE OR REPLACE FUNCTION public.update_merchant_settings(
  p_merchant_id         uuid,
  p_name                text    DEFAULT NULL,
  p_brand_color         text    DEFAULT NULL,
  p_logo_url            text    DEFAULT NULL,
  p_welcome_msg         text    DEFAULT NULL,
  p_welcome_instructions text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (merchant_id = p_merchant_id AND role = 'merchant'
      OR role IN ('admin', 'super_admin'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  UPDATE public.merchants
  SET
    name                  = COALESCE(p_name,                  name),
    brand_color           = COALESCE(p_brand_color,           brand_color),
    logo_url              = COALESCE(p_logo_url,              logo_url),
    welcome_msg           = COALESCE(p_welcome_msg,           welcome_msg),
    welcome_instructions  = CASE
      WHEN p_welcome_instructions IS NOT NULL
      THEN p_welcome_instructions
      ELSE welcome_instructions
    END,
    instructions_version  = CASE
      WHEN p_welcome_instructions IS NOT NULL AND p_welcome_instructions != COALESCE(welcome_instructions, '')
      THEN instructions_version + 1
      ELSE instructions_version
    END
  WHERE id = p_merchant_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_merchant_settings(uuid, text, text, text, text, text) TO authenticated;
