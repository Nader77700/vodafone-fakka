
-- ══════════════════════════════════════════════════════════════════
-- Migration 00113 (fixed): Merchant Welcome System + Admin Overview
-- ══════════════════════════════════════════════════════════════════

-- ── 1. جدول merchant_welcome_seen ────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_welcome_seen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant_id  uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  version      integer NOT NULL DEFAULT 1,
  seen_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_id)
);

ALTER TABLE merchant_welcome_seen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='merchant_welcome_seen' AND policyname='mws_user_all') THEN
    CREATE POLICY mws_user_all ON merchant_welcome_seen FOR ALL
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='merchant_welcome_seen' AND policyname='mws_admin_select') THEN
    CREATE POLICY mws_admin_select ON merchant_welcome_seen FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','super_admin')));
  END IF;
END $$;

-- ── 2. أعمدة welcome_instructions + instructions_version ─────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='merchants' AND column_name='welcome_instructions') THEN
    ALTER TABLE merchants ADD COLUMN welcome_instructions text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='merchants' AND column_name='instructions_version') THEN
    ALTER TABLE merchants ADD COLUMN instructions_version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ── 3. Drop & recreate RPCs بشكل نظيف ────────────────────────────
DROP FUNCTION IF EXISTS get_merchant_welcome_status(uuid);
DROP FUNCTION IF EXISTS dismiss_merchant_welcome(uuid, uuid, integer);
DROP FUNCTION IF EXISTS admin_get_merchants_overview();
DROP FUNCTION IF EXISTS update_merchant_settings(uuid,text,text,text,text,integer,integer,integer,boolean,text);

-- RPC: get_merchant_welcome_status
CREATE FUNCTION get_merchant_welcome_status(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_merchant merchants%ROWTYPE;
  v_seen     merchant_welcome_seen%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id=p_user_id;
  IF NOT FOUND OR v_profile.merchant_id IS NULL THEN RETURN jsonb_build_object('should_show',false); END IF;
  SELECT * INTO v_merchant FROM merchants WHERE id=v_profile.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('should_show',false); END IF;
  IF v_merchant.welcome_instructions IS NULL OR trim(v_merchant.welcome_instructions)='' THEN
    RETURN jsonb_build_object('should_show',false);
  END IF;
  SELECT * INTO v_seen FROM merchant_welcome_seen WHERE user_id=p_user_id AND merchant_id=v_profile.merchant_id;
  IF FOUND AND v_seen.version >= COALESCE(v_merchant.instructions_version,1) THEN
    RETURN jsonb_build_object('should_show',false);
  END IF;
  RETURN jsonb_build_object(
    'should_show',  true,
    'instructions', v_merchant.welcome_instructions,
    'version',      COALESCE(v_merchant.instructions_version,1),
    'merchant_id',  v_merchant.id::text
  );
END;
$$;

-- RPC: dismiss_merchant_welcome
CREATE FUNCTION dismiss_merchant_welcome(p_user_id uuid, p_merchant_id uuid, p_version integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO merchant_welcome_seen(user_id,merchant_id,version,seen_at)
  VALUES(p_user_id,p_merchant_id,p_version,now())
  ON CONFLICT(user_id,merchant_id) DO UPDATE SET version=EXCLUDED.version, seen_at=now();
  RETURN jsonb_build_object('success',true);
END;
$$;

-- RPC: admin_get_merchants_overview
CREATE FUNCTION admin_get_merchants_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id=auth.uid();
  IF v_role NOT IN ('admin','super_admin') THEN RETURN '[]'::jsonb; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb)
    FROM (
      SELECT
        m.id, m.name, m.status, m.brand_color, m.created_at,
        COALESCE(m.balance,0) AS current_balance,
        COALESCE((SELECT SUM(mm2.assigned_points-mm2.consumed_points) FROM merchant_members mm2 WHERE mm2.merchant_id=m.id),0) AS remaining_points,
        COALESCE((SELECT SUM(pt.amount) FROM merchant_point_transactions pt WHERE pt.merchant_id=m.id AND pt.type='credit'),0) AS total_points_received,
        COALESCE((SELECT SUM(mm2.consumed_points) FROM merchant_members mm2 WHERE mm2.merchant_id=m.id),0) AS total_points_given,
        COALESCE((SELECT COUNT(*) FROM merchant_members mm2 WHERE mm2.merchant_id=m.id),0) AS member_count,
        COALESCE((SELECT COUNT(*) FROM merchant_operations mo WHERE mo.merchant_id=m.id),0) AS operation_count,
        COALESCE((SELECT COUNT(*) FROM merchant_member_subscriptions mms WHERE mms.merchant_id=m.id AND mms.status='active'),0) AS active_subs,
        COALESCE((SELECT COUNT(*) FROM merchant_member_subscriptions mms WHERE mms.merchant_id=m.id AND mms.status IN ('expired','cancelled')),0) AS expired_subs,
        COALESCE((SELECT COUNT(*) FROM merchant_license_codes mlc WHERE mlc.merchant_id=m.id),0) AS code_count,
        (SELECT MAX(sub_acts.created_at) FROM (
          SELECT created_at FROM merchant_operations WHERE merchant_id=m.id
          UNION ALL SELECT created_at FROM merchant_member_subscriptions WHERE merchant_id=m.id
        ) sub_acts) AS last_activity
      FROM merchants m ORDER BY m.created_at DESC
    ) t
  );
END;
$$;

-- RPC: update_merchant_settings (يدعم welcome_instructions)
CREATE FUNCTION update_merchant_settings(
  p_merchant_id uuid,
  p_name text DEFAULT NULL, p_brand_color text DEFAULT NULL, p_logo_url text DEFAULT NULL,
  p_welcome_msg text DEFAULT NULL, p_max_users integer DEFAULT NULL,
  p_ops_per_sub integer DEFAULT NULL, p_sub_duration_days integer DEFAULT NULL,
  p_invite_enabled boolean DEFAULT NULL, p_welcome_instructions text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_row merchants%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id=auth.uid();
  IF v_role NOT IN ('admin','super_admin') THEN RETURN jsonb_build_object('success',false,'error','unauthorized'); END IF;
  SELECT * INTO v_row FROM merchants WHERE id=p_merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','merchant_not_found'); END IF;
  UPDATE merchants SET
    name=COALESCE(p_name,v_row.name),
    brand_color=COALESCE(p_brand_color,v_row.brand_color),
    logo_url=COALESCE(p_logo_url,v_row.logo_url),
    welcome_msg=COALESCE(p_welcome_msg,v_row.welcome_msg),
    max_users=COALESCE(p_max_users,v_row.max_users),
    ops_per_sub=COALESCE(p_ops_per_sub,v_row.ops_per_sub),
    sub_duration_days=COALESCE(p_sub_duration_days,v_row.sub_duration_days),
    invite_enabled=COALESCE(p_invite_enabled,v_row.invite_enabled),
    welcome_instructions=COALESCE(p_welcome_instructions,v_row.welcome_instructions),
    instructions_version=CASE
      WHEN p_welcome_instructions IS NOT NULL AND p_welcome_instructions IS DISTINCT FROM v_row.welcome_instructions
      THEN COALESCE(v_row.instructions_version,1)+1
      ELSE COALESCE(v_row.instructions_version,1) END
  WHERE id=p_merchant_id;
  RETURN jsonb_build_object('success',true);
END;
$$;

-- ── 4. منح الصلاحيات ────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_merchant_welcome_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION dismiss_merchant_welcome(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_merchants_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION update_merchant_settings(uuid,text,text,text,text,integer,integer,integer,boolean,text) TO authenticated;
