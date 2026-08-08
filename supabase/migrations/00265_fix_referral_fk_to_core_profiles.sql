
-- إضافة FK من جداول الإحالات إلى core_profiles حتى يتعرف PostgREST على العلاقة

ALTER TABLE public.referral_records
  ADD CONSTRAINT referral_records_referrer_core_fk
    FOREIGN KEY (referrer_id) REFERENCES public.core_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT referral_records_referred_core_fk
    FOREIGN KEY (referred_id) REFERENCES public.core_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.referral_task_completions
  ADD CONSTRAINT referral_task_completions_user_core_fk
    FOREIGN KEY (user_id) REFERENCES public.core_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.referral_balances
  ADD CONSTRAINT referral_balances_user_core_fk
    FOREIGN KEY (user_id) REFERENCES public.core_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.referral_reward_logs
  ADD CONSTRAINT referral_reward_logs_user_core_fk
    FOREIGN KEY (user_id) REFERENCES public.core_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.referral_codes
  ADD CONSTRAINT referral_codes_user_core_fk
    FOREIGN KEY (user_id) REFERENCES public.core_profiles(id) ON DELETE CASCADE;
