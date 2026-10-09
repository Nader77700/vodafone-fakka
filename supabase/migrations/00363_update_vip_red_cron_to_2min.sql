-- تحديث جدولة فودافون ريد لتعمل كل دقيقتين بدلاً من 5 دقائق لسرعة الفحص في الخلفية
DO $$
DECLARE
    service_role_key TEXT;
    supabase_url TEXT;
BEGIN
    SELECT decrypted_secret INTO service_role_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'service_role_key' 
    LIMIT 1;

    SELECT decrypted_secret INTO supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'supabase_url' 
    LIMIT 1;

    IF service_role_key IS NOT NULL AND supabase_url IS NOT NULL THEN
        -- إلغاء الجدولة السابقة إن وجدت
        BEGIN
            PERFORM cron.unschedule('vip-red-auto-scan');
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        -- إنشاء الجدولة الجديدة كل دقيقتين بمهلة 60 ثانية كاملة
        PERFORM cron.schedule(
            'vip-red-auto-scan',
            '*/2 * * * *',
            format(
                $cmd$
                SELECT net.http_post(
                    url := '%s/functions/v1/vip-red-auto-scan',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer %s',
                        'x-internal-key', 'vfp_internal_push_2025'
                    ),
                    body := jsonb_build_object(
                        'execution_source', 'server_cron',
                        'timestamp', NOW()::text
                    ),
                    timeout_milliseconds := 60000
                );
                $cmd$,
                supabase_url,
                service_role_key
            )
        );
    END IF;
END $$;