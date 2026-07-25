
-- ─── Phase 6: Merchant Members & Subscription System ─────────────────────────
-- ADDITIVE ONLY

-- Rename existing convenience view to avoid collision
DROP VIEW IF EXISTS merchant_members;
CREATE OR REPLACE VIEW merchant_members_view AS
  SELECT p.id AS user_id, p.username, p.email, p.role, p.is_active,
         p.created_at, p.merchant_id, m.name AS merchant_name, m.status AS merchant_status
  FROM profiles p LEFT JOIN merchants m ON p.merchant_id = m.id;

-- ── ENUMs ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('pending','active','suspended','disabled','blocked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('pending','active','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_tx_type AS ENUM (
    'assign','increase','decrease','refund','adjustment',
    'subscription_bonus','admin_grant','admin_remove','consume'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── merchant_members TABLE ────────────────────────────────────────────────────
CREATE TABLE merchant_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       uuid NOT NULL REFERENCES merchants(id)  ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  status            member_status NOT NULL DEFAULT 'pending',
  assigned_points   bigint NOT NULL DEFAULT 0 CHECK (assigned_points  >= 0),
  consumed_points   bigint NOT NULL DEFAULT 0 CHECK (consumed_points  >= 0),
  remaining_points  bigint NOT NULL DEFAULT 0 CHECK (remaining_points >= 0),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  activated_at      timestamptz,
  expired_at        timestamptz,
  last_operation_at timestamptz,
  last_login_at     timestamptz,
  UNIQUE (merchant_id, user_id)
);

-- ── merchant_member_subscriptions ─────────────────────────────────────────────
CREATE TABLE merchant_member_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        uuid NOT NULL REFERENCES merchant_members(id) ON DELETE CASCADE UNIQUE,
  merchant_id      uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  status           subscription_status NOT NULL DEFAULT 'pending',
  assigned_points  bigint NOT NULL DEFAULT 0 CHECK (assigned_points  >= 0),
  consumed_points  bigint NOT NULL DEFAULT 0 CHECK (consumed_points  >= 0),
  remaining_points bigint NOT NULL DEFAULT 0 CHECK (remaining_points >= 0),
  start_date       date,
  end_date         date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  renewed_at       timestamptz
);

-- ── merchant_member_ledger (Append-Only) ──────────────────────────────────────
CREATE TABLE merchant_member_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  member_id      uuid NOT NULL REFERENCES merchant_members(id) ON DELETE CASCADE,
  merchant_id    uuid NOT NULL REFERENCES merchants(id)        ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES profiles(id)         ON DELETE CASCADE,
  type           member_tx_type NOT NULL,
  amount         bigint NOT NULL,
  balance_before bigint NOT NULL,
  balance_after  bigint NOT NULL,
  reason         text,
  notes          text,
  created_by     uuid REFERENCES profiles(id),
  correlation_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_merchant_members_merchant_id ON merchant_members(merchant_id);
