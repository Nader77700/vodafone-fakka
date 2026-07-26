CREATE TABLE IF NOT EXISTS public.vcc_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_number text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference_number text,
  failure_reason text,
  execution_time_ms integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.vcc_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vcc_transfers"
  ON public.vcc_transfers
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all vcc_transfers"
  ON public.vcc_transfers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
    )
  );