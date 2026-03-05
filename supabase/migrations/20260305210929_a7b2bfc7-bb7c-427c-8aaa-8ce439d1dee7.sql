CREATE OR REPLACE FUNCTION public.notify_campaign_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'ATIVA' AND (OLD.status IS NULL OR OLD.status != 'ATIVA') THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/auto-process-campaigns',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true)
      ),
      body := jsonb_build_object('campaign_id', NEW.id, 'trigger', 'activation')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_campaign_activated
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_campaign_activated();