-- Reschedule sync cron from every 2 min to every 10 min to avoid DB connection saturation
SELECT cron.unschedule('sync-tournament-scores');

SELECT cron.schedule(
  'sync-tournament-scores',
  '*/10 * * * *',
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
