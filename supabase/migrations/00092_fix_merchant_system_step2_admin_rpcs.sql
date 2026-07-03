
-- ════════════════════════════════════════════════════════════
-- admin_suspend_all_members
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_suspend_all_members(
  p_merchant_id uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE merchant_members
  SET status = 'suspended', updated_at = NOW()
  WHERE merchant_id = p_merchant_id AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'suspended_count', v_count);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- admin_resume_all_members
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_resume_all_members(
  p_merchant_id uuid,
  p_admin_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE merchant_members
  SET status = 'active', updated_at = NOW()
  WHERE merchant_id = p_merchant_id AND status = 'suspended';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'resumed_count', v_count);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- admin_transfer_member
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_transfer_member(
  p_user_id        uuid,
  p_from_merchant  uuid,
  p_to_merchant    uuid,
  p_admin_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM merchant_members
    WHERE merchant_id = p_from_merchant AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found_in_source');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM merchants WHERE id = p_to_merchant AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_merchant_inactive');
  END IF;

  -- إلغاء الاشتراكات النشطة في التاجر القديم
  UPDATE merchant_member_subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE member_id IN (
    SELECT id FROM merchant_members
    WHERE merchant_id = p_from_merchant AND user_id = p_user_id
  ) AND status = 'active';

  -- حذف العضوية القديمة
  DELETE FROM merchant_members
  WHERE merchant_id = p_from_merchant AND user_id = p_user_id;

  -- تحديث profiles
  UPDATE profiles SET merchant_id = p_to_merchant, updated_at = NOW()
  WHERE id = p_user_id;

  -- إنشاء عضوية جديدة
  INSERT INTO merchant_members (merchant_id, user_id, status, assigned_points, consumed_points, remaining_points)
  VALUES (p_to_merchant, p_user_id, 'pending', 0, 0, 0)
  ON CONFLICT (merchant_id, user_id) DO UPDATE SET status = 'pending', updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'new_merchant_id', p_to_merchant);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- update_merchant_settings (يعمل للتاجر نفسه أو للـ admin)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_merchant_settings(
  p_merchant_id uuid,
  p_brand_color text    DEFAULT NULL,
  p_welcome_msg text    DEFAULT NULL,
  p_logo_url    text    DEFAULT NULL,
  p_max_users   integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE merchants
  SET
    brand_color = COALESCE(p_brand_color, brand_color),
    welcome_msg = COALESCE(p_welcome_msg, welcome_msg),
    logo_url    = COALESCE(p_logo_url,    logo_url),
    max_users   = CASE WHEN p_max_users IS NOT NULL THEN p_max_users ELSE max_users END,
    updated_at  = NOW()
  WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- إضافة max_users للـ merchants إن لم تكن موجودة
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants' AND column_name = 'max_users'
  ) THEN
    ALTER TABLE merchants ADD COLUMN max_users integer DEFAULT NULL;
  END IF;
END $$;

-- GRANTS
GRANT EXECUTE ON FUNCTION public.admin_suspend_all_members(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_all_members(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_member(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_merchant_settings(uuid, text, text, text, integer) TO authenticated;
