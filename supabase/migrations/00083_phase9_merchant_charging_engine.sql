
-- ══════════════════════════════════════════════════════════════════
-- Phase 9: Merchant Charging Engine — ADDITIVE ONLY
-- ══════════════════════════════════════════════════════════════════

-- ─── merchant_operations table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_operations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id     UUID NULL REFERENCES operations(id) ON DELETE SET NULL,
  operation_source TEXT NOT NULL DEFAULT 'vodafone_cash'
    CHECK (operation_source IN ('vodafone_cash', 'mobile_balance')),
  card_name        TEXT,
  product_id       TEXT,
  price            NUMERIC(10,2),
  units            INTEGER,
  duration_days    INTEGER,
  phone_number     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  transaction_id   TEXT,
  correlation_id   TEXT,
  card_data        JSONB,
  failure_reason   TEXT,
  failure_stage    TEXT,
  api_response     TEXT,
  points_deducted  INTEGER NOT NULL DEFAULT 0,
  executed_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  duration_ms      INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_ops_merchant ON merchant_operations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_ops_user     ON merchant_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_ops_status   ON merchant_operations(status);
CREATE INDEX IF NOT EXISTS idx_merchant_ops_source   ON merchant_operations(operation_source);
CREATE INDEX IF NOT EXISTS idx_merchant_ops_created  ON merchant_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_ops_op_id    ON merchant_operations(operation_id);

ALTER TABLE merchant_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY merchant_ops_admin_all ON merchant_operations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY merchant_ops_merchant_read ON merchant_operations
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE created_by = auth.uid())
  );

CREATE POLICY merchant_ops_user_read ON merchant_operations
  FOR SELECT USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════
-- TRIGGER: post-process operations for merchant users — ADDITIVE
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION operations_merchant_post_process()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_member_id   UUID;
  v_op_source   TEXT;
  v_existing_id UUID;
