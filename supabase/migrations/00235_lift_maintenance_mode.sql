UPDATE app_config 
SET value = 'false', updated_at = now() 
WHERE key = 'ff_maintenance_mode';