
-- Segments table
CREATE TABLE public.segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read segments" ON public.segments FOR SELECT USING (true);
CREATE POLICY "Anyone can insert segments" ON public.segments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update segments" ON public.segments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete segments" ON public.segments FOR DELETE USING (true);

-- Segment items table (CPFs in each segment)
CREATE TABLE public.segment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  cpf TEXT NOT NULL,
  cpf_masked TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(segment_id, cpf)
);

ALTER TABLE public.segment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read segment_items" ON public.segment_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert segment_items" ON public.segment_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update segment_items" ON public.segment_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete segment_items" ON public.segment_items FOR DELETE USING (true);
