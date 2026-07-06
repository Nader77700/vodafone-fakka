
-- الفهارس المفقودة لتحسين الأداء وتحسين استعلامات RLS
-- operations: أكثر الجداول استعلاماً
CREATE INDEX IF NOT EXISTS idx_operations_user_id       ON public.operations(user_id);
CREATE INDEX IF NOT EXISTS idx_operations_performed_at  ON public.operations(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_status        ON public.operations(status);
CREATE INDEX IF NOT EXISTS idx_operations_user_performed ON public.operations(user_id, performed_at DESC);

-- notifications: تُستعلم بكثرة لعدد الغير مقروء
CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON public.notifications(user_id, is_read) WHERE is_read = false;

-- subscriptions: تُستعلم بالحالة في كل لوحة تحكم
CREATE INDEX IF NOT EXISTS idx_subscriptions_status     ON public.subscriptions(status);

-- license_keys: تُفلتر بالحالة في الأدمن
CREATE INDEX IF NOT EXISTS idx_license_keys_status      ON public.license_keys(status);

-- profiles: تُستعلم بالدور للتحقق من الصلاحيات
CREATE INDEX IF NOT EXISTS idx_profiles_role            ON public.profiles(role);

-- code_logs: تُستعلم بمعرف الكود
CREATE INDEX IF NOT EXISTS idx_code_logs_code_id        ON public.code_logs(code_id);
CREATE INDEX IF NOT EXISTS idx_code_logs_user_id        ON public.code_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_code_logs_created_at     ON public.code_logs(created_at DESC);
