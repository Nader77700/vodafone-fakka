ALTER TABLE public.vip_bridge_config 
  ENABLE ROW LEVEL SECURITY; ALTER TABLE public.vip_default_credentials 
  ENABLE ROW LEVEL SECURITY; ALTER TABLE public.vip_bot_scripts 
  ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS Allow all access to vip_bridge_config ON public.vip_bridge_config; DROP POLICY IF EXISTS Allow all access to vip_bot_scripts ON public.vip_bot_scripts; DROP POLICY IF EXISTS vip_default_credentials_access ON public.vip_default_credentials; CREATE POLICY vip_bridge_config_owner_only
  ON public.vip_bridge_config
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    is_vip_owner()
  )
  WITH CHECK (
    is_vip_owner()
  ); CREATE POLICY vip_bot_scripts_owner_only
  ON public.vip_bot_scripts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    is_vip_owner()
  )
  WITH CHECK (
    is_vip_owner()
  ); CREATE POLICY vip_default_credentials_owner_only
  ON public.vip_default_credentials
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    is_vip_owner()
  )
  WITH CHECK (
    is_vip_owner()
  );