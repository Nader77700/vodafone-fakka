CREATE OR REPLACE FUNCTION get_operations_stats_v2(
  filter_user_id UUID DEFAULT NULL,
  filter_phone TEXT DEFAULT NULL,
  filter_card_type TEXT DEFAULT NULL,
  filter_status TEXT DEFAULT NULL,
  filter_date_from TIMESTAMPTZ DEFAULT NULL,
  filter_date_to TIMESTAMPTZ DEFAULT NULL,
  filter_operation_source TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  success_count BIGINT,
  failed_count BIGINT,
  total_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'::operation_status),
    COUNT(*) FILTER (WHERE status = 'failed'::operation_status),
    COALESCE(SUM(amount) FILTER (WHERE status = 'success'::operation_status), 0)
  FROM operations
  WHERE 
    (filter_user_id IS NULL OR user_id = filter_user_id) AND
    (filter_phone IS NULL OR phone_number ILIKE '%' || filter_phone || '%') AND
    (filter_card_type IS NULL OR card_type ILIKE '%' || filter_card_type || '%') AND
    (filter_status IS NULL OR status = filter_status::operation_status) AND
    (filter_date_from IS NULL OR performed_at >= filter_date_from) AND
    (filter_date_to IS NULL OR performed_at <= filter_date_to) AND
    (filter_operation_source IS NULL OR operation_source = filter_operation_source);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;