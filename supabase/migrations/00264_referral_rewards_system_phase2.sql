
-- ══════════════════════════════════════════════════════════════
-- نظام مكافآت الإحالات — المرحلة الثانية
-- جداول مستقلة تماماً — لا تُعدَّل أي جداول حالية
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 1. جدول مهام الإحالات (يُدار من لوحة التحكم)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text,
  required_referrals  int  NOT NULL DEFAULT 10 CHECK (required_referrals > 0),
  reward_type         text NOT NULL DEFAULT 'operations'
                      CHECK (reward_type IN ('operations')),
  reward_value        int  NOT NULL DEFAULT 10 CHECK (reward_value > 0),
  daily_limit         int  NOT NULL DEFAULT 0,   -- 0 = بلا حد
  is_active           boolean NOT NULL DEFAULT true,
  starts_at           timestamptz,
  ends_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id)
);

-- ─────────────────────────────────────────
-- 2. جدول إنجازات المستخدمين للمهام
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_task_completions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES public.referral_tasks(id) ON DELETE CASCADE,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  claim_status    text NOT NULL DEFAULT 'unclaimed'
                  CHECK (claim_status IN ('unclaimed','claimed','failed','rejected')),
  claimed_at      timestamptz,
  reward_value    int,
  reject_reason   text,
  CONSTRAINT referral_task_completions_unique UNIQUE (user_id, task_id)
);

-- ─────────────────────────────────────────
-- 3. جدول رصيد الإحالات لكل مستخدم
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_earned    int  NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  total_used      int  NOT NULL DEFAULT 0 CHECK (total_used   >= 0),
  last_claim_at   timestamptz,
  last_transfer_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_balances_user_unique UNIQUE (user_id)
);

-- ─────────────────────────────────────────
-- 4. جدول سجلات المكافآت (كل مطالبة وتحويل)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_reward_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id           uuid REFERENCES public.referral_tasks(id),
  task_title        text,
  log_type          text NOT NULL
                    CHECK (log_type IN ('claim','transfer','manual_grant','manual_deduct','transfer_cancel')),
  operations        int  NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success','failed','rejected','pending','cancelled')),
  transfer_valid_from  timestamptz,
  transfer_valid_until timestamptz,
  notes             text,
  admin_id          uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- 5. إعدادات نظام المكافآت (Live — بلا تحديث تطبيق)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_reward_settings (
  id                      integer PRIMARY KEY DEFAULT 1,
  rewards_system_enabled  boolean NOT NULL DEFAULT true,
  tasks_enabled           boolean NOT NULL DEFAULT true,
  claims_enabled          boolean NOT NULL DEFAULT true,
  transfers_enabled       boolean NOT NULL DEFAULT true,
  min_transfer_ops        int     NOT NULL DEFAULT 10,
  transfer_validity_days  int     NOT NULL DEFAULT 7,
  max_claims_per_day      int     NOT NULL DEFAULT 5,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id),
  CONSTRAINT referral_reward_settings_singleton CHECK (id = 1)
);

