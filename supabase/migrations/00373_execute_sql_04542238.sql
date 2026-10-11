DO $$
DECLARE
  v_line_id uuid;
  v_cancelled_count int;
BEGIN
  SELECT id INTO v_line_id FROM public.vip_red_monitored_lines LIMIT 1;

  -- Insert mock pending reminder
  INSERT INTO public.whatsapp_automation_queue (
    event_category, source_event_id, line_id, recipient_phone, template_name, status
  ) VALUES (
    'invoice_due', 'test_trigger_cancellation_event_2', v_line_id, '201012345678', 'red_invoice_due_alert', 'pending'
  ) ON CONFLICT (source_event_id) DO UPDATE SET status = 'pending';

  -- Cancel
  v_cancelled_count := public.whatsapp_cancel_stale_reminders(v_line_id, 'تم سداد الفاتورة في النظام');
  
  RAISE NOTICE 'Cancelled count: %', v_cancelled_count;
END $$;