INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('apk-releases', 'apk-releases', true, 52428800, ARRAY['application/vnd.android.package-archive','application/octet-stream'])
ON CONFLICT (id) DO NOTHING;