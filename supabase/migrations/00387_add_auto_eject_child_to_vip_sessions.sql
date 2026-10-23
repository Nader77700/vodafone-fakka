ALTER TABLE public.vip_sessions 
ADD COLUMN IF NOT EXISTS auto_eject_child_on_complete boolean DEFAULT false;

COMMENT ON COLUMN public.vip_sessions.auto_eject_child_on_complete IS 'Whether to automatically trigger smart child ejection and MINION protocol when the VIP cycle sequence completes';
