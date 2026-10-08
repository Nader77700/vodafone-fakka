ALTER TABLE vip_red_monitored_lines 
  ALTER COLUMN next_check_at SET DEFAULT now(); CREATE OR REPLACE FUNCTION set_vip_red_initial_check() RETURNS trigger AS $$
BEGIN
  -- أي رقم يتم إضافته جديداً ولم يُفحص بعد، يكون موعد فحصه فوراً (الآن)
  IF NEW.last_checked_at IS NULL THEN
    NEW.next_check_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql; DROP TRIGGER IF EXISTS trg_vip_red_initial_check ON vip_red_monitored_lines; CREATE TRIGGER trg_vip_red_initial_check
  BEFORE INSERT
  ON vip_red_monitored_lines
  FOR EACH ROW
  EXECUTE PROCEDURE set_vip_red_initial_check();