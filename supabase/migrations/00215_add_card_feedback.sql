CREATE TYPE feedback_status AS ENUM ('new', 'under_review', 'applied', 'rejected');

CREATE TABLE IF NOT EXISTS public.card_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text,
  operation_id text NOT NULL,
  card_type text NOT NULL,
  operation_date timestamptz NOT NULL,
  actual_units numeric,
  actual_price numeric,
  actual_validity_days numeric,
  screenshot_url text,
  status feedback_status NOT NULL DEFAULT 'new',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.card_feedbacks ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.check_user_is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  );
$$;

-- Function for updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Policies
CREATE POLICY "Users can insert own feedback"
  ON public.card_feedbacks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own feedback"
  ON public.card_feedbacks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own feedback (only new)"
  ON public.card_feedbacks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'new')
  WITH CHECK (user_id = auth.uid() AND status = 'new');

CREATE POLICY "Admins have full access to feedbacks"
  ON public.card_feedbacks
  FOR ALL
  TO authenticated
  USING (public.check_user_is_admin())
  WITH CHECK (public.check_user_is_admin());

-- Create bucket for screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('feedbacks', 'feedbacks', true) ON CONFLICT (id) DO NOTHING;

-- Storage Policies for feedbacks bucket
CREATE POLICY "Authenticated users can upload feedback screenshots"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'feedbacks');

CREATE POLICY "Public read access for feedback screenshots"
ON storage.objects FOR SELECT TO public USING (bucket_id = 'feedbacks');

CREATE POLICY "Admins can delete feedback screenshots"
ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'feedbacks' AND public.check_user_is_admin());

CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'feedbacks' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Trigger for updated_at
CREATE TRIGGER set_card_feedbacks_updated_at
BEFORE UPDATE ON public.card_feedbacks
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_updated_at();

-- Add feature flag to app_config
INSERT INTO public.app_config (key, value, value_type, category, label, description)
VALUES ('ff_card_feedback_enabled', 'true', 'boolean', 'feature_flags', 'تقييم الكروت واقتراح التعديلات', 'إظهار زر تقييم الكارت واقتراح التعديلات بعد الشحن وفي سجل العمليات')
ON CONFLICT (key) DO NOTHING;
