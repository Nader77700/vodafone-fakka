
-- إصلاح تطابق used_count مع العدد الفعلي للمشتركين
UPDATE license_keys lk
SET used_count = (
  SELECT COUNT(*) FROM subscriptions s WHERE s.license_key_id = lk.id
)
WHERE lk.id IN (
  '46b6fb1e-c6aa-407e-9669-6b0bbf808b84',
  '1db5db28-f010-4bad-99d3-3c9742742704'
);
