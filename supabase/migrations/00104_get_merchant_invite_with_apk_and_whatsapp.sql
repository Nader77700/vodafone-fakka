
CREATE OR REPLACE FUNCTION public.get_merchant_invite(p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite      merchant_invites%ROWTYPE;
  v_joined      jsonb;
  v_locked      boolean;
  v_inv_code    text;
  v_merch_name  text;
  v_apk_url     text;
  v_apk_version text;
BEGIN
  -- بيانات التاجر
  SELECT invite_locked_by_owner, invite_code, name
  INTO v_locked, v_inv_code, v_merch_name
  FROM merchants WHERE id = p_merchant_id;

  -- APK URL + version
  SELECT value INTO v_apk_url     FROM app_config WHERE key = 'version_apk_url';
  SELECT value INTO v_apk_version FROM app_config WHERE key = 'version_latest_name';

  -- جلب أو إنشاء invite
  SELECT * INTO v_invite
  FROM merchant_invites WHERE merchant_id = p_merchant_id
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO merchant_invites(merchant_id, token, status)
    VALUES (p_merchant_id, _gen_invite_token(), 'active')
    RETURNING * INTO v_invite;
  END IF;

  -- آخر 5 منضمّين
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
    'invite_code',         COALESCE(v_inv_code, v_invite.token),
    'merchant_name',       COALESCE(v_merch_name, ''),
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
    'invite_link',         COALESCE(v_inv_code, v_invite.token),
    'apk_url',             COALESCE(v_apk_url, ''),
    'apk_version',         COALESCE(v_apk_version, '')
  );
END;
$function$;
