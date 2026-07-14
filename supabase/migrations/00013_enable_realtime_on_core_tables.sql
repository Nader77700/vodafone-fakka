
-- تفعيل Realtime على الجداول الأساسية
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE operations;
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
