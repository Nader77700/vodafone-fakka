CREATE TABLE IF NOT EXISTS public.vip_red_activation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.vip_red_merchants (id)
    ON DELETE CASCADE,
  activation_day smallint NOT NULL CHECK (activation_day IN (7, 11, 25)),
  activation_date date NOT NULL,
  reminder_date date NOT NULL,
  lines_count int NOT NULL DEFAULT 1,
  recipient_type text NOT NULL CHECK (recipient_type IN ('merchant', 'admin')),
  recipient_user_id uuid NULL,
  title text NOT NULL,
  message text NOT NULL,
  notification_sent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_red_activation_reminders_unique 
    UNIQUE (merchant_id, activation_date, reminder_date)
); CREATE INDEX IF NOT EXISTS idx_vip_red_reminders_merchant_date ON public.vip_red_activation_reminders (merchant_id, activation_date); ALTER TABLE public.vip_red_activation_reminders 
  ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS vip_red_activation_reminders_select ON public.vip_red_activation_reminders; CREATE POLICY vip_red_activation_reminders_select
  ON public.vip_red_activation_reminders
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    true
  ); DROP POLICY IF EXISTS vip_red_activation_reminders_insert ON public.vip_red_activation_reminders; CREATE POLICY vip_red_activation_reminders_insert
  ON public.vip_red_activation_reminders
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    true
  ); DROP POLICY IF EXISTS vip_red_merchants_all ON public.vip_red_merchants; DROP POLICY IF EXISTS vip_red_merchants_select ON public.vip_red_merchants; DROP POLICY IF EXISTS vip_red_merchants_insert ON public.vip_red_merchants; DROP POLICY IF EXISTS vip_red_merchants_update ON public.vip_red_merchants; DROP POLICY IF EXISTS vip_red_merchants_delete ON public.vip_red_merchants; CREATE POLICY vip_red_merchants_select
  ON public.vip_red_merchants
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    true
  ); CREATE POLICY vip_red_merchants_insert
  ON public.vip_red_merchants
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    true
  ); CREATE POLICY vip_red_merchants_update
  ON public.vip_red_merchants
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    true
  )
  WITH CHECK (
    true
  ); CREATE POLICY vip_red_merchants_delete
  ON public.vip_red_merchants
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    true
  );