BEGIN
  SELECT merchant_id INTO v_merchant_id FROM profiles WHERE id = NEW.user_id;
  IF v_merchant_id IS NULL THEN RETURN NEW; END IF;

  v_op_source := COALESCE(
    NEW.operation_source,
    CASE WHEN NEW.card_type ILIKE '%balance%' OR NEW.card_type ILIKE '%رصيد%'
         THEN 'mobile_balance' ELSE 'vodafone_cash' END
  );

  SELECT id INTO v_existing_id FROM merchant_operations WHERE operation_id = NEW.id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE merchant_operations SET
      status         = NEW.status,
      failure_reason = NEW.error_message,
      api_response   = NEW.api_response,
      completed_at   = CASE WHEN NEW.status IN ('success','failed') THEN NOW() ELSE completed_at END,
      duration_ms    = NEW.latency_ms,
      updated_at     = NOW()
    WHERE id = v_existing_id;
    RETURN NEW;
  END IF;

  INSERT INTO merchant_operations (
    merchant_id, user_id, operation_id,
    operation_source, card_name, product_id,
    price, phone_number,
    status, failure_reason, api_response,
    correlation_id, duration_ms,
    executed_at, completed_at, points_deducted
  ) VALUES (
    v_merchant_id, NEW.user_id, NEW.id,
    v_op_source, NEW.card_type, NEW.card_type,
    NEW.amount, NEW.phone_number,
    NEW.status, NEW.error_message, NEW.api_response,
    NEW.correlation_id, NEW.latency_ms,
    NEW.performed_at,
    CASE WHEN NEW.status IN ('success','failed') THEN NOW() ELSE NULL END,
    0
  );

  IF NEW.status = 'success' THEN
    UPDATE merchant_members
    SET last_operation_at = NOW(), updated_at = NOW()
    WHERE merchant_id = v_merchant_id AND user_id = NEW.user_id;

    SELECT id INTO v_member_id FROM merchant_members
    WHERE merchant_id = v_merchant_id AND user_id = NEW.user_id;

    IF v_member_id IS NOT NULL THEN
      UPDATE merchant_member_subscriptions
      SET
        consumed_points   = consumed_points + 1,
        remaining_points  = GREATEST(0, remaining_points - 1),
        last_operation_at = NOW(),
        updated_at        = NOW()
      WHERE member_id = v_member_id AND status = 'active' AND remaining_points > 0;

      UPDATE merchant_operations SET points_deducted = 1 WHERE operation_id = NEW.id;
    END IF;

    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (
      NEW.user_id,
      '✅ عملية ناجحة',
      'تمت عملية الشحن بنجاح — ' || COALESCE(NEW.card_type,'كارت') || ' لـ ' || COALESCE(NEW.phone_number,''),
      'operation_success', false, false
    );

    -- إشعار للتاجر (created_by)
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    SELECT m.created_by,
      '📊 عملية جديدة من عميلك',
      'عميل نفّذ عملية شحن ناجحة — ' || COALESCE(NEW.card_type,'كارت'),
      'merchant_operation', false, false
    FROM merchants m WHERE m.id = v_merchant_id AND m.created_by IS NOT NULL;
  END IF;

  IF NEW.status = 'failed' THEN
    INSERT INTO notifications (user_id, title, body, type, is_read, is_global)
    VALUES (
      NEW.user_id,
      '❌ فشلت العملية',
      'فشلت عملية الشحن — ' || COALESCE(NEW.error_message,'خطأ غير محدد') || '. لم يتم خصم أي نقطة.',
      'operation_failed', false, false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_ops_sync ON operations;
CREATE TRIGGER trg_merchant_ops_sync
  AFTER INSERT OR UPDATE OF status ON operations
  FOR EACH ROW EXECUTE FUNCTION operations_merchant_post_process();

-- ══════════════════════════════════════════════════════════════════
-- RPC: validate_merchant_charge_eligibility
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_merchant_charge_eligibility(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_merchant merchants%ROWTYPE;
  v_member   merchant_members%ROWTYPE;
  v_sub      subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND     THEN RETURN jsonb_build_object('eligible',false,'reason','user_not_found','stage','user'); END IF;
  IF NOT v_profile.is_active THEN RETURN jsonb_build_object('eligible',false,'reason','user_inactive','stage','user'); END IF;
  IF v_profile.merchant_id IS NULL THEN RETURN jsonb_build_object('eligible',false,'reason','not_merchant_client','stage','user'); END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = v_profile.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','merchant_not_found','stage','merchant'); END IF;
  IF v_merchant.status != 'active' THEN
    RETURN jsonb_build_object('eligible',false,'reason','merchant_'||v_merchant.status,
      'stage','merchant','merchant_name',v_merchant.name,'merchant_status',v_merchant.status);
  END IF;

  SELECT * INTO v_member FROM merchant_members
  WHERE merchant_id = v_profile.merchant_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','member_not_found','stage','member'); END IF;
  IF v_member.member_status NOT IN ('active','pending') THEN
    RETURN jsonb_build_object('eligible',false,'reason','member_'||v_member.member_status,'stage','member');
  END IF;

  SELECT * INTO v_sub FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'grace_period' THEN 2 WHEN 'trial' THEN 3 ELSE 4 END, created_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_sub.status NOT IN ('active','grace_period','trial') THEN
    RETURN jsonb_build_object('eligible',false,'reason','no_active_subscription','stage','subscription');
  END IF;

  IF v_sub.ops_remaining IS NOT NULL AND v_sub.ops_remaining <= 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason','ops_exhausted','stage','subscription',
      'ops_used',v_sub.ops_count,'ops_limit',v_sub.ops_limit);
  END IF;

  RETURN jsonb_build_object(
    'eligible',true,
    'merchant_id',v_merchant.id,'merchant_name',v_merchant.name,'merchant_status',v_merchant.status,
    'member_status',v_member.member_status,
    'sub_status',v_sub.status,
    'ops_remaining',v_sub.ops_remaining,'ops_limit',v_sub.ops_limit,'ops_count',v_sub.ops_count
  );
END;
$$;
GRANT EXECUTE ON FUNCTION validate_merchant_charge_eligibility(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: get_merchant_operations_history
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_merchant_operations_history(
  p_merchant_id UUID, p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0, p_status TEXT DEFAULT NULL, p_source TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows  JSONB;
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM merchant_operations
  WHERE merchant_id=p_merchant_id
    AND (p_status IS NULL OR status=p_status)
    AND (p_source IS NULL OR operation_source=p_source);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',mo.id,'user_id',mo.user_id,'operation_id',mo.operation_id,
      'operation_source',mo.operation_source,'card_name',mo.card_name,
      'price',mo.price,'phone_number',mo.phone_number,
      'status',mo.status,'failure_reason',mo.failure_reason,'failure_stage',mo.failure_stage,
      'points_deducted',mo.points_deducted,'correlation_id',mo.correlation_id,
      'executed_at',mo.executed_at,'completed_at',mo.completed_at,'duration_ms',mo.duration_ms,
      'username',p.username,'user_email',p.email
    ) ORDER BY mo.created_at DESC
  ) INTO v_rows
  FROM merchant_operations mo
  LEFT JOIN profiles p ON p.id=mo.user_id
  WHERE mo.merchant_id=p_merchant_id
    AND (p_status IS NULL OR mo.status=p_status)
    AND (p_source IS NULL OR mo.operation_source=p_source)
  LIMIT p_limit OFFSET p_offset;

  RETURN jsonb_build_object('success',true,'total',v_total,'rows',COALESCE(v_rows,'[]'::JSONB));
END;
$$;
GRANT EXECUTE ON FUNCTION get_merchant_operations_history(UUID,INTEGER,INTEGER,TEXT,TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: get_merchant_charge_stats
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_merchant_charge_stats(p_merchant_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT
    COUNT(*)                                           AS total_ops,
    COUNT(*) FILTER (WHERE status='success')           AS success_ops,
    COUNT(*) FILTER (WHERE status='failed')            AS failed_ops,
    COALESCE(SUM(points_deducted),0)                   AS points_used,
    MAX(executed_at)                                   AS last_op,
    MAX(executed_at) FILTER (WHERE status='success')   AS last_success,
    MAX(executed_at) FILTER (WHERE status='failed')    AS last_failure,
    COUNT(*) FILTER (WHERE operation_source='vodafone_cash')   AS vodafone_ops,
    COUNT(*) FILTER (WHERE operation_source='mobile_balance')  AS balance_ops
  INTO r FROM merchant_operations WHERE merchant_id = p_merchant_id;

  RETURN jsonb_build_object(
    'success',true,
    'total_ops',r.total_ops,'success_ops',r.success_ops,'failed_ops',r.failed_ops,
    'success_rate', CASE WHEN r.total_ops>0 THEN ROUND((r.success_ops::NUMERIC/r.total_ops)*100,1) ELSE 0 END,
    'points_used',r.points_used,
    'last_op',r.last_op,'last_success',r.last_success,'last_failure',r.last_failure,
    'vodafone_ops',r.vodafone_ops,'balance_ops',r.balance_ops
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_merchant_charge_stats(UUID) TO authenticated;
