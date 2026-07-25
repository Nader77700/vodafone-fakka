
CREATE OR REPLACE FUNCTION get_global_code_stats()
RETURNS TABLE(
  total_codes        bigint,
  active_codes       bigint,
  used_codes         bigint,
  expired_codes      bigint,
  disabled_codes     bigint,
  closed_codes       bigint,
  trial_codes        bigint,
  paid_codes         bigint,
  gift_codes         bigint,
  total_linked_users bigint,
  total_renewals     bigint
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COUNT(*)                                                     AS total_codes,
    COUNT(*) FILTER (WHERE status = 'active')                    AS active_codes,
    COUNT(*) FILTER (WHERE status = 'used')                      AS used_codes,
    COUNT(*) FILTER (WHERE status = 'expired')                   AS expired_codes,
    COUNT(*) FILTER (WHERE status = 'disabled')                  AS disabled_codes,
    COUNT(*) FILTER (WHERE status = 'closed')                    AS closed_codes,
    COUNT(*) FILTER (WHERE code_type = 'trial')                  AS trial_codes,
    COUNT(*) FILTER (WHERE code_type = 'paid')                   AS paid_codes,
    COUNT(*) FILTER (WHERE code_type = 'gift')                   AS gift_codes,
    COUNT(DISTINCT used_by)                                      AS total_linked_users,
    (SELECT COUNT(*) FROM subscription_history)                  AS total_renewals
  FROM license_keys;
$$;

GRANT EXECUTE ON FUNCTION get_global_code_stats() TO authenticated;
