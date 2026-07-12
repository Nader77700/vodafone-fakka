ALTER TABLE public.operations DISABLE TRIGGER trg_prevent_banned_operations;

DO $$
DECLARE
  log_row record;
  v_op_number bigint;
BEGIN
  FOR log_row IN 
    SELECT * FROM public.system_logs 
    WHERE action = 'recharge_success' 
      AND created_at > '2026-07-10 18:00:00'
      AND metadata->>'idempotency_key' IS NOT NULL
  LOOP
    -- Insert only if the idempotency_key is not already present
    IF NOT EXISTS (SELECT 1 FROM public.operations WHERE idempotency_key = log_row.metadata->>'idempotency_key') THEN
      
      -- Auto-generate operation_number since it's missing in some logs
      SELECT COALESCE(MAX(operation_number), 0) + 1 INTO v_op_number FROM public.operations;
      
      INSERT INTO public.operations (
        user_id, phone_number, amount, category, status, performed_at, created_at,
        api_response, operation_source, idempotency_key, latency_ms,
        operation_number, execution_layer, card_type
      ) VALUES (
        log_row.user_id,
        log_row.metadata->>'phone',
        (log_row.metadata->>'amount')::numeric,
        log_row.metadata->>'category',
        'success',
        log_row.created_at, -- using log created_at as performed_at approximation
        log_row.created_at,
        'Completed (Recovered from logs)',
        'vodafone_cash',
        log_row.metadata->>'idempotency_key',
        (log_row.metadata->>'latency_ms')::integer,
        COALESCE((log_row.metadata->>'operation_number')::bigint, v_op_number),
        log_row.metadata->>'execution_layer',
        'فكة ' || COALESCE((log_row.metadata->>'amount'), '0') || ' جنيه'
      );
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.operations ENABLE TRIGGER trg_prevent_banned_operations;