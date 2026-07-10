
ALTER TYPE license_key_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE license_key_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS max_hours      integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS linked_user_id uuid    REFERENCES profiles(id) ON DELETE SET NULL;
