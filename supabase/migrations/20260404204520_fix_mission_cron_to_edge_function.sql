-- Fix cron jobs to call Supabase Edge Functions instead of Vercel
-- Edge functions have verify_jwt=false so anon key is sufficient

-- Remove old cron jobs
DO $$ BEGIN PERFORM cron.unschedule('sync-mission-progress'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync-tournament-scores'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Sync mission progress every 2 minutes via Edge Function
SELECT cron.schedule(
  'sync-mission-progress',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nehmmvtpagncmldivnxn.supabase.co/functions/v1/sync-mission-progress',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laG1tdnRwYWduY21sZGl2bnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDY2MzAsImV4cCI6MjA4ODk4MjYzMH0.EbJy20XAQgF252zSEBoaBOBHrVqP15F639RqQY5YQ8U',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laG1tdnRwYWduY21sZGl2bnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDY2MzAsImV4cCI6MjA4ODk4MjYzMH0.EbJy20XAQgF252zSEBoaBOBHrVqP15F639RqQY5YQ8U'
    )
  );
  $$
);

-- Sync tournament scores every 2 minutes via Edge Function
SELECT cron.schedule(
  'sync-tournament-scores',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nehmmvtpagncmldivnxn.supabase.co/functions/v1/sync-tournament-scores',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laG1tdnRwYWduY21sZGl2bnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDY2MzAsImV4cCI6MjA4ODk4MjYzMH0.EbJy20XAQgF252zSEBoaBOBHrVqP15F639RqQY5YQ8U',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5laG1tdnRwYWduY21sZGl2bnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDY2MzAsImV4cCI6MjA4ODk4MjYzMH0.EbJy20XAQgF252zSEBoaBOBHrVqP15F639RqQY5YQ8U'
    )
  );
  $$
);
