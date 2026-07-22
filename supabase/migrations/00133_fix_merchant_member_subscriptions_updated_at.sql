
-- إضافة عمود updated_at المفقود في merchant_member_subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchant_member_subscriptions'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE merchant_member_subscriptions
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

    -- تحديث القيم الموجودة
    UPDATE merchant_member_subscriptions
      SET updated_at = COALESCE(created_at, now());

    -- trigger لتحديث updated_at تلقائياً
    CREATE OR REPLACE FUNCTION set_merchant_member_sub_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_merchant_member_sub_updated_at ON merchant_member_subscriptions;
    CREATE TRIGGER trg_merchant_member_sub_updated_at
      BEFORE UPDATE ON merchant_member_subscriptions
      FOR EACH ROW EXECUTE FUNCTION set_merchant_member_sub_updated_at();
  END IF;
END;
$$;
