
INSERT INTO public.services_control (id, name, visible, status, access_mode, maintenance_message, display_order)
VALUES (
  'vodafone-offers',
  'عروض واشتراكات فودافون',
  true,
  'active',
  'subscribers_only',
  null,
  6
)
ON CONFLICT (id) DO NOTHING;
