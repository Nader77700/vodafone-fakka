-- P3 FIX: دالة زيادة used_count بشكل Atomic لمنع Race Condition
-- تستخدم UPDATE مباشرة في SQL بدلاً من read-then-write في JavaScript
CREATE OR REPLACE FUNCTION increment_key_used_count(p_key_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE license_keys
  SET used_count = used_count + 1
  WHERE id = p_key_id;
$$;