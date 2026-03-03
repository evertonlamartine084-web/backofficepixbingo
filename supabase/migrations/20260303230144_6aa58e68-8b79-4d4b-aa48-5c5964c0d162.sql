
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TYPE public.app_role AS ENUM ('admin', 'operador', 'visualizador');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'operador',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bearer',
  value_encrypted TEXT NOT NULL,
  value_masked TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read credentials" ON public.credentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage credentials" ON public.credentials FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON public.credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL,
  headers JSONB DEFAULT '{}',
  cookies JSONB DEFAULT '{}',
  auth_type TEXT NOT NULL DEFAULT 'none',
  credential_id UUID REFERENCES public.credentials(id) ON DELETE SET NULL,
  body_template TEXT,
  query_params JSONB DEFAULT '{}',
  timeout_ms INT NOT NULL DEFAULT 10000,
  retry_max INT NOT NULL DEFAULT 3,
  retry_codes JSONB DEFAULT '[429, 500, 502, 503]',
  retry_backoff_ms INT NOT NULL DEFAULT 1000,
  rate_limit_rps INT NOT NULL DEFAULT 5,
  rate_limit_concurrency INT NOT NULL DEFAULT 3,
  response_mapping JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read endpoints" ON public.endpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage endpoints" ON public.endpoints FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  steps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read flows" ON public.flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage flows" ON public.flows FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  flow_id UUID REFERENCES public.flows(id) ON DELETE SET NULL,
  flow_name TEXT,
  total_items INT NOT NULL DEFAULT 0,
  processed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  bonus_valor NUMERIC NOT NULL DEFAULT 0,
  stats JSONB NOT NULL DEFAULT '{"pendente":0,"processando":0,"sem_bonus":0,"bonus_1x":0,"bonus_2x_plus":0,"erro":0}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read batches" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators and admins can manage batches" ON public.batches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador'));
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE NOT NULL,
  cpf TEXT NOT NULL,
  cpf_masked TEXT NOT NULL,
  uuid TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  tentativas INT NOT NULL DEFAULT 0,
  qtd_bonus INT NOT NULL DEFAULT 0,
  datas_bonus JSONB DEFAULT '[]',
  ultima_data_bonus TEXT,
  log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read batch_items" ON public.batch_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators and admins can manage batch_items" ON public.batch_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador'));
CREATE TRIGGER update_batch_items_updated_at BEFORE UPDATE ON public.batch_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_batch_items_batch_id ON public.batch_items(batch_id);
CREATE INDEX idx_batch_items_status ON public.batch_items(status);

CREATE TABLE public.bonus_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_item_id UUID REFERENCES public.batch_items(id) ON DELETE CASCADE NOT NULL,
  qtd_bonus INT NOT NULL DEFAULT 0,
  datas_bonus JSONB DEFAULT '[]',
  ultima_data_bonus TEXT,
  raw_matches JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bonus_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bonus_audit" ON public.bonus_audit FOR SELECT TO authenticated USING (true);

CREATE TABLE public.external_requests_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_item_id UUID REFERENCES public.batch_items(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES public.endpoints(id) ON DELETE SET NULL,
  method TEXT,
  url TEXT,
  status_code INT,
  duration_ms INT,
  error TEXT,
  request_hash TEXT,
  response_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.external_requests_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read external_requests_log" ON public.external_requests_log FOR SELECT TO authenticated USING (true);

CREATE TABLE public.bonus_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  field_candidates JSONB DEFAULT '[]',
  keywords JSONB DEFAULT '[]',
  valor_fixo NUMERIC,
  valor_positivo BOOLEAN DEFAULT true,
  date_fields JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bonus_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bonus_rules" ON public.bonus_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage bonus_rules" ON public.bonus_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.endpoints (name, description, method, url, headers, auth_type, timeout_ms, retry_max, retry_codes, retry_backoff_ms, rate_limit_rps, rate_limit_concurrency, response_mapping)
VALUES ('Consultar Transações', 'Busca transações de um usuário por UUID', 'GET', 'https://pixbingobr.com/usuarios/transacoes?id={{uuid}}', '{"Accept":"application/json"}', 'bearer', 10000, 3, '[429,500,502,503]', 1000, 5, 3, '{"transactions":"$.data.transactions"}');

INSERT INTO public.bonus_rules (name, field_candidates, keywords, valor_fixo, valor_positivo, date_fields, active)
VALUES ('Regra Padrão PixBingoBR', '["tipo","type","descricao","description"]', '["bonus","bônus","credito","crédito"]', 10, true, '["created_at","data_criacao","timestamp"]', true);
