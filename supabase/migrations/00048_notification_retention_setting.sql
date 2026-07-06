-- إعداد مدة الاحتفاظ بالإشعارات (بالأيام)
INSERT INTO app_settings (key, value)
VALUES ('notification_retention_days', '20')
ON CONFLICT (key) DO NOTHING;

-- دالة RPC لحذف إشعارات مستخدم بعينه (حذف نهائي)
CREATE OR REPLACE FUNCTION delete_all_user_notifications(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM notifications WHERE user_id = p_user_id;
END;
$$;

-- دالة RPC لحذف الإشعارات القديمة (تلقائي بحسب الإعداد)
CREATE OR REPLACE FUNCTION purge_old_notifications(p_days INT DEFAULT 20)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;