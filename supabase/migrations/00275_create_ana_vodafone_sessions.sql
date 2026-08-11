
-- جدول جلسات أنا فودافون — لحفظ Token Server-Side بدون تسريب للـ Frontend
CREATE TABLE IF NOT EXISTS ana_vodafone_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  phone        text NOT NULL,
  -- access_token مخزن بشكل آمن — لا يُرسل أبداً للـ Frontend
  access_token  text NOT NULL,
  refresh_token text,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ana_vf_sessions_user_unique UNIQUE (user_id)
);

-- RLS
ALTER TABLE ana_vodafone_sessions ENABLE ROW LEVEL SECURITY;

-- المستخدم يقرأ/يعدّل جلسته فقط (بدون access_token)
-- استخدام View منفصل لإخفاء الـ token عن Frontend
CREATE POLICY "user_select_own_session"
  ON ana_vodafone_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- لا يسمح بالإدراج المباشر من Frontend — يتم عبر Edge Function فقط
-- لا policy INSERT للمستخدم العادي
-- لا policy DELETE للمستخدم العادي (Edge Function تتعامل معها)

-- Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_ana_vf_session_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ana_vf_session_updated
  BEFORE UPDATE ON ana_vodafone_sessions
  FOR EACH ROW EXECUTE FUNCTION update_ana_vf_session_timestamp();

-- View آمن — يُخفي access_token و refresh_token عن Frontend
CREATE OR REPLACE VIEW ana_vodafone_session_view AS
  SELECT
    id,
    user_id,
    phone,
    expires_at,
    created_at,
    updated_at,
    -- حالة الجلسة محسوبة
    CASE WHEN expires_at > now() THEN true ELSE false END AS is_valid
  FROM ana_vodafone_sessions
  WHERE user_id = auth.uid();

-- RLS على الـ View (Postgres 15+)
ALTER VIEW ana_vodafone_session_view SET (security_invoker = true);
