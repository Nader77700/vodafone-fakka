-- Create VIP Red Configuration Table
CREATE TABLE IF NOT EXISTS public.vip_red_config (
  id text PRIMARY KEY DEFAULT 'default',
  is_enabled_globally boolean NOT NULL DEFAULT false,
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  check_interval_hours integer NOT NULL DEFAULT 4,
  last_batch_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row if not exists
INSERT INTO public.vip_red_config (id, is_enabled_globally, allowed_user_ids, check_interval_hours)
VALUES ('default', false, '{}', 4)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.vip_red_config ENABLE ROW LEVEL SECURITY;

-- Policies for vip_red_config
CREATE POLICY "Anyone authenticated can read vip_red_config"
  ON public.vip_red_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update vip_red_config"
  ON public.vip_red_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Admins can insert vip_red_config"
  ON public.vip_red_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );

-- Create VIP Monitored Lines Table
CREATE TABLE IF NOT EXISTS public.vip_red_monitored_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.core_profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  current_system text,
  system_status text NOT NULL DEFAULT 'monitoring', -- 'monitoring', 'converted', 'ineligible'
  converted_at timestamptz,
  last_checked_at timestamptz,
  check_count integer NOT NULL DEFAULT 0,
  last_line_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_red_user_phone_unique UNIQUE (user_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_vip_red_lines_user ON public.vip_red_monitored_lines (user_id);
CREATE INDEX IF NOT EXISTS idx_vip_red_lines_status ON public.vip_red_monitored_lines (system_status);
CREATE INDEX IF NOT EXISTS idx_vip_red_lines_last_checked ON public.vip_red_monitored_lines (last_checked_at);

-- Enable RLS
ALTER TABLE public.vip_red_monitored_lines ENABLE ROW LEVEL SECURITY;

-- Monitored lines policies
CREATE POLICY "Users and admins can select vip_red_monitored_lines"
  ON public.vip_red_monitored_lines
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Users and admins can insert vip_red_monitored_lines"
  ON public.vip_red_monitored_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Users and admins can update vip_red_monitored_lines"
  ON public.vip_red_monitored_lines
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Users and admins can delete vip_red_monitored_lines"
  ON public.vip_red_monitored_lines
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );
