-- Cron para sincronizar progresso de missões automaticamente
-- Chama o endpoint da Vercel a cada 5 minutos via pg_cron + pg_net
-- IMPORTANTE: Configure CRON_SECRET como env var na Vercel com o mesmo valor usado aqui

-- Desabilitar cron antigo de torneios se existir (ignora erro se não existir)
DO $$ BEGIN PERFORM cron.unschedule('sync-tournament-scores'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync-mission-progress'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Sync de missões a cada 5 minutos
SELECT cron.schedule(
  'sync-mission-progress',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://backofficepixbingobr.vercel.app/api/sync-mission-progress',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "x-cron-secret": "pixbingo-cron-2024-secret"}'::jsonb
  );
  $$
);

-- Sync de torneios a cada 5 minutos
SELECT cron.schedule(
  'sync-tournament-scores',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://backofficepixbingobr.vercel.app/api/sync-tournament-scores',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "x-cron-secret": "pixbingo-cron-2024-secret"}'::jsonb
  );
  $$
);
