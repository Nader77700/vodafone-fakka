CREATE TABLE IF NOT EXISTS public.crash_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    username text,
    device_model text,
    manufacturer text,
    brand text,
    android_version text,
    api_level text,
    cpu_architecture text,
    ram text,
    storage text,
    app_version text,
    build_number text,
    screen_name text,
    last_clicked_button text,
    current_route text,
    previous_route text,
    internet_state text,
    sim_state text,
    network_type text,
    stack_trace text,
    exception_message text,
    exception_type text,
    file_name text,
    line_number text,
    column_number text,
    source_map text,
    plugin_name text,
    edge_function_name text,
    supabase_request text,
    request_id text,
    response_code text,
    additional_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.crash_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Enable insert for everyone' AND tablename = 'crash_logs'
  ) THEN
    CREATE POLICY "Enable insert for everyone" ON public.crash_logs FOR INSERT WITH CHECK (true);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Enable select for admin' AND tablename = 'crash_logs'
  ) THEN
    CREATE POLICY "Enable select for admin" ON public.crash_logs FOR SELECT USING (
      (SELECT public.check_user_is_admin()) = true
    );
  END IF;
END $$;
