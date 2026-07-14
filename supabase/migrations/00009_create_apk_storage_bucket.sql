
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('apk-files', 'apk-files', true, 10485760, ARRAY['application/vnd.android.package-archive', 'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read apk" ON storage.objects
  FOR SELECT USING (bucket_id = 'apk-files');
