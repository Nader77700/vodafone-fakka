DO $$
DECLARE
  v_line_id uuid;
BEGIN
  SELECT id INTO v_line_id FROM public.vip_red_monitored_lines LIMIT 1;

  -- Insert a mock pending reminder for this line
  INSERT INTO public.whatsapp_automation_queue (
    event_category, source_event_id, line_id, recipient_phone, template_name, status
  ) VALUES (
    'invoice_due', 'test_trigger_cancellation_event', v_line_id, '201012345678', 'red_invoice_due_alert', 'pending'
  ) ON CONFLICT (source_event_id) DO UPDATE SET status = 'pending';

  -- Simulate payment or invoice cancellation by calling function with 2 arguments
  PERFORM public.whatsapp_cancel_stale_reminders(v_line_id, 'تم سداد الفاتورة أو إلغاء استحقاقها في النظام');
END $$;