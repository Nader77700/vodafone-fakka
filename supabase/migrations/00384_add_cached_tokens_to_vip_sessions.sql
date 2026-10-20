ALTER TABLE vip_sessions
  ADD COLUMN IF NOT EXISTS cached_owner_token text,
  ADD COLUMN IF NOT EXISTS cached_child_token text,
  ADD COLUMN IF NOT EXISTS cached_owner_cookie text,
  ADD COLUMN IF NOT EXISTS cached_child_cookie text;