INSERT INTO public.referral_reward_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────
-- 6. Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ref_tasks_active     ON public.referral_tasks(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_ref_completions_user ON public.referral_task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_ref_completions_task ON public.referral_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_ref_completions_status ON public.referral_task_completions(claim_status);
CREATE INDEX IF NOT EXISTS idx_ref_balances_user    ON public.referral_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_ref_reward_logs_user ON public.referral_reward_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ref_reward_logs_type ON public.referral_reward_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_ref_reward_logs_date ON public.referral_reward_logs(created_at DESC);

-- ─────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────
ALTER TABLE public.referral_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_task_completions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_balances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reward_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reward_settings    ENABLE ROW LEVEL SECURITY;

-- referral_tasks: الكل يقرأ النشطة — الأدمن يقرأ الكل ويعدّل
CREATE POLICY "ref_tasks_read_active"  ON public.referral_tasks FOR SELECT USING (is_active = true OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
CREATE POLICY "ref_tasks_admin_all"    ON public.referral_tasks FOR ALL    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

-- referral_task_completions
CREATE POLICY "ref_completions_owner_read"  ON public.referral_task_completions FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
CREATE POLICY "ref_completions_insert_fn"   ON public.referral_task_completions FOR INSERT WITH CHECK (true);
CREATE POLICY "ref_completions_admin_upd"   ON public.referral_task_completions FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

-- referral_balances
CREATE POLICY "ref_balances_owner_read"   ON public.referral_balances FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
CREATE POLICY "ref_balances_insert_fn"    ON public.referral_balances FOR INSERT WITH CHECK (true);
CREATE POLICY "ref_balances_update_fn"    ON public.referral_balances FOR UPDATE USING (true);

-- referral_reward_logs
CREATE POLICY "ref_logs_owner_read"  ON public.referral_reward_logs FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
CREATE POLICY "ref_logs_insert_fn"   ON public.referral_reward_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "ref_logs_admin_upd"   ON public.referral_reward_logs FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

-- referral_reward_settings: الكل يقرأ — الأدمن يعدّل
CREATE POLICY "ref_reward_settings_read"       ON public.referral_reward_settings FOR SELECT USING (true);
CREATE POLICY "ref_reward_settings_admin_upd"  ON public.referral_reward_settings FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

-- ══════════════════════════════════════════════════════════════
-- Functions
-- ══════════════════════════════════════════════════════════════

-- ─── A. التحقق من أهلية المطالبة (anti-fraud) ───
CREATE OR REPLACE FUNCTION public.rw_check_claim_eligibility(
  p_user_id uuid,
  p_task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task        public.referral_tasks%ROWTYPE;
  v_settings    public.referral_reward_settings%ROWTYPE;
  v_accepted    int;
  v_completion  public.referral_task_completions%ROWTYPE;
  v_claims_today int;
BEGIN
  -- قراءة الإعدادات
  SELECT * INTO v_settings FROM public.referral_reward_settings WHERE id = 1;
  IF NOT v_settings.rewards_system_enabled THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'system_disabled');
  END IF;
  IF NOT v_settings.tasks_enabled THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'tasks_disabled');
  END IF;
  IF NOT v_settings.claims_enabled THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'claims_disabled');
  END IF;

  -- تحقق من المهمة
  SELECT * INTO v_task FROM public.referral_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'task_not_found');
  END IF;
  IF NOT v_task.is_active THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'task_inactive');
  END IF;
  IF v_task.ends_at IS NOT NULL AND v_task.ends_at < now() THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'task_expired');
  END IF;
  IF v_task.starts_at IS NOT NULL AND v_task.starts_at > now() THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'task_not_started');
  END IF;

  -- هل يوجد completion مسبق؟
  SELECT * INTO v_completion
  FROM public.referral_task_completions
  WHERE user_id = p_user_id AND task_id = p_task_id;

  IF v_completion.id IS NOT NULL THEN
    IF v_completion.claim_status = 'claimed' THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'already_claimed');
    END IF;
    IF v_completion.claim_status = 'rejected' THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'claim_rejected');
    END IF;
  END IF;

  -- عدد الدعوات المقبولة
  SELECT COUNT(*) INTO v_accepted
  FROM public.referral_records
  WHERE referrer_id = p_user_id AND status = 'accepted';

  IF v_accepted < v_task.required_referrals THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'insufficient_referrals',
      'current', v_accepted,
      'required', v_task.required_referrals
    );
  END IF;

  -- حد المطالبات اليومي
  SELECT COUNT(*) INTO v_claims_today
  FROM public.referral_reward_logs
  WHERE user_id = p_user_id
    AND log_type = 'claim'
    AND status = 'success'
    AND created_at > (now() - interval '1 day');

  IF v_settings.max_claims_per_day > 0 AND v_claims_today >= v_settings.max_claims_per_day THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'daily_limit_reached');
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'reward_value', v_task.reward_value,
    'accepted_referrals', v_accepted
  );
END;
$$;

