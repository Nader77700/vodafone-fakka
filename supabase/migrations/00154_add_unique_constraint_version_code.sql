
-- منع تكرار version_code في app_versions (السبب في فشل merge-duplicates في الـ workflow)
-- أولاً: حذف أي صفوف مكررة بنفس version_code (نحتفظ بالأحدث)
DELETE FROM public.app_versions a
  USING public.app_versions b
  WHERE a.created_at < b.created_at
    AND a.version_code = b.version_code;

-- إضافة unique constraint
ALTER TABLE public.app_versions
  ADD CONSTRAINT app_versions_version_code_unique UNIQUE (version_code);
