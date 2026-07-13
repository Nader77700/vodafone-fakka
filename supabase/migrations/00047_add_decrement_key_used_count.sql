CREATE OR REPLACE FUNCTION decrement_key_used_count(p_key_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE license_keys
  SET used_count = GREATEST(0, used_count - 1),
      updated_at = NOW()
  WHERE id = p_key_id;
END;
$$;