-- Platform config for automated sync (tournament scores, etc.)
CREATE TABLE IF NOT EXISTS public.platform_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_url TEXT NOT NULL DEFAULT 'https://pixbingobr.concurso.club',
  login_url TEXT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_config_auth" ON public.platform_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
