DO $$
DECLARE
  v_test_msg_id uuid;
  v_res jsonb;
  v_status text;
BEGIN
  -- 1. Create a test message
  INSERT INTO public.whatsapp_messages (
    recipient_phone, message_type, body_text, status, wamid, source
  ) VALUES (
    '201000000000', 'text', 'Test idempotency', 'accepted', 'wamid.HBgLdGVzdA==', 'test'
  ) RETURNING id INTO v_test_msg_id;

  -- 2. First update: delivered
  SELECT public.whatsapp_update_message_status_idempotent(
    'wamid.HBgLdGVzdA==', 'delivered', now(), '{"event": "delivered"}'::jsonb
  ) INTO v_res;

  -- Check status is delivered
  SELECT status INTO v_status FROM public.whatsapp_messages WHERE id = v_test_msg_id;
  IF v_status <> 'delivered' THEN
    RAISE EXCEPTION 'Expected delivered, got %', v_status;
  END IF;

  -- 3. Out-of-order event: sent (rank is lower than delivered)
  SELECT public.whatsapp_update_message_status_idempotent(
    'wamid.HBgLdGVzdA==', 'sent', now() - interval '1 minute', '{"event": "sent"}'::jsonb
  ) INTO v_res;

  -- Check status is still delivered (out of order ignored!)
  SELECT status INTO v_status FROM public.whatsapp_messages WHERE id = v_test_msg_id;
  IF v_status <> 'delivered' THEN
    RAISE EXCEPTION 'Idempotency failed: status downgraded to %', v_status;
  END IF;

  -- 4. Clean up test row and test history
  DELETE FROM public.whatsapp_message_status_history WHERE message_id = v_test_msg_id;
  DELETE FROM public.whatsapp_messages WHERE id = v_test_msg_id;
END $$;