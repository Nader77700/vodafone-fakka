-- 1. Redefine vip_delete_session to allow deleting ANY session without minimum session restriction
CREATE OR REPLACE FUNCTION public.vip_delete_session(
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
  SET is_active = false,
      automation_enabled = false,
      operation_state = 'stopped',
      worker_status = 'stopped',
      updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
    'vip_session_deleted',
    jsonb_build_object('session_id', p_session_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'message', 'تمت أرشفة وحذف الجلسة بنجاح.'
  );
END;
$function$;

-- 2. New RPC: vip_delete_all_sessions to delete / reset all sessions
CREATE OR REPLACE FUNCTION public.vip_delete_all_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email text;
  v_is_owner boolean;
  v_deleted_count integer;
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  UPDATE public.vip_sessions
  SET is_active = false,
      automation_enabled = false,
      operation_state = 'stopped',
      worker_status = 'stopped',
      updated_at = now()
  WHERE is_active = true;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
    'vip_all_sessions_deleted',
    jsonb_build_object('count', v_deleted_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', 'تم حذف وأرشفة جميع الجلسات بنجاح.'
  );
END;
$function$;
