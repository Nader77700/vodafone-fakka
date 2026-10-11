CREATE OR REPLACE FUNCTION public.whatsapp_cancel_stale_reminders(
  p_line_id uuid,
  p_reason text DEFAULT 'cancelled_stale'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.whatsapp_automation_queue
  SET status = 'cancelled',
      skip_reason = p_reason,
      updated_at = now()
  WHERE line_id = p_line_id
    AND status = 'pending'
    AND event_category IN ('renewal_lead', 'renewal_same_day', 'invoice_due', 'invoice_overdue');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;