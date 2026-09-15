
-- تنظيف التكرار (id هو uuid, نستخدم ctid)
DELETE FROM device_gift_activations a
USING device_gift_activations b
WHERE a.user_id = b.user_id
  AND a.code = b.code
  AND a.activated_at < b.activated_at;

-- إضافة UNIQUE constraint
ALTER TABLE device_gift_activations
ADD CONSTRAINT uq_device_gift_user_code UNIQUE (user_id, code);

-- index لتسريع فحص الجهاز
CREATE INDEX IF NOT EXISTS idx_dga_device_fp
ON device_gift_activations (device_fp)
WHERE device_fp IS NOT NULL;
