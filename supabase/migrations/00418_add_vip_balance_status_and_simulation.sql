ALTER TABLE vip_sessions 
ADD COLUMN IF NOT EXISTS owner_balance_status TEXT DEFAULT 'confirmed',
ADD COLUMN IF NOT EXISTS individual_balance_status TEXT DEFAULT 'confirmed',
ADD COLUMN IF NOT EXISTS is_simulation_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS simulation_scenario TEXT DEFAULT NULL;

ALTER TABLE vip_cycle_history
ADD COLUMN IF NOT EXISTS error_category TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS failure_timestamp TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_api_response_summary TEXT DEFAULT NULL;
