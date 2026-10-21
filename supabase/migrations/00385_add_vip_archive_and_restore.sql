-- Migration to add VIP session archiving and unarchiving support
CREATE OR REPLACE FUNCTION public.vip_unarchive_session(
  p_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email text;
  v_is_owner boolean;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  UPDATE public.vip_sessions
  SET is_active = true,
      updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
    'vip_session_unarchived',
    jsonb_build_object('session_id', p_session_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تم استرجاع الجلسة من الأرشيف بنجاح.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.vip_list_archived_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sessions jsonb;
  v_user_email text;
  v_is_owner boolean;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC), '[]'::jsonb)
  INTO v_sessions
  FROM public.vip_sessions s
  WHERE s.is_active = false;

  RETURN jsonb_build_object(
    'success', true,
    'sessions', v_sessions
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.vip_hard_delete_session(
  p_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email text;
  v_is_owner boolean;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  DELETE FROM public.vip_cycle_history WHERE session_id = p_session_id;
  DELETE FROM public.vip_operation_logs WHERE session_id = p_session_id;
  DELETE FROM public.vip_sessions WHERE id = p_session_id;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
    'vip_session_hard_deleted',
    jsonb_build_object('session_id', p_session_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تم حذف الجلسة وسجلاتها نهائياً من قاعدة البيانات.'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vip_unarchive_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_list_archived_sessions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_hard_delete_session(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
