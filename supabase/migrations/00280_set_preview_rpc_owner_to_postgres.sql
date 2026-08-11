-- تغيير مالك دالات Preview Mode إلى postgres (مالك الجدول)
-- لتجنب منح أذونات واسعة على الجدول

ALTER FUNCTION public.enter_preview_mode(uuid) OWNER TO postgres;
ALTER FUNCTION public.convert_preview_to_subscribed(uuid) OWNER TO postgres;

-- إزالة الأذونات غير الضرورية (تم منحها في migration السابقة)
REVOKE ALL PRIVILEGES ON TABLE public.core_profiles FROM pg_database_owner;
REVOKE ALL PRIVILEGES ON TABLE public.preview_mode_logs FROM pg_database_owner;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM pg_database_owner;
