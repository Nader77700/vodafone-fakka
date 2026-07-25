-- إضافة app_version و version_code لجدول fcm_tokens
ALTER TABLE fcm_tokens
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS version_code integer;