
ALTER TABLE public.campaigns ADD COLUMN popup_id uuid REFERENCES public.popups(id) ON DELETE SET NULL DEFAULT NULL;