-- ─── B. تنفيذ المطالبة بالمكافأة ───
CREATE OR REPLACE FUNCTION public.rw_claim_reward(
  p_user_id uuid,
  p_task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eligibility jsonb;
  v_reward_value int;
  v_task_title text;
  v_completion_id uuid;
BEGIN
  -- تحقق مرة أخرى
  v_eligibility := public.rw_check_claim_eligibility(p_user_id, p_task_id);
  IF NOT (v_eligibility->>'eligible')::boolean THEN
    RETURN jsonb_build_object('success', false, 'reason', v_eligibility->>'reason');
  END IF;

  v_reward_value := (v_eligibility->>'reward_value')::int;
  SELECT title INTO v_task_title FROM public.referral_tasks WHERE id = p_task_id;

  -- سجّل أو حدّث completion
  INSERT INTO public.referral_task_completions (user_id, task_id, claim_status, claimed_at, reward_value)
  VALUES (p_user_id, p_task_id, 'claimed', now(), v_reward_value)
  ON CONFLICT (user_id, task_id)
  DO UPDATE SET claim_status = 'claimed', claimed_at = now(), reward_value = v_reward_value;

  -- أضف للرصيد
  INSERT INTO public.referral_balances (user_id, total_earned, last_claim_at)
  VALUES (p_user_id, v_reward_value, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_earned  = public.referral_balances.total_earned + v_reward_value,
    last_claim_at = now(),
    updated_at    = now();

  -- سجّل في الـ log
  INSERT INTO public.referral_reward_logs (user_id, task_id, task_title, log_type, operations, status)
  VALUES (p_user_id, p_task_id, v_task_title, 'claim', v_reward_value, 'success');

  RETURN jsonb_build_object('success', true, 'reward_value', v_reward_value);
END;
$$;

-- ─── C. تنفيذ التحويل من رصيد الإحالات ───
CREATE OR REPLACE FUNCTION public.rw_transfer_balance(
  p_user_id uuid,
  p_amount   int DEFAULT NULL  -- NULL = كل الرصيد المتاح
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings    public.referral_reward_settings%ROWTYPE;
  v_balance     public.referral_balances%ROWTYPE;
  v_available   int;
  v_transfer_amount int;
  v_valid_until timestamptz;
BEGIN
  SELECT * INTO v_settings FROM public.referral_reward_settings WHERE id = 1;

  IF NOT v_settings.rewards_system_enabled THEN
    RETURN jsonb_build_object('success', false, 'reason', 'system_disabled');
  END IF;
  IF NOT v_settings.transfers_enabled THEN
    RETURN jsonb_build_object('success', false, 'reason', 'transfers_disabled');
  END IF;

  -- قراءة الرصيد
  SELECT * INTO v_balance FROM public.referral_balances WHERE user_id = p_user_id;
  IF v_balance.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_balance');
  END IF;

  v_available := v_balance.total_earned - v_balance.total_used;

  -- تحديد المبلغ
  IF p_amount IS NULL THEN
    v_transfer_amount := v_available;
  ELSE
    v_transfer_amount := p_amount;
  END IF;

  -- فحص الحد الأدنى
  IF v_transfer_amount < v_settings.min_transfer_ops THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'below_minimum',
      'minimum', v_settings.min_transfer_ops,
      'available', v_available
    );
  END IF;

  IF v_transfer_amount > v_available THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_balance', 'available', v_available);
  END IF;

  v_valid_until := now() + (v_settings.transfer_validity_days || ' days')::interval;

  -- خصم من الرصيد
  UPDATE public.referral_balances
  SET total_used = total_used + v_transfer_amount,
      last_transfer_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  -- سجّل التحويل
  INSERT INTO public.referral_reward_logs (
    user_id, log_type, operations, status,
    transfer_valid_from, transfer_valid_until
  )
  VALUES (
    p_user_id, 'transfer', v_transfer_amount, 'success',
    now(), v_valid_until
  );

  RETURN jsonb_build_object(
    'success',        true,
    'transferred',    v_transfer_amount,
    'valid_until',    v_valid_until,
    'remaining_balance', v_available - v_transfer_amount
  );
END;
$$;

-- ─── D. رصيد الإحالات مع إحصائيات ───
CREATE OR REPLACE FUNCTION public.rw_get_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance     public.referral_balances%ROWTYPE;
  v_settings    public.referral_reward_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_balance FROM public.referral_balances WHERE user_id = p_user_id;
  SELECT * INTO v_settings FROM public.referral_reward_settings WHERE id = 1;

  IF v_balance.id IS NULL THEN
    RETURN jsonb_build_object(
      'total_earned', 0, 'total_used', 0, 'available', 0,
      'last_claim_at', null, 'last_transfer_at', null,
      'min_transfer', v_settings.min_transfer_ops,
      'transfer_validity_days', v_settings.transfer_validity_days,
      'transfers_enabled', v_settings.transfers_enabled
    );
  END IF;

  RETURN jsonb_build_object(
    'total_earned',          v_balance.total_earned,
    'total_used',            v_balance.total_used,
    'available',             v_balance.total_earned - v_balance.total_used,
    'last_claim_at',         v_balance.last_claim_at,
    'last_transfer_at',      v_balance.last_transfer_at,
    'min_transfer',          v_settings.min_transfer_ops,
    'transfer_validity_days', v_settings.transfer_validity_days,
    'transfers_enabled',     v_settings.transfers_enabled
  );
END;
$$;

-- ─── E. المهام مع تقدم المستخدم ───
CREATE OR REPLACE FUNCTION public.rw_get_tasks_with_progress(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accepted_count int;
  v_settings       public.referral_reward_settings%ROWTYPE;
  v_result         jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_settings FROM public.referral_reward_settings WHERE id = 1;
  IF NOT v_settings.rewards_system_enabled OR NOT v_settings.tasks_enabled THEN
    RETURN jsonb_build_object('enabled', false, 'tasks', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO v_accepted_count
  FROM public.referral_records
  WHERE referrer_id = p_user_id AND status = 'accepted';

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                 t.id,
      'title',              t.title,
      'description',        t.description,
      'required_referrals', t.required_referrals,
      'reward_type',        t.reward_type,
      'reward_value',       t.reward_value,
      'daily_limit',        t.daily_limit,
      'starts_at',          t.starts_at,
      'ends_at',            t.ends_at,
      'is_active',          t.is_active,
      'current_progress',   v_accepted_count,
      'is_completed',       v_accepted_count >= t.required_referrals,
      'claim_status',       COALESCE(tc.claim_status, 'unclaimed'),
      'claimed_at',         tc.claimed_at,
      'reward_value_granted', tc.reward_value
    )
    ORDER BY t.required_referrals ASC
  )
  INTO v_result
  FROM public.referral_tasks t
  LEFT JOIN public.referral_task_completions tc
    ON tc.task_id = t.id AND tc.user_id = p_user_id
  WHERE t.is_active = true
    AND (t.starts_at IS NULL OR t.starts_at <= now())
    AND (t.ends_at   IS NULL OR t.ends_at   >= now());

  RETURN jsonb_build_object(
    'enabled', true,
    'tasks', COALESCE(v_result, '[]'::jsonb),
    'current_progress', v_accepted_count,
    'claims_enabled', v_settings.claims_enabled
  );
END;
$$;

-- ─── F. سجل المكافآت الكامل للمستخدم ───
CREATE OR REPLACE FUNCTION public.rw_get_reward_logs(
  p_user_id uuid,
  p_limit   int DEFAULT 50,
  p_offset  int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_total  int;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.referral_reward_logs
  WHERE user_id = p_user_id;

  SELECT jsonb_agg(row ORDER BY row.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      rl.id,
      rl.task_title,
      rl.log_type,
      rl.operations,
      rl.status,
      rl.transfer_valid_from,
      rl.transfer_valid_until,
      rl.notes,
      rl.created_at
    FROM public.referral_reward_logs rl
    WHERE rl.user_id = p_user_id
    ORDER BY rl.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) row;

  RETURN jsonb_build_object(
    'logs',  COALESCE(v_result, '[]'::jsonb),
    'total', COALESCE(v_total, 0)
  );
END;
$$;

-- ─── G. منح/خصم يدوي من الأدمن ───
CREATE OR REPLACE FUNCTION public.rw_admin_adjust_balance(
  p_admin_id   uuid,
  p_user_id    uuid,
  p_amount     int,      -- موجب = منح، سالب = خصم
  p_log_type   text,     -- 'manual_grant' | 'manual_deduct'
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin bool;
  v_balance  public.referral_balances%ROWTYPE;
BEGIN
  -- تحقق أن الطالب أدمن
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role IN ('admin','super_admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  IF p_log_type NOT IN ('manual_grant','manual_deduct') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_log_type');
  END IF;

  -- أنشئ رصيد إن لم يوجد
  INSERT INTO public.referral_balances (user_id, total_earned)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_balance FROM public.referral_balances WHERE user_id = p_user_id;

  IF p_log_type = 'manual_grant' THEN
    UPDATE public.referral_balances
    SET total_earned = total_earned + p_amount, updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    IF v_balance.total_earned - v_balance.total_used < p_amount THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_balance');
    END IF;
    UPDATE public.referral_balances
    SET total_used = total_used + p_amount, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.referral_reward_logs (user_id, log_type, operations, status, notes, admin_id)
  VALUES (p_user_id, p_log_type, ABS(p_amount), 'success', p_notes, p_admin_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── H. إلغاء تحويل (الأدمن) ───
CREATE OR REPLACE FUNCTION public.rw_admin_cancel_transfer(
  p_admin_id uuid,
  p_log_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log    public.referral_reward_logs%ROWTYPE;
  v_is_admin bool;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role IN ('admin','super_admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO v_log FROM public.referral_reward_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'log_not_found');
  END IF;
  IF v_log.log_type != 'transfer' OR v_log.status != 'success' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_cancellable');
  END IF;

  -- أعِد المبلغ للرصيد
  UPDATE public.referral_balances
  SET total_used = GREATEST(0, total_used - v_log.operations), updated_at = now()
  WHERE user_id = v_log.user_id;

  -- علّم الـ log بأنه ملغى
  UPDATE public.referral_reward_logs
  SET status = 'cancelled', notes = COALESCE(notes,'') || ' [ألغاه الأدمن]'
  WHERE id = p_log_id;

  -- أضف سجل إلغاء
  INSERT INTO public.referral_reward_logs (user_id, log_type, operations, status, notes, admin_id)
  VALUES (v_log.user_id, 'transfer_cancel', v_log.operations, 'success',
          'إلغاء تحويل ' || p_log_id, p_admin_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── I. إحصائيات الأدمن الشاملة ───
CREATE OR REPLACE FUNCTION public.rw_admin_get_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_claimed     int;
  v_total_transferred int;
  v_pending_claims    int;
  v_total_tasks       int;
  v_active_users      int;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN log_type='claim'    AND status='success' THEN operations ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN log_type='transfer' AND status='success' THEN operations ELSE 0 END), 0)
  INTO v_total_claimed, v_total_transferred
  FROM public.referral_reward_logs;

  SELECT COUNT(*) INTO v_pending_claims
  FROM public.referral_task_completions WHERE claim_status = 'unclaimed';

  SELECT COUNT(*) INTO v_total_tasks FROM public.referral_tasks WHERE is_active = true;
  SELECT COUNT(DISTINCT user_id) INTO v_active_users FROM public.referral_reward_logs WHERE created_at > now() - interval '30 days';

  RETURN jsonb_build_object(
    'total_claimed',      v_total_claimed,
    'total_transferred',  v_total_transferred,
    'pending_claims',     v_pending_claims,
    'active_tasks',       v_total_tasks,
    'active_users_30d',   v_active_users
  );
END;
$$;
