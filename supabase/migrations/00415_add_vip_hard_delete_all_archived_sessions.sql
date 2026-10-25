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
  WHERE is_archived = true;

  IF v_session_ids IS NOT NULL AND array_length(v_session_ids, 1) > 0 THEN
    DELETE FROM public.vip_cycle_history WHERE session_id = ANY(v_session_ids);
    DELETE FROM public.vip_operation_logs WHERE session_id = ANY(v_session_ids);
    DELETE FROM public.vip_sessions WHERE id = ANY(v_session_ids);
    v_deleted_count := array_length(v_session_ids, 1);
  END IF;

  INSERT INTO public.vip_audit_logs (actor_email, action, details)
  VALUES (
    v_user_email,
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

GRANT EXECUTE ON FUNCTION public.vip_hard_delete_all_archived_sessions() TO authenticated, service_role;