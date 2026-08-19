
-- ═══════════════════════════════════════════════════════════════
-- تحديث atomic_insert_operation_and_consume
-- لالتقاط subscription_id الفعال server-side عند إدراج كل عملية
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.atomic_insert_operation_and_consume(
  p_user_id         uuid,
  p_phone           text,
  p_card_type       text,
  p_amount          numeric,
  p_status          text,
  p_error_msg       text,
  p_performed_at    timestamp with time zone,
  p_category        text,
  p_api_res         text,
  p_card_data       jsonb,
  p_source          text,
  p_idempotency_key text,
  p_duration_ms     integer,
  p_correlation_id  text,
  p_execution_layer text,
  p_retry_count     integer,
  p_latency_ms      integer,
  p_device_fp       text,
  p_hardware_hash   text,
  p_native_id       text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_op_id         UUID;
  v_op_number     bigint;
  v_caller_role   TEXT;
  v_is_admin      BOOLEAN := FALSE;
  v_consume_result JSONB;
  v_sub_id        UUID;   -- NEW: subscription_id الفعال
BEGIN
  -- LAYER 1 & 10: Server Authoritative Admin Validation
  SELECT role INTO v_caller_role FROM profiles WHERE id = p_user_id;
  IF v_caller_role IN ('admin', 'super_admin') THEN
    v_is_admin := TRUE;
  END IF;

  -- 1. Security check + consume
  IF NOT v_is_admin THEN
    PERFORM check_security_constraints(p_user_id, p_device_fp, p_hardware_hash, p_native_id);
    v_consume_result := atomic_consume_operation(p_user_id);
    IF NOT (v_consume_result->>'allowed')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'success',   false,
        'error',     v_consume_result->>'error',
        'exhausted', COALESCE((v_consume_result->>'exhausted')::BOOLEAN, false)
      );
    END IF;
  END IF;

  -- 2. التقاط subscription_id الفعال الآن (server-side — موثوق)
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status  = 'active'
    AND expires_at > COALESCE(p_performed_at, now())
  ORDER BY created_at DESC
  LIMIT 1;

  -- 3. Insert Operation (مع subscription_id)
  INSERT INTO public.core_operations (
    user_id, phone_number, card_type, amount, status, error_message, performed_at,
    category, api_response, card_data, operation_source, idempotency_key, duration_ms,
    correlation_id, execution_layer, retry_count, latency_ms,
    device_fp, hardware_hash, native_id,
    subscription_id
  ) VALUES (
    p_user_id, p_phone, p_card_type, p_amount, p_status::public.operation_status, p_error_msg, COALESCE(p_performed_at, now()),
    p_category, p_api_res, p_card_data, p_source, p_idempotency_key, p_duration_ms,
    p_correlation_id, p_execution_layer, p_retry_count, p_latency_ms,
    p_device_fp, p_hardware_hash, p_native_id,
    v_sub_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    status        = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    api_response  = EXCLUDED.api_response,
    latency_ms    = EXCLUDED.latency_ms,
    retry_count   = COALESCE(core_operations.retry_count, 0) + COALESCE(EXCLUDED.retry_count, 0)
  RETURNING id, operation_number INTO v_op_id, v_op_number;

  RETURN jsonb_build_object(
    'id',              v_op_id,
    'operation_number', v_op_number,
    'subscription_id', v_sub_id,
    'success',         true
  );

EXCEPTION WHEN unique_violation THEN
  SELECT id, operation_number INTO v_op_id, v_op_number
  FROM public.core_operations
  WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object(
    'id',              v_op_id,
    'operation_number', v_op_number,
    'is_duplicate',    true,
    'success',         true
  );
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