CREATE INDEX idx_merchant_members_user_id     ON merchant_members(user_id);
CREATE INDEX idx_merchant_members_status      ON merchant_members(status);
CREATE INDEX idx_mms_member_id                ON merchant_member_subscriptions(member_id);
CREATE INDEX idx_mml_member_id                ON merchant_member_ledger(member_id);
CREATE INDEX idx_mml_merchant_id              ON merchant_member_ledger(merchant_id);
CREATE INDEX idx_mml_created_at               ON merchant_member_ledger(created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE merchant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_member_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_member_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin_user() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
  $$;

CREATE OR REPLACE FUNCTION caller_owns_merchant(p_merchant_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND merchant_id = p_merchant_id AND role = 'merchant');
  $$;

CREATE POLICY "mm_admin_all"     ON merchant_members FOR ALL    USING (is_admin_user());
CREATE POLICY "mm_merchant_read" ON merchant_members FOR SELECT USING (caller_owns_merchant(merchant_id));
CREATE POLICY "mm_user_read"     ON merchant_members FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "mms_admin_all"     ON merchant_member_subscriptions FOR ALL    USING (is_admin_user());
CREATE POLICY "mms_merchant_read" ON merchant_member_subscriptions FOR SELECT USING (caller_owns_merchant(merchant_id));
CREATE POLICY "mms_user_read"     ON merchant_member_subscriptions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "mml_admin_all"     ON merchant_member_ledger FOR ALL    USING (is_admin_user());
CREATE POLICY "mml_merchant_read" ON merchant_member_ledger FOR SELECT USING (caller_owns_merchant(merchant_id));
CREATE POLICY "mml_user_read"     ON merchant_member_ledger FOR SELECT USING (user_id = auth.uid());

-- ── ensure_merchant_member ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_merchant_member(p_merchant_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF v_id IS NULL THEN
    INSERT INTO merchant_members (merchant_id, user_id, status)
    VALUES (p_merchant_id, p_user_id, 'pending') RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

-- ── assign_points_to_member ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assign_points_to_member(
  p_merchant_id uuid, p_user_id uuid, p_amount bigint,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id uuid; v_wallet_id uuid; v_wallet_pts bigint;
  v_before bigint; v_after bigint;
  v_tx_id uuid := gen_random_uuid();
  v_corr_id uuid := gen_random_uuid();
  v_actor_id uuid := COALESCE(p_admin_id, auth.uid());
BEGIN
  IF p_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','يجب أن يكون العدد موجباً'); END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM merchant_member_ledger WHERE correlation_id::text=p_idempotency_key) THEN
      RETURN jsonb_build_object('success',false,'error','عملية مكررة');
    END IF;
  END IF;
  v_member_id := ensure_merchant_member(p_merchant_id, p_user_id);
  SELECT id, current_points INTO v_wallet_id, v_wallet_pts
    FROM merchant_wallets WHERE merchant_id=p_merchant_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','لا توجد محفظة للتاجر'); END IF;
  IF v_wallet_pts < p_amount THEN RETURN jsonb_build_object('success',false,'error','رصيد التاجر غير كافٍ'); END IF;
  UPDATE merchant_wallets
    SET current_points=current_points-p_amount, used_points=used_points+p_amount,
        lifetime_consumed=lifetime_consumed+p_amount, last_operation_at=now()
    WHERE id=v_wallet_id;
  SELECT remaining_points INTO v_before FROM merchant_members WHERE id=v_member_id FOR UPDATE;
  v_after := v_before + p_amount;
  UPDATE merchant_members
    SET assigned_points=assigned_points+p_amount, remaining_points=remaining_points+p_amount,
        status=CASE WHEN status='pending' THEN 'active'::member_status ELSE status END,
        activated_at=COALESCE(activated_at,now()), last_operation_at=now()
    WHERE id=v_member_id;
  INSERT INTO merchant_member_ledger
    (transaction_id,member_id,merchant_id,user_id,type,amount,balance_before,balance_after,reason,notes,created_by,correlation_id)
    VALUES (v_tx_id,v_member_id,p_merchant_id,p_user_id,'assign',p_amount,v_before,v_after,p_reason,p_notes,v_actor_id,v_corr_id);
  INSERT INTO merchant_ledger
    (transaction_id,merchant_id,type,amount,balance_before,balance_after,reason,notes,created_by,correlation_id)
    VALUES (gen_random_uuid(),p_merchant_id,'deduct',-p_amount,v_wallet_pts,v_wallet_pts-p_amount,
      COALESCE(p_reason,'توزيع نقاط لعضو'),p_notes,v_actor_id,v_corr_id);
  RETURN jsonb_build_object('success',true,'transaction_id',v_tx_id,'balance_before',v_before,'balance_after',v_after);
END; $$;

-- ── increase_member_points ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increase_member_points(
  p_merchant_id uuid, p_user_id uuid, p_amount bigint,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN assign_points_to_member(p_merchant_id,p_user_id,p_amount,p_reason,p_notes,p_admin_id,p_idempotency_key);
END; $$;

-- ── decrease_member_points ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrease_member_points(
  p_merchant_id uuid, p_user_id uuid, p_amount bigint,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id uuid; v_before bigint; v_after bigint;
  v_tx_id uuid := gen_random_uuid();
  v_actor_id uuid := COALESCE(p_admin_id, auth.uid());
BEGIN
  IF p_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','يجب أن يكون العدد موجباً'); END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM merchant_member_ledger WHERE correlation_id::text=p_idempotency_key) THEN
      RETURN jsonb_build_object('success',false,'error','عملية مكررة');
    END IF;
  END IF;
  SELECT id INTO v_member_id FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF v_member_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','العضو غير موجود'); END IF;
  SELECT remaining_points INTO v_before FROM merchant_members WHERE id=v_member_id FOR UPDATE;
  IF v_before < p_amount THEN RETURN jsonb_build_object('success',false,'error','رصيد العضو غير كافٍ'); END IF;
  v_after := v_before - p_amount;
  UPDATE merchant_members
    SET consumed_points=consumed_points+p_amount, remaining_points=remaining_points-p_amount, last_operation_at=now()
    WHERE id=v_member_id;
  INSERT INTO merchant_member_ledger
    (transaction_id,member_id,merchant_id,user_id,type,amount,balance_before,balance_after,reason,notes,created_by)
    VALUES (v_tx_id,v_member_id,p_merchant_id,p_user_id,'decrease',-p_amount,v_before,v_after,p_reason,p_notes,v_actor_id);
  RETURN jsonb_build_object('success',true,'transaction_id',v_tx_id,'balance_before',v_before,'balance_after',v_after);
END; $$;

-- ── activate_member_subscription ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION activate_member_subscription(
  p_merchant_id uuid, p_user_id uuid,
  p_days int DEFAULT 30, p_points bigint DEFAULT 0,
  p_start_date date DEFAULT NULL, p_admin_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id uuid;
  v_start date := COALESCE(p_start_date, CURRENT_DATE);
  v_end   date := COALESCE(p_start_date, CURRENT_DATE) + p_days;
BEGIN
  v_member_id := ensure_merchant_member(p_merchant_id, p_user_id);
  UPDATE merchant_members
    SET status='active'::member_status, activated_at=COALESCE(activated_at,now()), last_operation_at=now()
    WHERE id=v_member_id;
  INSERT INTO merchant_member_subscriptions
    (member_id,merchant_id,user_id,status,assigned_points,remaining_points,start_date,end_date)
    VALUES (v_member_id,p_merchant_id,p_user_id,'active'::subscription_status,p_points,p_points,v_start,v_end)
  ON CONFLICT (member_id) DO UPDATE
    SET status='active'::subscription_status,
        assigned_points=EXCLUDED.assigned_points, remaining_points=EXCLUDED.remaining_points,
        start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, renewed_at=now();
  RETURN jsonb_build_object('success',true,'start_date',v_start,'end_date',v_end);
END; $$;

-- ── renew_member_subscription ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION renew_member_subscription(
  p_merchant_id uuid, p_user_id uuid,
  p_days int DEFAULT 30, p_points bigint DEFAULT 0,
  p_start_date date DEFAULT NULL, p_admin_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN activate_member_subscription(p_merchant_id,p_user_id,p_days,p_points,p_start_date,p_admin_id);
END; $$;

-- ── set_member_status ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_member_status(
  p_merchant_id uuid, p_user_id uuid, p_new_status text, p_admin_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_member_id uuid;
BEGIN
  SELECT id INTO v_member_id FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF v_member_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','العضو غير موجود'); END IF;
  UPDATE merchant_members SET status=p_new_status::member_status, last_operation_at=now() WHERE id=v_member_id;
  IF p_new_status IN ('blocked','suspended','expired','disabled') THEN
    UPDATE merchant_member_subscriptions
      SET status='cancelled'::subscription_status
      WHERE member_id=v_member_id AND status='active'::subscription_status;
  END IF;
  RETURN jsonb_build_object('success',true);
END; $$;

-- ── delete_merchant_member ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_merchant_member(
  p_merchant_id uuid, p_user_id uuid, p_admin_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_member_id uuid;
BEGIN
  SELECT id INTO v_member_id FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF v_member_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','العضو غير موجود'); END IF;
  DELETE FROM merchant_members WHERE id=v_member_id;
  RETURN jsonb_build_object('success',true);
END; $$;

-- ── get_merchant_member ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_member(p_merchant_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_member merchant_members; v_sub merchant_member_subscriptions;
BEGIN
  SELECT * INTO v_member FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF v_member.id IS NULL THEN RETURN jsonb_build_object('success',true,'member',NULL); END IF;
  SELECT * INTO v_sub FROM merchant_member_subscriptions WHERE member_id=v_member.id;
  RETURN jsonb_build_object(
    'success',true,
    'member', row_to_json(v_member),
    'subscription', CASE WHEN v_sub.id IS NULL THEN NULL ELSE row_to_json(v_sub) END
  );
END; $$;

-- ── get_member_history ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_member_history(
  p_merchant_id uuid, p_user_id uuid,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_member_id uuid; v_total bigint; v_items jsonb;
BEGIN
  SELECT id INTO v_member_id FROM merchant_members WHERE merchant_id=p_merchant_id AND user_id=p_user_id;
  IF v_member_id IS NULL THEN RETURN jsonb_build_object('success',true,'total',0,'items','[]'::jsonb); END IF;
  SELECT COUNT(*) INTO v_total FROM merchant_member_ledger WHERE member_id=v_member_id;
  SELECT jsonb_agg(row_to_json(t)) INTO v_items FROM (
    SELECT * FROM merchant_member_ledger WHERE member_id=v_member_id
    ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset
  ) t;
  RETURN jsonb_build_object('success',true,'total',v_total,'items',COALESCE(v_items,'[]'::jsonb));
END; $$;

-- ── get_merchant_members_paged ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_members_paged(
  p_merchant_id uuid, p_search text DEFAULT NULL, p_status text DEFAULT NULL,
  p_page int DEFAULT 1, p_page_size int DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_offset int:=(p_page-1)*p_page_size; v_total bigint; v_items jsonb;
BEGIN
  SELECT COUNT(DISTINCT mm.id) INTO v_total
  FROM merchant_members mm JOIN profiles p ON p.id=mm.user_id
  WHERE mm.merchant_id=p_merchant_id
    AND (p_status IS NULL OR mm.status::text=p_status)
    AND (p_search IS NULL OR p.username ILIKE '%'||p_search||'%'
         OR p.phone ILIKE '%'||p_search||'%' OR p.email ILIKE '%'||p_search||'%');
  SELECT jsonb_agg(row_to_json(t)) INTO v_items FROM (
    SELECT mm.id AS member_id, mm.user_id, mm.status AS member_status,
      mm.assigned_points, mm.consumed_points, mm.remaining_points,
      mm.created_at AS member_created_at, mm.activated_at, mm.expired_at, mm.last_operation_at,
      p.username, p.phone, p.email,
      s.status AS sub_status, s.start_date, s.end_date,
      CASE WHEN s.end_date IS NULL OR s.end_date < CURRENT_DATE THEN 0
           ELSE (s.end_date - CURRENT_DATE) END AS remaining_days,
      s.assigned_points AS sub_assigned_points,
      s.remaining_points AS sub_remaining_points
    FROM merchant_members mm
    JOIN profiles p ON p.id=mm.user_id
    LEFT JOIN merchant_member_subscriptions s ON s.member_id=mm.id
    WHERE mm.merchant_id=p_merchant_id
      AND (p_status IS NULL OR mm.status::text=p_status)
      AND (p_search IS NULL OR p.username ILIKE '%'||p_search||'%'
           OR p.phone ILIKE '%'||p_search||'%' OR p.email ILIKE '%'||p_search||'%')
    ORDER BY mm.created_at DESC LIMIT p_page_size OFFSET v_offset
  ) t;
  RETURN jsonb_build_object('success',true,'total',v_total,'page',p_page,
    'pages',CEIL(v_total::numeric/p_page_size),'items',COALESCE(v_items,'[]'::jsonb));
END; $$;

-- ── get_merchant_members_stats ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_merchant_members_stats(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE r record;
BEGIN
  SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status='active')    AS active,
    COUNT(*) FILTER (WHERE status='suspended') AS suspended,
    COUNT(*) FILTER (WHERE status='blocked')   AS blocked,
    COUNT(*) FILTER (WHERE status='pending')   AS pending,
    COUNT(*) FILTER (WHERE status='expired')   AS expired,
    COALESCE(SUM(assigned_points),0)           AS total_assigned,
    COALESCE(SUM(consumed_points),0)           AS total_consumed,
    COALESCE(SUM(remaining_points),0)          AS total_remaining
  INTO r FROM merchant_members WHERE merchant_id=p_merchant_id;
  RETURN to_jsonb(r);
END; $$;

-- ── admin_get_all_members ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_all_members(
  p_search text DEFAULT NULL, p_status text DEFAULT NULL,
  p_merchant uuid DEFAULT NULL, p_page int DEFAULT 1, p_page_size int DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_offset int:=(p_page-1)*p_page_size; v_total bigint; v_items jsonb;
BEGIN
  SELECT COUNT(DISTINCT mm.id) INTO v_total
  FROM merchant_members mm JOIN profiles p ON p.id=mm.user_id JOIN merchants m ON m.id=mm.merchant_id
  WHERE (p_merchant IS NULL OR mm.merchant_id=p_merchant)
    AND (p_status IS NULL OR mm.status::text=p_status)
    AND (p_search IS NULL OR p.username ILIKE '%'||p_search||'%'
         OR p.phone ILIKE '%'||p_search||'%' OR m.name ILIKE '%'||p_search||'%');
  SELECT jsonb_agg(row_to_json(t)) INTO v_items FROM (
    SELECT mm.id AS member_id, mm.user_id, mm.merchant_id,
      mm.status AS member_status, mm.assigned_points, mm.consumed_points, mm.remaining_points,
      mm.created_at AS member_created_at, mm.activated_at, mm.last_operation_at,
      p.username, p.phone, p.email, m.name AS merchant_name,
      s.status AS sub_status, s.start_date, s.end_date,
      CASE WHEN s.end_date IS NULL OR s.end_date < CURRENT_DATE THEN 0
           ELSE (s.end_date - CURRENT_DATE) END AS remaining_days
    FROM merchant_members mm
    JOIN profiles p ON p.id=mm.user_id JOIN merchants m ON m.id=mm.merchant_id
    LEFT JOIN merchant_member_subscriptions s ON s.member_id=mm.id
    WHERE (p_merchant IS NULL OR mm.merchant_id=p_merchant)
      AND (p_status IS NULL OR mm.status::text=p_status)
      AND (p_search IS NULL OR p.username ILIKE '%'||p_search||'%'
           OR p.phone ILIKE '%'||p_search||'%' OR m.name ILIKE '%'||p_search||'%')
    ORDER BY mm.created_at DESC LIMIT p_page_size OFFSET v_offset
  ) t;
  RETURN jsonb_build_object('success',true,'total',v_total,'page',p_page,
    'pages',CEIL(v_total::numeric/p_page_size),'items',COALESCE(v_items,'[]'::jsonb));
END; $$;

-- ── Backfill: only role='user' profiles linked to a merchant ──────────────────
INSERT INTO merchant_members (merchant_id, user_id, status, activated_at, created_at)
SELECT p.merchant_id, p.id,
  CASE p.merchant_user_status
    WHEN 'active'    THEN 'active'::member_status
    WHEN 'suspended' THEN 'suspended'::member_status
    WHEN 'blocked'   THEN 'blocked'::member_status
    ELSE 'pending'::member_status
  END,
  CASE WHEN p.merchant_user_status = 'active' THEN now() ELSE NULL END,
  now()
FROM profiles p
WHERE p.merchant_id IS NOT NULL AND p.role = 'user'
ON CONFLICT (merchant_id, user_id) DO NOTHING;
