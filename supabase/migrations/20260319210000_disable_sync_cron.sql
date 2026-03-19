-- Disable sync cron to stop burning edge function invocations (quota exceeded)
-- Re-enable after upgrading plan or when billing cycle resets (Apr 13)
SELECT cron.unschedule('sync-tournament-scores');
