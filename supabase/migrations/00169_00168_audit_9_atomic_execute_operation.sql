-- Audit 9: Atomic Transactions for Operations
-- We wrap the consume and insert into a single RPC to guarantee no operations are lost if insertion fails.

CREATE OR REPLACE FUNCTION execute_operation_transaction(
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_idempotency_key TEXT;
  v_existing_op operations%ROWTYPE;
  v_consume_result JSONB;
  v_op_id UUID;
  v_new_op operations%ROWTYPE;
BEGIN
  v_user_id := (p_payload->>'user_id')::UUID;
  v_idempotency_key := p_payload->>'idempotency_key';

  -- 1. Security check
  PERFORM check_security_constraints(v_user_id, p_payload->>'device_fp', p_payload->>'hardware_hash', p_payload->>'native_id');

  -- 2. Idempotency Check (If already exists, return it with success)
  IF v_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_op FROM operations 
    WHERE user_id = v_user_id AND idempotency_key = v_idempotency_key LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Operation already exists (idempotent)',
        'operation', to_jsonb(v_existing_op)
      );
    END IF;
  END IF;

  -- 3. Consume Operation (This handles standard subscription deductions inside the same transaction)
  v_consume_result := atomic_consume_operation(v_user_id);

  IF NOT (v_consume_result->>'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_consume_result->>'error',
      'exhausted', COALESCE((v_consume_result->>'exhausted')::BOOLEAN, false)
    );
  END IF;

  -- 4. Insert Operation
  INSERT INTO operations (
    user_id,
    phone_number,
    card_type,
    card_data,
    status,
    error_message,
    category,
    amount,
    duration_ms,
    api_response,
    operation_source,
    idempotency_key,
    correlation_id,
    execution_layer,
    retry_count,
    latency_ms
  ) VALUES (
    v_user_id,
    p_payload->>'phone_number',
    p_payload->>'card_type',
    CASE WHEN p_payload->'card_data' IS NOT NULL THEN p_payload->'card_data' ELSE '{}'::JSONB END,
    COALESCE(p_payload->>'status', 'success')::operation_status,
    p_payload->>'error_message',
    p_payload->>'category',
    (p_payload->>'amount')::NUMERIC,
    (p_payload->>'duration_ms')::INTEGER,
    p_payload->>'api_response',
    p_payload->>'operation_source',
    p_payload->>'idempotency_key',
    p_payload->>'correlation_id',
    p_payload->>'execution_layer',
    (p_payload->>'retry_count')::INTEGER,
    (p_payload->>'latency_ms')::INTEGER
  ) RETURNING * INTO v_new_op;

  -- 5. Return success
  RETURN jsonb_build_object(
    'success', true,
    'operation', to_jsonb(v_new_op),
    'consume_details', v_consume_result
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'errorCode', 'INTERNAL_ERROR');
END;
$$;
