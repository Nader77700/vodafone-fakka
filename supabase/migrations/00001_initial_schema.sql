
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'super_admin');
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'suspended', 'pending');
CREATE TYPE public.license_key_status AS ENUM ('active', 'used', 'disabled');
CREATE TYPE public.operation_status AS ENUM ('success', 'failed', 'pending');
CREATE TYPE public.notification_type AS ENUM ('subscription_renewal', 'system', 'operation', 'info');
CREATE TYPE public.log_level AS ENUM ('info', 'warning', 'error', 'debug');

-- ==========================================
-- PROFILES TABLE
-- ==========================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  email text,
  phone text,
  full_name text,
  role public.user_role NOT NULL DEFAULT 'user',
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- LICENSE KEYS TABLE
-- ==========================================
CREATE TABLE public.license_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  status public.license_key_status NOT NULL DEFAULT 'active',
  duration_days integer NOT NULL DEFAULT 30,
  used_by uuid REFERENCES public.profiles(id),
  used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- SUBSCRIPTIONS TABLE
-- ==========================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  license_key_id uuid REFERENCES public.license_keys(id),
  status public.subscription_status NOT NULL DEFAULT 'pending',
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- FAVORITES TABLE
-- ==========================================
CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text,
  phone_number text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- OPERATIONS TABLE
-- ==========================================
CREATE TABLE public.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  card_type text,
  card_data jsonb,
  status public.operation_status NOT NULL DEFAULT 'pending',
  error_message text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- NOTIFICATIONS TABLE
-- ==========================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type public.notification_type NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- SYSTEM LOGS TABLE
-- ==========================================
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  level public.log_level NOT NULL DEFAULT 'info',
  action text NOT NULL,
  message text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==========================================
-- TRIGGER: Auto-sync new users to profiles
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- HELPER FUNCTION: get_user_role
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

-- ==========================================
-- TRIGGER: Updated_at timestamps
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER license_keys_updated_at BEFORE UPDATE ON public.license_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER favorites_updated_at BEFORE UPDATE ON public.favorites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to profiles" ON public.profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- License Keys
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to license_keys" ON public.license_keys
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Users can select active license keys" ON public.license_keys
  FOR SELECT TO authenticated USING (status = 'active'::public.license_key_status);

-- Subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Favorites
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to favorites" ON public.favorites
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Users CRUD own favorites" ON public.favorites
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Operations
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to operations" ON public.operations
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Users can view own operations" ON public.operations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own operations" ON public.operations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to notifications" ON public.notifications
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Users can view own and global notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_global = true);

CREATE POLICY "Users can mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- System Logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view system_logs" ON public.system_logs
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'super_admin'::public.user_role));

CREATE POLICY "Authenticated users can insert logs" ON public.system_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ==========================================
-- PUBLIC PROFILES VIEW
-- ==========================================
CREATE VIEW public.public_profiles AS
  SELECT id, username, role, full_name, avatar_url FROM public.profiles;

-- ==========================================
-- SEED: Initial global notifications
-- ==========================================
INSERT INTO public.notifications (title, body, type, is_global, is_read)
VALUES
  ('مرحباً بكم في Vodafone Fakka Premium', 'شكراً لاشتراككم في منصتنا الاحترافية. يمكنكم الآن البدء باستخدام خدمة شحن الكروت.', 'info', true, false),
  ('الربط مع محرك الشحن', 'سيتم تفعيل محرك الشحن الخارجي قريباً. ترقبوا التحديثات.', 'system', true, false);
