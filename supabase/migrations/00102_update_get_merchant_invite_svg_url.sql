
CREATE OR REPLACE FUNCTION public.get_merchant_invite(p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite     merchant_invites%ROWTYPE;
  v_joined     jsonb;
  v_locked     boolean;
  v_inv_code   text;
  v_app_base   text;
BEGIN
  -- جلب app_base_url من config
  SELECT value INTO v_app_base FROM app_config WHERE key = 'app_base_url';
  IF v_app_base IS NULL OR v_app_base = '' THEN
    v_app_base := 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/invite.svg';
  END IF;

  SELECT * INTO v_invite
  FROM merchant_invites WHERE merchant_id = p_merchant_id
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO merchant_invites(merchant_id, token, status)
    VALUES (p_merchant_id, _gen_invite_token(), 'active')
    RETURNING * INTO v_invite;
  END IF;

  SELECT invite_locked_by_owner, invite_code INTO v_locked, v_inv_code
  FROM merchants WHERE id = p_merchant_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',   l.user_id,
    'username',  p.username,
    'phone',     p.phone,
    'joined_at', l.created_at
  ) ORDER BY l.created_at DESC), '[]'::jsonb)
  INTO v_joined
  FROM (
    SELECT * FROM invite_usage_logs
    WHERE invite_id = v_invite.id AND action = 'join'
    ORDER BY created_at DESC LIMIT 5
  ) l
  LEFT JOIN profiles p ON p.id = l.user_id;

  RETURN jsonb_build_object(
    'id',                  v_invite.id,
    'token',               v_invite.token,
    'status',              v_invite.status,
    'expires_at',          v_invite.expires_at,
    'view_count',          v_invite.view_count,
    'join_count',          v_invite.join_count,
    'last_viewed_at',      v_invite.last_viewed_at,
    'last_joined_at',      v_invite.last_joined_at,
    'last_joined_user_id', v_invite.last_joined_user_id,
    'created_at',          v_invite.created_at,
    'recent_joins',        v_joined,
    'locked_by_owner',     COALESCE(v_locked, false),
    'invite_link',         v_app_base || '?merchant=' || COALESCE(v_inv_code, v_invite.token)
  );
END;
$function$;
