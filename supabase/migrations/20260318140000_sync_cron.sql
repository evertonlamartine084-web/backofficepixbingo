-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule tournament score sync every 2 minutes
SELECT cron.schedule(
  'sync-tournament-scores',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nehmmvtpagncmldivnxn.supabase.co/functions/v1/sync-tournament-scores',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    )
  );
  $$
);
