CREATE OR REPLACE FUNCTION get_admin_chart_data_v2(p_period text)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  IF p_period = 'daily' THEN
    SELECT json_agg(t) INTO v_result
    FROM (
      SELECT 
        to_char(d.date, 'Day') as label,
        COALESCE(COUNT(o.id), 0) as operations,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'success'::operation_status), 0) as revenue,
        COALESCE(COUNT(DISTINCT p.id), 0) as new_users
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval) d(date)
      LEFT JOIN operations o ON date_trunc('day', o.performed_at AT TIME ZONE 'UTC') = d.date
      LEFT JOIN profiles p ON date_trunc('day', p.created_at AT TIME ZONE 'UTC') = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    ) t;

  ELSIF p_period = 'weekly' THEN
    SELECT json_agg(t) INTO v_result
    FROM (
      SELECT 
        'أسبوع ' || row_number() over() as label,
        COALESCE(COUNT(o.id), 0) as operations,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'success'::operation_status), 0) as revenue,
        COALESCE(COUNT(DISTINCT p.id), 0) as new_users
      FROM generate_series(date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks'), date_trunc('week', CURRENT_DATE), '1 week'::interval) d(date)
      LEFT JOIN operations o ON date_trunc('week', o.performed_at AT TIME ZONE 'UTC') = d.date
      LEFT JOIN profiles p ON date_trunc('week', p.created_at AT TIME ZONE 'UTC') = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    ) t;

  ELSIF p_period = 'monthly' THEN
    SELECT json_agg(t) INTO v_result
    FROM (
      SELECT 
        to_char(d.date, 'Mon') as label,
        COALESCE(COUNT(o.id), 0) as operations,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'success'::operation_status), 0) as revenue,
        COALESCE(COUNT(DISTINCT p.id), 0) as new_users
      FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '11 months'), date_trunc('month', CURRENT_DATE), '1 month'::interval) d(date)
      LEFT JOIN operations o ON date_trunc('month', o.performed_at AT TIME ZONE 'UTC') = d.date
      LEFT JOIN profiles p ON date_trunc('month', p.created_at AT TIME ZONE 'UTC') = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    ) t;

  ELSE -- yearly
    SELECT json_agg(t) INTO v_result
    FROM (
      SELECT 
        to_char(d.date, 'YYYY') as label,
        COALESCE(COUNT(o.id), 0) as operations,
        COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'success'::operation_status), 0) as revenue,
        COALESCE(COUNT(DISTINCT p.id), 0) as new_users
      FROM generate_series(date_trunc('year', CURRENT_DATE - INTERVAL '4 years'), date_trunc('year', CURRENT_DATE), '1 year'::interval) d(date)
      LEFT JOIN operations o ON date_trunc('year', o.performed_at AT TIME ZONE 'UTC') = d.date
      LEFT JOIN profiles p ON date_trunc('year', p.created_at AT TIME ZONE 'UTC') = d.date
      GROUP BY d.date
      ORDER BY d.date ASC
    ) t;
  END IF;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;