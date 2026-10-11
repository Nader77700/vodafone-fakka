-- Create helper is_admin() if not present
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.is_current_admin();
$$;

-- 1. Automation Rules Table
CREATE TABLE IF NOT EXISTS public.whatsapp_automation_rules (
  id text PRIMARY KEY DEFAULT 'default',
  is_global_paused boolean NOT NULL DEFAULT false,
  red_status_enabled boolean NOT NULL DEFAULT true,
  conversion_enabled boolean NOT NULL DEFAULT true,
  renewal_reminder_enabled boolean NOT NULL DEFAULT true,
  renewal_same_day_enabled boolean NOT NULL DEFAULT true,
  renewal_confirmation_enabled boolean NOT NULL DEFAULT false,
  invoice_due_reminder_enabled boolean NOT NULL DEFAULT true,
  invoice_overdue_reminder_enabled boolean NOT NULL DEFAULT false,
  payment_confirmation_enabled boolean NOT NULL DEFAULT true,
  lead_days_before_renewal integer NOT NULL DEFAULT 2,
  daily_execution_hour integer NOT NULL DEFAULT 10,
  timezone text NOT NULL DEFAULT 'Africa/Cairo',
  supported_activation_days integer[] NOT NULL DEFAULT ARRAY[7, 11, 25],
  max_retry_attempts integer NOT NULL DEFAULT 3,
  retry_backoff_minutes integer NOT NULL DEFAULT 30,
  rate_limit_per_minute integer NOT NULL DEFAULT 20,
  templates_mapping jsonb NOT NULL DEFAULT '{
    "conversion": {"template_name": "red_conversion_success", "language": "ar"},
    "status_change": {"template_name": "red_status_updated", "language": "ar"},
    "renewal_lead": {"template_name": "red_renewal_lead_reminder", "language": "ar"},
    "renewal_same_day": {"template_name": "red_renewal_due_today", "language": "ar"},
    "renewal_confirmed": {"template_name": "red_renewal_confirmed", "language": "ar"},
    "invoice_due": {"template_name": "red_invoice_due_alert", "language": "ar"},
    "invoice_overdue": {"template_name": "red_invoice_overdue_alert", "language": "ar"},
    "payment_confirmed": {"template_name": "red_payment_confirmed", "language": "ar"}
  }'::jsonb,
  last_scheduler_run_at timestamptz,
  last_scheduler_status text DEFAULT 'idle',
  last_scheduler_metrics jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Seed default rules if not present
