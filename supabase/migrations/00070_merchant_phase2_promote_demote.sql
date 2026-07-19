
-- ================================================================
-- PHASE 2: Merchant Activation — Promote/Demote RPCs
-- ================================================================

-- 1. Unique constraint: one merchant profile per user (prevent duplicates)
--    Use a partial index on merchant_id to allow multiple NULLs but only one row per non-null merchant_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_merchant_id_unique
  ON profiles(id)
  WHERE merchant_id IS NOT NULL;

-- 2. promote_to_merchant(user_id) — atomic promotion
--    Creates merchant record if not exists, or restores archived one
--    Sets role = 'merchant', links merchant_id
CREATE OR REPLACE FUNCTION promote_to_merchant(
  p_user_id   uuid,
  p_admin_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_merchant   merchants%ROWTYPE;
  v_username   text;
  v_role       user_role;
BEGIN
  -- Fetch current user
  SELECT username, role INTO v_username, v_role
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Already a merchant
  IF v_role = 'merchant' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_merchant');
  END IF;

  -- Admin/super_admin cannot be promoted to merchant
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_cannot_be_merchant');
  END IF;

  -- Check if this user already has a merchant record (previously demoted)
  SELECT * INTO v_merchant FROM merchants WHERE created_by = p_user_id LIMIT 1;

  IF NOT FOUND THEN
    -- Create new merchant profile
    INSERT INTO merchants(
      name,
      status,
      invite_code,
      created_by
    ) VALUES (
      COALESCE(v_username, 'تاجر ' || substring(p_user_id::text, 1, 8)),
      'active',
      substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      p_user_id
    )
    RETURNING * INTO v_merchant;
  ELSE
    -- Restore previously archived merchant (reactivate)
    UPDATE merchants
    SET status = 'active', updated_at = now()
    WHERE id = v_merchant.id
    RETURNING * INTO v_merchant;
  END IF;

  -- Update profile: role → merchant, link merchant_id
  UPDATE profiles
  SET role        = 'merchant',
      merchant_id = v_merchant.id,
      updated_at  = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success',      true,
    'merchant_id',  v_merchant.id,
    'invite_code',  v_merchant.invite_code,
    'is_restored',  (v_merchant.created_by = p_user_id)
  );
END;
$$;

-- 3. demote_to_user(user_id) — atomic demotion (archives data, never deletes)
CREATE OR REPLACE FUNCTION demote_to_user(
  p_user_id  uuid,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_merchant_id uuid;
  v_role        user_role;
BEGIN
  SELECT role, merchant_id INTO v_role, v_merchant_id
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_role != 'merchant' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_merchant');
  END IF;

  -- Archive merchant (suspend, do NOT delete)
  IF v_merchant_id IS NOT NULL THEN
    UPDATE merchants
    SET status     = 'suspended',
        updated_at = now()
    WHERE id = v_merchant_id;
  END IF;

  -- Demote profile: role → user, keep merchant_id for re-promotion restore
  UPDATE profiles
  SET role       = 'user',
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success',     true,
    'merchant_id', v_merchant_id
  );
END;
$$;

-- 4. regenerate_invite_code(merchant_id) — generate a fresh unique invite code
CREATE OR REPLACE FUNCTION regenerate_invite_code(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_code text;
BEGIN
  -- Keep generating until unique (loop for safety)
  LOOP
    v_new_code := substring(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM merchants WHERE invite_code = v_new_code);
  END LOOP;

  UPDATE merchants
  SET invite_code = v_new_code, updated_at = now()
  WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'merchant_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'invite_code', v_new_code);
END;
$$;
