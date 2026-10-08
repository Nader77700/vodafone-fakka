CREATE TABLE IF NOT EXISTS public.vip_red_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id)
    ON DELETE CASCADE,
  role_type text NOT NULL CHECK (role_type IN ('merchant', 'user')),
  full_name text NOT NULL,
  whatsapp_phone text NOT NULL,
  is_approved boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vip_red_profile_user 
    UNIQUE (user_id)
); ALTER TABLE public.vip_red_monitored_lines 
  ADD COLUMN IF NOT EXISTS package_tier text
    NOT NULL
    DEFAULT '100gb'
    CHECK (package_tier IN ('100gb', '150gb', '200gb', 'custom')),
  ADD COLUMN IF NOT EXISTS package_price numeric(10, 2)
    NOT NULL
    DEFAULT 450.00,
  ADD COLUMN IF NOT EXISTS ana_vodafone_password text
    NULL,
  ADD COLUMN IF NOT EXISTS ana_vodafone_password_updated_at timestamptz
    NULL,
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid
    NULL
    REFERENCES auth.users (id)
      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_status text
    NOT NULL
    DEFAULT 'approved'
    CHECK (claim_status IN ('unclaimed', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS claim_rejection_reason text
    NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz
    NULL; CREATE TABLE IF NOT EXISTS public.vip_red_line_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.vip_red_monitored_lines (id)
    ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id)
    ON DELETE CASCADE,
  phone_number text NOT NULL,
  requester_name text NOT NULL,
  requester_whatsapp text NOT NULL,
  requester_role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text NULL,
  reviewed_by uuid NULL REFERENCES auth.users (id),
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
); ALTER TABLE public.vip_red_profiles 
  ENABLE ROW LEVEL SECURITY; ALTER TABLE public.vip_red_line_claims 
  ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS vip_red_profiles_select ON public.vip_red_profiles; CREATE POLICY vip_red_profiles_select
  ON public.vip_red_profiles
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (
    auth.uid() = user_id
      OR auth.role() = 'authenticated'
  ); DROP POLICY IF EXISTS vip_red_profiles_all_admin ON public.vip_red_profiles; CREATE POLICY vip_red_profiles_all_admin
  ON public.vip_red_profiles
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    auth.role() = 'authenticated'
  ); DROP POLICY IF EXISTS vip_red_line_claims_all ON public.vip_red_line_claims; CREATE POLICY vip_red_line_claims_all
  ON public.vip_red_line_claims
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    auth.role() = 'authenticated'
  );