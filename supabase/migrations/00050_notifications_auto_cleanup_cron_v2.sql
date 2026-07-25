-- جدولة تنظيف الإشعارات الأقدم من 30 يوماً — يومياً الساعة 2 صباحاً
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- إزالة الجدولة القديمة إن وجدت
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-notifications') THEN
      PERFORM cron.unschedule('cleanup-old-notifications');
    END IF;
    -- إضافة الجدولة اليومية
    PERFORM cron.schedule(
      'cleanup-old-notifications',
      '0 2 * * *',
      'SELECT cleanup_old_notifications()'
    );
  END IF;
END $outer$;