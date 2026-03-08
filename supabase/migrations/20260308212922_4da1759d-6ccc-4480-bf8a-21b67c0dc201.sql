
-- Inbox messages table
CREATE TABLE public.inbox_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  button_text TEXT DEFAULT 'Ver',
  button_url TEXT,
  segment_id UUID REFERENCES public.segments(id),
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read inbox_messages" ON public.inbox_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert inbox_messages" ON public.inbox_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update inbox_messages" ON public.inbox_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete inbox_messages" ON public.inbox_messages FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read active inbox_messages" ON public.inbox_messages FOR SELECT TO anon USING (active = true AND now() >= start_date AND now() <= end_date);

-- Push notifications table
CREATE TABLE public.push_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  icon_url TEXT,
  action_url TEXT,
  segment_id UUID REFERENCES public.segments(id),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read push_notifications" ON public.push_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert push_notifications" ON public.push_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update push_notifications" ON public.push_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete push_notifications" ON public.push_notifications FOR DELETE TO authenticated USING (true);

-- Player levels table
CREATE TABLE public.player_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  min_xp INTEGER NOT NULL DEFAULT 0,
  icon_url TEXT,
  color TEXT DEFAULT '#6366f1',
  rewards_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read player_levels" ON public.player_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert player_levels" ON public.player_levels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update player_levels" ON public.player_levels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete player_levels" ON public.player_levels FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read player_levels" ON public.player_levels FOR SELECT TO anon USING (true);

-- Store items table
CREATE TABLE public.store_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  price_coins INTEGER NOT NULL DEFAULT 0,
  price_xp INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'geral',
  stock INTEGER,
  min_level INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read store_items" ON public.store_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert store_items" ON public.store_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update store_items" ON public.store_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete store_items" ON public.store_items FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read active store_items" ON public.store_items FOR SELECT TO anon USING (active = true);

-- Updated_at triggers
CREATE TRIGGER update_inbox_messages_updated_at BEFORE UPDATE ON public.inbox_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_push_notifications_updated_at BEFORE UPDATE ON public.push_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_player_levels_updated_at BEFORE UPDATE ON public.player_levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_store_items_updated_at BEFORE UPDATE ON public.store_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
