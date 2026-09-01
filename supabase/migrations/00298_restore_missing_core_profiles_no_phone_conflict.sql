-- ================================================================
-- استعادة core_profiles للمستخدمين بدون profile
-- تجنب تعارض رقم الهاتف: نترك phone = NULL إن كان مكرراً
-- ================================================================

INSERT INTO public.core_profiles (
  id, email, username, phone, role,
  is_active, access_mode, created_at, updated_at
)
SELECT
  u.id,
  u.email,
  -- username: من metadata أو من الإيميل
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
    split_part(u.email, '@', 1)
  ),
  -- phone: فقط لو مش موجود في profile تاني
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.core_profiles cp2
      WHERE cp2.phone = COALESCE(
        NULLIF(trim(u.raw_user_meta_data->>'phone'),''),
        CASE WHEN u.email ~ '^01[0-9]{9}@miaoda\.com$'
          THEN regexp_replace(split_part(u.email,'@',1),'[^0-9]','','g')
          ELSE NULL END
      )
    ) THEN NULL  -- تجنب التعارض
    ELSE COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'phone'),''),
      CASE WHEN u.email ~ '^01[0-9]{9}@miaoda\.com$'
        THEN regexp_replace(split_part(u.email,'@',1),'[^0-9]','','g')
        ELSE NULL END
    )
  END,
  'user'::public.user_role,
  true,
  'subscribed',
  u.created_at,
  now()
FROM auth.users u
LEFT JOIN public.core_profiles cp ON cp.id = u.id
WHERE cp.id IS NULL
  AND u.deleted_at IS NULL
  AND u.email NOT ILIKE '%sandbox%'
  AND u.email NOT ILIKE '%test.local%'
ON CONFLICT (id) DO NOTHING;

-- ── تفعيل compensation 48h للحسابات المستعادة حديثاً ──────────────────────
INSERT INTO public.subscriptions (
  user_id, status, code_type, code_used,
  activated_at, expires_at, ops_count, ops_limit,
  duration_days, created_at, updated_at
)
SELECT cp.id, 'active', 'compensation', 'RESTORE_MISSING_PROFILE',
       now(), now() + interval '48 hours', 0, NULL, 2, now(), now()
FROM public.core_profiles cp
LEFT JOIN public.subscriptions s ON s.user_id = cp.id
WHERE s.user_id IS NULL
  AND cp.email NOT ILIKE '%sandbox%'
  AND cp.email NOT ILIKE '%test.local%'
ON CONFLICT (user_id) DO NOTHING;