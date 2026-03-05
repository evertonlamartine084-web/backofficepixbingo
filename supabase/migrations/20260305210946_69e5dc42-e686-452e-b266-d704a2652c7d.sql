CREATE OR REPLACE FUNCTION public.notify_campaign_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _url text := 'https://urxbuiuwasvxwxuythzc.supabase.co/functions/v1/auto-process-campaigns';
  _key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyeGJ1aXV3YXN2eHd4dXl0aHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzMwODUsImV4cCI6MjA4ODE0OTA4NX0.N75_3i7dgrjM7GMXOJuXTSGzjbnNdQIx1QhR-AAtBBc';
BEGIN
  IF NEW.status = 'ATIVA' AND (OLD.status IS NULL OR OLD.status != 'ATIVA') THEN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      body := jsonb_build_object('campaign_id', NEW.id, 'trigger', 'activation')
    );
  END IF;
  RETURN NEW;
END;
$$;