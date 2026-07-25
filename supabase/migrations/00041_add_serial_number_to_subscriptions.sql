-- إضافة رقم اشتراك واضح للمستخدم بدلاً من UUID
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS serial_number TEXT UNIQUE;

-- دالة توليد رقم الاشتراك التلقائي: VF-YYYY-XXXXXX
CREATE OR REPLACE FUNCTION generate_sub_serial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  yr    TEXT := TO_CHAR(NOW(), 'YYYY');
  seq   BIGINT;
  snum  TEXT;
BEGIN
  -- عداد تسلسلي لهذا العام من عدد الصفوف الموجودة
  SELECT COUNT(*) + 1 INTO seq FROM subscriptions WHERE serial_number IS NOT NULL;
  snum := 'VF-' || yr || '-' || LPAD(seq::TEXT, 6, '0');
  -- تجنب التكرار
  WHILE EXISTS (SELECT 1 FROM subscriptions WHERE serial_number = snum) LOOP
    seq := seq + 1;
    snum := 'VF-' || yr || '-' || LPAD(seq::TEXT, 6, '0');
  END LOOP;
  NEW.serial_number := snum;
  RETURN NEW;
END;
$$;

-- Trigger: يُشغَّل فقط إذا كان serial_number فارغاً
CREATE OR REPLACE TRIGGER trg_sub_serial
BEFORE INSERT ON subscriptions
FOR EACH ROW
WHEN (NEW.serial_number IS NULL)
EXECUTE FUNCTION generate_sub_serial();

-- عمود serial_number للصفوف الموجودة (backfill)
DO $$
DECLARE
  r RECORD;
  yr TEXT;
  seq BIGINT := 1;
  snum TEXT;
BEGIN
  FOR r IN SELECT id FROM subscriptions WHERE serial_number IS NULL ORDER BY created_at ASC LOOP
    yr := TO_CHAR(NOW(), 'YYYY');
    snum := 'VF-' || yr || '-' || LPAD(seq::TEXT, 6, '0');
    WHILE EXISTS (SELECT 1 FROM subscriptions WHERE serial_number = snum AND id <> r.id) LOOP
      seq := seq + 1;
      snum := 'VF-' || yr || '-' || LPAD(seq::TEXT, 6, '0');
    END LOOP;
    UPDATE subscriptions SET serial_number = snum WHERE id = r.id;
    seq := seq + 1;
  END LOOP;
END;
$$;