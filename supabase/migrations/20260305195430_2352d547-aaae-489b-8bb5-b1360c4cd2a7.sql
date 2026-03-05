
CREATE TABLE public.campaign_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  cpf TEXT NOT NULL,
  cpf_masked TEXT NOT NULL,
  uuid TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  total_value NUMERIC NOT NULL DEFAULT 0,
  prize_credited BOOLEAN NOT NULL DEFAULT false,
  credit_result TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, cpf)
);

ALTER TABLE public.campaign_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read campaign_participants" ON public.campaign_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert campaign_participants" ON public.campaign_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update campaign_participants" ON public.campaign_participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete campaign_participants" ON public.campaign_participants FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_campaign_participants_updated_at BEFORE UPDATE ON public.campaign_participants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_participants;
