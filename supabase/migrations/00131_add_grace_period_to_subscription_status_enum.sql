
-- إضافة grace_period لـ enum subscription_status
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'grace_period';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'trial';
