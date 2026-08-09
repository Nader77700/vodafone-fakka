-- جدول metadata الاستعلامات (بدون PIN أو tokens)
CREATE TABLE IF NOT EXISTS public.vcc_wallet_queries (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  msisdn          text,
  action          text NOT NULL CHECK (action IN ('balance','transactions')),
  status          text NOT NULL DEFAULT 'success',
  tx_count        integer,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.vcc_wallet_queries ENABLE ROW LEVEL SECURITY;

-- كل مستخدم يرى سجلاته فقط
CREATE POLICY "user_read_own" ON public.vcc_wallet_queries
  FOR SELECT USING (auth.uid() = user_id);

-- الإدمن يرى الكل
CREATE POLICY "admin_read_all" ON public.vcc_wallet_queries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','super_admin')
    )
  );

-- Insert يتم عبر Service Role فقط (Edge Function)
CREATE POLICY "service_insert" ON public.vcc_wallet_queries
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_vcc_wallet_queries_user ON public.vcc_wallet_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wallet_queries_action ON public.vcc_wallet_queries(action);
CREATE INDEX IF NOT EXISTS idx_vcc_wallet_queries_created ON public.vcc_wallet_queries(created_at DESC);