INSERT INTO public.whatsapp_automation_rules (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 2. Customer / Recipient Preferences Table
CREATE TABLE IF NOT EXISTS public.whatsapp_customer_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL DEFAULT 'line', -- 'line' | 'merchant' | 'custom'
  entity_id text NOT NULL,
  line_phone_number text NOT NULL,
  customer_name text,
  whatsapp_recipient text NOT NULL,
  is_valid_number boolean NOT NULL DEFAULT true,
  consent_status text NOT NULL DEFAULT 'consented', -- 'consented', 'opt_out', 'pending'
  consent_date timestamptz NOT NULL DEFAULT now(),
  consent_source text DEFAULT 'admin_portal',
  is_enabled boolean NOT NULL DEFAULT true,
  is_paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  allow_red_status_notif boolean NOT NULL DEFAULT true,
  allow_conversion_notif boolean NOT NULL DEFAULT true,
  allow_renewal_reminders boolean NOT NULL DEFAULT true,
  allow_renewal_confirmation boolean NOT NULL DEFAULT true,
  allow_invoice_reminders boolean NOT NULL DEFAULT true,
  allow_payment_confirmation boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_whatsapp_pref_entity UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_pref_line_phone ON public.whatsapp_customer_preferences (line_phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_pref_recipient ON public.whatsapp_customer_preferences (whatsapp_recipient);

-- 3. Automation Queue Table
CREATE TABLE IF NOT EXISTS public.whatsapp_automation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_category text NOT NULL,
  source_event_id text NOT NULL UNIQUE,
  line_id uuid REFERENCES public.vip_red_monitored_lines(id) ON DELETE SET NULL,
  merchant_id uuid REFERENCES public.vip_red_merchants(id) ON DELETE SET NULL,
  customer_name text,
  recipient_phone text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'ar',
  template_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'skipped', 'failed', 'cancelled'
  skip_reason text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  whatsapp_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  wamid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_sched ON public.whatsapp_automation_queue (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_line_id ON public.whatsapp_automation_queue (line_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_category ON public.whatsapp_automation_queue (event_category);

-- 4. Enable RLS
ALTER TABLE public.whatsapp_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automation_queue ENABLE ROW LEVEL SECURITY;

-- Rules RLS
DROP POLICY IF EXISTS whatsapp_rules_select ON public.whatsapp_automation_rules;
CREATE POLICY whatsapp_rules_select ON public.whatsapp_automation_rules
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS whatsapp_rules_update ON public.whatsapp_automation_rules;
CREATE POLICY whatsapp_rules_update ON public.whatsapp_automation_rules
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Preferences RLS
DROP POLICY IF EXISTS whatsapp_pref_select ON public.whatsapp_customer_preferences;
CREATE POLICY whatsapp_pref_select ON public.whatsapp_customer_preferences
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS whatsapp_pref_insert ON public.whatsapp_customer_preferences;
CREATE POLICY whatsapp_pref_insert ON public.whatsapp_customer_preferences
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS whatsapp_pref_update ON public.whatsapp_customer_preferences;
CREATE POLICY whatsapp_pref_update ON public.whatsapp_customer_preferences
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS whatsapp_pref_delete ON public.whatsapp_customer_preferences;
CREATE POLICY whatsapp_pref_delete ON public.whatsapp_customer_preferences
  FOR DELETE TO authenticated USING (public.is_admin());

-- Queue RLS
DROP POLICY IF EXISTS whatsapp_queue_select ON public.whatsapp_automation_queue;
CREATE POLICY whatsapp_queue_select ON public.whatsapp_automation_queue
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS whatsapp_queue_update ON public.whatsapp_automation_queue;
CREATE POLICY whatsapp_queue_update ON public.whatsapp_automation_queue
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS whatsapp_queue_delete ON public.whatsapp_automation_queue;
CREATE POLICY whatsapp_queue_delete ON public.whatsapp_automation_queue
  FOR DELETE TO authenticated USING (public.is_admin());

-- 5. Atomic Claim Function (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.whatsapp_claim_queue_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 10
)
RETURNS SETOF public.whatsapp_automation_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM public.whatsapp_automation_queue
    WHERE status = 'pending'
      AND scheduled_for <= now()
      AND attempts < max_attempts
    ORDER BY scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_automation_queue q
  SET
    status = 'processing',
    claimed_at = now(),
    claimed_by = p_worker_id,
    attempts = q.attempts + 1,
    updated_at = now()
  FROM claimable
  WHERE q.id = claimable.id
  RETURNING q.*;
END;
$$;

-- 6. Function to cancel stale reminders on line renewal date change or invoice payment
CREATE OR REPLACE FUNCTION public.whatsapp_cancel_stale_reminders(
  p_line_id uuid,
  p_reason text DEFAULT 'stale_activation_day_changed'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.whatsapp_automation_queue
  SET
    status = 'cancelled',
    skip_reason = p_reason,
    updated_at = now()
  WHERE line_id = p_line_id
    AND status IN ('pending', 'processing')
    AND event_category IN ('renewal_lead', 'renewal_same_day');
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 7. Trigger on Line Update to Invalidate Stale Reminders Automatically
CREATE OR REPLACE FUNCTION public.trg_whatsapp_line_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If activation_day changed, cancel pending renewal reminders
  IF (OLD.activation_day IS DISTINCT FROM NEW.activation_day) THEN
    PERFORM public.whatsapp_cancel_stale_reminders(NEW.id, 'activation_day_changed_from_' || COALESCE(OLD.activation_day::text, 'null') || '_to_' || COALESCE(NEW.activation_day::text, 'null'));
  END IF;

  -- If payment_status changed to 'paid' or 'cancelled', cancel pending invoice reminders
  IF (NEW.payment_status IN ('paid', 'cancelled') AND OLD.payment_status NOT IN ('paid', 'cancelled')) THEN
    UPDATE public.whatsapp_automation_queue
    SET
      status = 'cancelled',
      skip_reason = 'invoice_settled_or_cancelled',
      updated_at = now()
    WHERE line_id = NEW.id
      AND status IN ('pending', 'processing')
      AND event_category IN ('invoice_due', 'invoice_overdue');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vip_red_line_whatsapp_invalidation ON public.vip_red_monitored_lines;
CREATE TRIGGER trg_vip_red_line_whatsapp_invalidation
  AFTER UPDATE OF activation_day, payment_status
  ON public.vip_red_monitored_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_whatsapp_line_changes();
