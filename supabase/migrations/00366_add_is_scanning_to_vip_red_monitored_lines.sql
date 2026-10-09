ALTER TABLE vip_red_monitored_lines 
ADD COLUMN IF NOT EXISTS is_scanning boolean DEFAULT false;

-- Reset any stuck scanning state
UPDATE vip_red_monitored_lines SET is_scanning = false WHERE is_scanning IS TRUE;