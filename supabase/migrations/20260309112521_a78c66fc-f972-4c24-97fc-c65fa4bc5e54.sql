
CREATE TABLE public.popup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_id uuid NOT NULL REFERENCES public.popups(id) ON DELETE CASCADE,
  cpf text NOT NULL,
  cpf_masked text NOT NULL,
  event_type text NOT NULL DEFAULT 'view',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_popup_events_popup_id ON public.popup_events(popup_id);
CREATE INDEX idx_popup_events_cpf ON public.popup_events(cpf);
CREATE INDEX idx_popup_events_event_type ON public.popup_events(event_type);

-- Unique constraint: one view and one click per cpf per popup
CREATE UNIQUE INDEX idx_popup_events_unique ON public.popup_events(popup_id, cpf, event_type);

ALTER TABLE public.popup_events ENABLE ROW LEVEL SECURITY;

-- Authenticated can read all
CREATE POLICY "Authenticated can read popup_events" ON public.popup_events FOR SELECT TO authenticated USING (true);

-- Anon can insert (from GTM script)
CREATE POLICY "Anon can insert popup_events" ON public.popup_events FOR INSERT TO anon WITH CHECK (true);

-- Service role handles everything else implicitly
