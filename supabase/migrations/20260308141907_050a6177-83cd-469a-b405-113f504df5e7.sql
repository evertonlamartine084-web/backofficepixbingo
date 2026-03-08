
CREATE TABLE public.popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  image_url text,
  button_text text DEFAULT 'OK',
  button_url text,
  segment_id uuid REFERENCES public.segments(id) ON DELETE SET NULL,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone NOT NULL,
  active boolean NOT NULL DEFAULT false,
  style jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read popups" ON public.popups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert popups" ON public.popups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update popups" ON public.popups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete popups" ON public.popups FOR DELETE TO authenticated USING (true);

-- Public read for edge function (anon)
CREATE POLICY "Anon can read active popups" ON public.popups FOR SELECT TO anon USING (active = true AND now() BETWEEN start_date AND end_date);

CREATE TRIGGER update_popups_updated_at BEFORE UPDATE ON public.popups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
