-- Atualiza o cron de sync de torneios para chamar o Vercel ao invés do Supabase Edge Function
-- pg_cron + pg_net são extensões de banco e NÃO consomem quota de Edge Functions

SELECT cron.unschedule('sync-tournament-scores');

SELECT cron.schedule(
  'sync-tournament-scores',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://backofficepixbingobr.vercel.app/api/sync-tournament-scores',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
