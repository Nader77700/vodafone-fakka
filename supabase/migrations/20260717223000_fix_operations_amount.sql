-- Fix the amount and card_type for operations where amount is 0
UPDATE operations 
SET 
  amount = pc.price,
  card_type = pc.display_name
FROM product_config pc 
WHERE operations.card_type = pc.product_id 
  AND operations.amount = 0;
