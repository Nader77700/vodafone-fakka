-- Fix vip_hard_delete_session and vip_hard_delete_all_archived_sessions
-- Replace nonexistent vip_operation_logs with actual tables: vip_execution_logs and vip_operation_history

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
  DELETE FROM public.vip_execution_logs WHERE session_id = p_session_id;
  DELETE FROM public.vip_operation_history WHERE session_id = p_session_id;
  DELETE FROM public.vip_sessions WHERE id = p_session_id;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    COALESCE(v_user_email, 'owner'),
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

CREATE OR REPLACE FUNCTION public.vip_hard_delete_all_archived_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email text;
  v_is_owner boolean;
  v_deleted_count integer := 0;
  v_session_ids text[];
BEGIN
  v_user_email := auth.jwt()->>'email';
  v_is_owner := (v_user_email ILIKE '%nader%' OR v_user_email = 'nader77@miaoda.com' OR public.is_vip_owner());

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Unauthorized: VIP Owner access required.';
  END IF;

  SELECT array_agg(id) INTO v_session_ids
  FROM public.vip_sessions
  WHERE is_active = false;

  IF v_session_ids IS NOT NULL AND array_length(v_session_ids, 1) > 0 THEN
    DELETE FROM public.vip_cycle_history WHERE session_id = ANY(v_session_ids);
    DELETE FROM public.vip_execution_logs WHERE session_id = ANY(v_session_ids);
    DELETE FROM public.vip_operation_history WHERE session_id = ANY(v_session_ids);
    DELETE FROM public.vip_sessions WHERE id = ANY(v_session_ids);
    v_deleted_count := array_length(v_session_ids, 1);
  END IF;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    COALESCE(v_user_email, 'owner'),
    'vip_archived_sessions_hard_deleted_all',
    jsonb_build_object('deleted_count', v_deleted_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', format('تم حذف %s جلسة مؤرشفة نهائياً من قاعدة البيانات.', v_deleted_count)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vip_hard_delete_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vip_hard_delete_all_archived_sessions() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
