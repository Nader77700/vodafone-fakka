
-- ══════════════════════════════════════════════════════════════
-- نظام الإحالات — المرحلة الأولى (Foundation)
-- جداول مستقلة تماماً — لا تعدّل أي جدول حالي
-- ══════════════════════════════════════════════════════════════

-- 1. جدول أكواد الإحالة — كود فريد لكل مستخدم
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code          text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_user_id_key UNIQUE (user_id)
);

-- 2. جدول سجلات الإحالات
CREATE TABLE IF NOT EXISTS public.referral_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code     text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','rejected')),
  rejection_reason  text,
  referred_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  CONSTRAINT referral_records_referred_id_key UNIQUE (referred_id)
);

-- 3. إعدادات نظام الإحالات (يُدار من السيرفر)
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id                    integer PRIMARY KEY DEFAULT 1,
  system_enabled        boolean NOT NULL DEFAULT true,
  accepting_referrals   boolean NOT NULL DEFAULT true,
  counting_paused       boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id),
  CONSTRAINT referral_settings_singleton CHECK (id = 1)
);

-- أدرج الإعدادات الافتراضية
INSERT INTO public.referral_settings (id, system_enabled, accepting_referrals, counting_paused)
VALUES (1, true, true, false)
ON CONFLICT (id) DO NOTHING;

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code    ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_records_referrer ON public.referral_records(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_referred ON public.referral_records(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_records_status   ON public.referral_records(status);
CREATE INDEX IF NOT EXISTS idx_referral_records_code     ON public.referral_records(referral_code);

-- ══════════════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.referral_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;

-- referral_codes: كل مستخدم يرى كوده فقط — الأدمن يرى الكل
CREATE POLICY "referral_codes_owner_read"
  ON public.referral_codes FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

CREATE POLICY "referral_codes_insert_own"
  ON public.referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- referral_records: المستخدم يرى سجلاته (داعياً أو مدعواً) — الأدمن يرى الكل
CREATE POLICY "referral_records_participant_read"
  ON public.referral_records FOR SELECT
  USING (
    auth.uid() = referrer_id
    OR auth.uid() = referred_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

CREATE POLICY "referral_records_insert"
  ON public.referral_records FOR INSERT
  WITH CHECK (true);

CREATE POLICY "referral_records_admin_update"
  ON public.referral_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

-- referral_settings: الكل يقرأ — الأدمن فقط يعدّل
CREATE POLICY "referral_settings_read_all"
  ON public.referral_settings FOR SELECT
  USING (true);

CREATE POLICY "referral_settings_admin_update"
  ON public.referral_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

-- ══════════════════════════════════════════════════════════════
-- Functions
-- ══════════════════════════════════════════════════════════════

-- توليد كود إحالة فريد (8 أحرف كبيرة + أرقام)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text := '';
  i     int;
BEGIN
  FOR i IN 1..8 LOOP
    code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- الحصول على كود الإحالة الخاص بالمستخدم أو إنشاؤه تلقائياً
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_attempt int := 0;
BEGIN
  -- تحقق هل يوجد كود مسبقاً
  SELECT code INTO v_code
  FROM public.referral_codes
  WHERE user_id = p_user_id;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- أنشئ كوداً فريداً مع retry
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after 20 attempts';
    END IF;

    v_code := public.generate_referral_code();

    BEGIN
      INSERT INTO public.referral_codes (user_id, code)
      VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- الكود مكرر، جرب مجدداً
      CONTINUE;
    END;
  END LOOP;
END;
$$;

-- التحقق من كود الإحالة وإرجاع اسم صاحبه
CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_settings public.referral_settings%ROWTYPE;
BEGIN
  -- فحص إعدادات النظام أولاً
  SELECT * INTO v_settings FROM public.referral_settings WHERE id = 1;
  IF NOT v_settings.system_enabled THEN
    RETURN jsonb_build_object('valid', false, 'error', 'system_disabled');
  END IF;
  IF NOT v_settings.accepting_referrals THEN
    RETURN jsonb_build_object('valid', false, 'error', 'not_accepting');
  END IF;

  -- ابحث عن الكود
  SELECT rc.user_id, p.username
  INTO v_user_id, v_username
  FROM public.referral_codes rc
  JOIN public.profiles p ON p.id = rc.user_id
  WHERE rc.code = upper(trim(p_code));

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'code_not_found');
  END IF;

  RETURN jsonb_build_object(
    'valid',    true,
    'user_id',  v_user_id,
    'username', v_username
  );
END;
$$;

-- تسجيل إحالة جديدة مع فحص الأهلية
CREATE OR REPLACE FUNCTION public.register_referral(
  p_referral_code text,
  p_referred_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id    uuid;
  v_settings       public.referral_settings%ROWTYPE;
  v_status         text := 'pending';
  v_reject_reason  text;
  v_referred_email text;
  v_referred_created_at timestamptz;
BEGIN
  SELECT * INTO v_settings FROM public.referral_settings WHERE id = 1;
  IF NOT v_settings.system_enabled OR NOT v_settings.accepting_referrals THEN
    RETURN jsonb_build_object('success', false, 'error', 'system_disabled');
  END IF;

  -- ابحث عن الـ referrer
  SELECT user_id INTO v_referrer_id
  FROM public.referral_codes
  WHERE code = upper(trim(p_referral_code));

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- لا يمكن دعوة نفسك
  IF v_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_referral');
  END IF;

  -- هل سُجِّل مسبقاً؟
  IF EXISTS (SELECT 1 FROM public.referral_records WHERE referred_id = p_referred_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  -- ── نظام الحماية: فحص الأهلية ──
  -- هل الحساب المُشار إليه حديث جداً (تسجيل وإحالة في نفس اللحظة دائماً صح)
  -- يمكن توسيع هذا المنطق لاحقاً
  IF v_settings.counting_paused THEN
    v_status := 'pending';
  ELSE
    v_status := 'accepted';
  END IF;

  -- سجّل الإحالة
  INSERT INTO public.referral_records (
    referrer_id, referred_id, referral_code,
    status, rejection_reason, resolved_at
  ) VALUES (
    v_referrer_id, p_referred_id, upper(trim(p_referral_code)),
    v_status, v_reject_reason,
    CASE WHEN v_status != 'pending' THEN now() ELSE NULL END
  );

  RETURN jsonb_build_object('success', true, 'status', v_status);
END;
$$;

-- إحصائيات الإحالات للمستخدم
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code        text;
  v_accepted    int;
  v_pending     int;
  v_rejected    int;
  v_total       int;
BEGIN
  SELECT code INTO v_code FROM public.referral_codes WHERE user_id = p_user_id;

  SELECT
    COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
    COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
    COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
    COUNT(*)                                    AS total
  INTO v_accepted, v_pending, v_rejected, v_total
  FROM public.referral_records
  WHERE referrer_id = p_user_id;

  RETURN jsonb_build_object(
    'code',     v_code,
    'accepted', COALESCE(v_accepted, 0),
    'pending',  COALESCE(v_pending,  0),
    'rejected', COALESCE(v_rejected, 0),
    'total',    COALESCE(v_total,    0)
  );
END;
$$;

-- إحصائيات الإحالات لإدارة الأدمن
CREATE OR REPLACE FUNCTION public.get_all_referral_stats()
RETURNS TABLE (
  user_id        uuid,
  username       text,
  referral_code  text,
  total          bigint,
  accepted       bigint,
  pending        bigint,
  rejected       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.user_id,
    p.username,
    rc.code AS referral_code,
    COUNT(rr.id)                                       AS total,
    COUNT(rr.id) FILTER (WHERE rr.status = 'accepted') AS accepted,
    COUNT(rr.id) FILTER (WHERE rr.status = 'pending')  AS pending,
    COUNT(rr.id) FILTER (WHERE rr.status = 'rejected') AS rejected
  FROM public.referral_codes rc
  JOIN public.profiles p ON p.id = rc.user_id
  LEFT JOIN public.referral_records rr ON rr.referrer_id = rc.user_id
  GROUP BY rc.user_id, p.username, rc.code
  ORDER BY total DESC;
END;
$$;
