-- إضافة حقلَي guard لمنع تكرار إشعارات انتهاء الاشتراك
ALTER TABLE subscriptions
  ADD COLUMN expiry_notif_48h_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN expiry_notif_24h_sent boolean NOT NULL DEFAULT false;