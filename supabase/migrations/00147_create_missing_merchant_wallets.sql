
-- إنشاء محافظ لجميع التجار الذين ليس لهم محفظة بعد
INSERT INTO merchant_wallets (merchant_id, current_points, used_points, lifetime_purchased, created_at, updated_at)
SELECT m.id, 0, 0, 0, now(), now()
FROM merchants m
LEFT JOIN merchant_wallets mw ON mw.merchant_id = m.id
WHERE mw.id IS NULL;
