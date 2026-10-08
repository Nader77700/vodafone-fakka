ALTER TABLE vip_red_monitored_lines 
  ADD COLUMN IF NOT EXISTS next_check_at timestamp with time zone;