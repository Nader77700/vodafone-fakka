-- Fix missing default values in atomic_insert_operation_and_consume
DROP FUNCTION IF EXISTS public.atomic_insert_operation_and_consume(uuid, text, text, numeric, text, text, timestamp with time zone, text, text, jsonb, text, text, integer, text, text, integer, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.atomic_insert_operation_and_consume(
  p_user_id uuid,
  p_phone text,
  p_card_type text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_error_msg text DEFAULT NULL,
  p_performed_at timestamp with time zone DEFAULT NOW(),
  p_category text DEFAULT NULL,
  p_api_res text DEFAULT NULL,
  p_card_data jsonb DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_execution_layer text DEFAULT NULL,
  p_retry_count integer DEFAULT 0,
  p_latency_ms integer DEFAULT NULL,
  p_device_fp text DEFAULT NULL,
  p_hardware_hash text DEFAULT NULL,
  p_native_id text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    p_user_id, p_phone, p_card_type, p_amount, COALESCE(p_status, 'pending')::public.operation_status, p_error_msg, COALESCE(p_performed_at, NOW()),
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
$function$;

-- Recover lost operations from system_logs
INSERT INTO public.operations (
    user_id, phone_number, card_type, amount, status, error_message, performed_at, 
    category, api_response, card_data, operation_source, idempotency_key, duration_ms,
    correlation_id, execution_layer, retry_count, latency_ms,
    device_fp, hardware_hash, native_id
)
SELECT 
    user_id,
    metadata->>'phone',
    split_part(message, ' — ', 2), -- card_type
    (metadata->>'amount')::NUMERIC,
    CASE WHEN action = 'recharge_success' THEN 'success'::public.operation_status ELSE 'failed'::public.operation_status END,
    CASE WHEN action = 'recharge_failed' THEN metadata->>'raw_error' ELSE NULL END,
    created_at,
    metadata->>'category',
    'Completed (Recovered from logs)',
    metadata,
    'vodafone_cash',
    metadata->>'idempotency_key',
    (metadata->>'latency_ms')::INTEGER,
    metadata->>'correlation_id',
    metadata->>'execution_layer',
    (metadata->>'retry_count')::INTEGER,
    (metadata->>'latency_ms')::INTEGER,
    NULL, NULL, NULL
FROM public.system_logs
WHERE action IN ('recharge_success', 'recharge_failed')
  AND created_at > '2026-07-11 16:00:04'
  AND metadata->>'idempotency_key' IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.operations o WHERE o.idempotency_key = system_logs.metadata->>'idempotency_key'
  );