
-- P9: جدول إعدادات التطبيق العامة (key-value)
create table if not exists app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- سياسة القراءة للجميع
alter table app_settings enable row level security;

create policy "app_settings_read_all"
  on app_settings for select
  using (true);

create policy "app_settings_write_admin"
  on app_settings for all
  using (auth.role() = 'service_role');

-- قيمة افتراضية للون hero_accent
insert into app_settings (key, value)
values ('hero_accent_color', '#E60000')
on conflict (key) do nothing;
