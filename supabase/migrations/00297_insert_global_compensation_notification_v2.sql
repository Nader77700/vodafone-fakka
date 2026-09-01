-- إدراج إشعار global للتعويض بـ type='offer'
INSERT INTO public.notifications (
  title, body, type, priority, is_global, action_url, created_at
) VALUES (
  '🎁 هدية خاصة من Vodafone Fakka Premium',
  'تم تفعيل اشتراك مجاني لمدة 48 ساعة لك! افتح التطبيق الآن واستمتع بجميع الخدمات بدون حدود 🚀✨',
  'offer',
  'important',
  true,
  '/home',
  now()
) RETURNING id;