-- Fix missing operations by upsert with proper ENUM casting
CREATE OR REPLACE FUNCTION atomic_insert_operation_and_consume(
  p_user_id UUID,
  p_phone text,
  p_card_type text,
  p_amount numeric,
  p_status text,
  p_error_msg text,
  p_performed_at timestamptz,
  p_category text,
  p_api_res text,
  p_card_data jsonb,
  p_source text,
  p_idempotency_key text,
  p_duration_ms int,
  p_correlation_id text,
  p_execution_layer text,
  p_retry_count int,
  p_latency_ms int,
  p_device_fp text,
  p_hardware_hash text,
  p_native_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_op_id UUID;
  v_op_number bigint;
BEGIN
  -- إدراج العملية مع إرجاع id و operation_number
  INSERT INTO public.operations (
    user_id, phone_number, card_type, amount, status, error_message, performed_at, 
    category, api_response, card_data, operation_source, idempotency_key, duration_ms,
    correlation_id, execution_layer, retry_count, latency_ms,
    device_fp, hardware_hash, native_id
  ) VALUES (
    p_user_id, p_phone, p_card_type, p_amount, p_status::public.operation_status, p_error_msg, p_performed_at,
    p_category, p_api_res, p_card_data, p_source, p_idempotency_key, p_duration_ms,
    p_correlation_id, p_execution_layer, p_retry_count, p_latency_ms,
    p_device_fp, p_hardware_hash, p_native_id
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET 
    status = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    api_response = EXCLUDED.api_response,
    latency_ms = EXCLUDED.latency_ms,
    retry_count = COALESCE(operations.retry_count, 0) + COALESCE(EXCLUDED.retry_count, 0)
  RETURNING id, operation_number INTO v_op_id, v_op_number;

  RETURN jsonb_build_object('id', v_op_id, 'operation_number', v_op_number);
EXCEPTION WHEN unique_violation THEN
  -- في حال وجود idempotency_key مكرر (fallback)
  SELECT id, operation_number INTO v_op_id, v_op_number FROM public.operations WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('id', v_op_id, 'operation_number', v_op_number, 'is_duplicate', true);
END;
$$;