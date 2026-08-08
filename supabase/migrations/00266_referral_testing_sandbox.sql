
-- ══════════════════════════════════════════════════════════════
-- نظام الاختبار Sandbox - معزول تمامًا عن Production
-- ══════════════════════════════════════════════════════════════

-- 1. إعدادات الاختبار المؤقتة
CREATE TABLE IF NOT EXISTS public.referral_test_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid REFERENCES public.core_profiles(id) ON DELETE CASCADE,
  referral_req  int  NOT NULL DEFAULT 3,
  reward_ops    int  NOT NULL DEFAULT 5,
  min_transfer  int  NOT NULL DEFAULT 2,
  expiry_days   int  NOT NULL DEFAULT 1,
  daily_limit   int  NOT NULL DEFAULT 10,
  is_active     bool NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  notes         text
);

-- 2. جلسات الاختبار
CREATE TABLE IF NOT EXISTS public.referral_test_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      uuid NOT NULL REFERENCES public.core_profiles(id) ON DELETE CASCADE,
  settings_id   uuid REFERENCES public.referral_test_settings(id),
  session_name  text NOT NULL DEFAULT 'Test Session',
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','passed','failed','reset')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  fail_step     text,
  summary       jsonb
);

-- 3. مستخدمو الاختبار (مستقلون تمامًا عن auth.users)
CREATE TABLE IF NOT EXISTS public.referral_test_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.referral_test_sessions(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('referrer','referred')),
  username      text NOT NULL,
  referral_code text UNIQUE,
  device_fp     text,
  app_version   text,
  test_ip       text,
  account_status text NOT NULL DEFAULT 'active',
  subscription_status text NOT NULL DEFAULT 'none',
  test_balance  int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 4. سجل خطوات الاختبار التفصيلي
CREATE TABLE IF NOT EXISTS public.referral_test_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.referral_test_sessions(id) ON DELETE CASCADE,
  admin_id      uuid NOT NULL REFERENCES public.core_profiles(id) ON DELETE CASCADE,
  step_name     text NOT NULL,
  test_user_id  uuid REFERENCES public.referral_test_users(id),
  status        text NOT NULL CHECK (status IN ('pass','fail','skip','info')),
  data_before   jsonb,
  data_after    jsonb,
  error_msg     text,
  reject_reason text,
  verify_result text,
  logged_at     timestamptz NOT NULL DEFAULT now()
);

-- 5. RLS: أدمن فقط
ALTER TABLE public.referral_test_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_test_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_test_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_test_logs       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only_test_settings" ON public.referral_test_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.core_profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "admin_only_test_sessions" ON public.referral_test_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.core_profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "admin_only_test_users" ON public.referral_test_users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.core_profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "admin_only_test_logs" ON public.referral_test_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.core_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6. دالة تنظيف بيانات الاختبار
CREATE OR REPLACE FUNCTION public.reset_test_data(p_session_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_session_id IS NULL THEN
    DELETE FROM public.referral_test_logs;
    DELETE FROM public.referral_test_users;
    UPDATE public.referral_test_sessions SET status = 'reset', ended_at = now();
  ELSE
    DELETE FROM public.referral_test_logs    WHERE session_id = p_session_id;
    DELETE FROM public.referral_test_users   WHERE session_id = p_session_id;
    UPDATE public.referral_test_sessions SET status = 'reset', ended_at = now()
      WHERE id = p_session_id;
  END IF;
END;
$$;
