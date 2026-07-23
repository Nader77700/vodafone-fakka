-- Insert the missing gift_claims record to resolve the mismatched_used_count
INSERT INTO gift_claims (
  user_id,
  license_key_id,
  code_snapshot,
  status,
  claimed_at
)
SELECT 
  sh.user_id,
  sh.license_key_id,
  sh.code,
  'claimed',
  sh.activated_at
FROM subscription_history sh
WHERE sh.license_key_id = '7e5afc24-4418-45ae-b61c-c19523d842a9'
  AND NOT EXISTS (
    SELECT 1 FROM gift_claims gc 
    WHERE gc.license_key_id = '7e5afc24-4418-45ae-b61c-c19523d842a9'
  );