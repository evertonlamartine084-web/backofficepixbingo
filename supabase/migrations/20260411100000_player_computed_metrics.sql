-- Player computed metrics table
-- Stores daily-computed behavioral metrics per player for smart segmentation

CREATE TABLE IF NOT EXISTS player_computed_metrics (
  cpf TEXT PRIMARY KEY,

  -- Game preferences
  favorite_game TEXT,                    -- most played game (by bet volume)
  favorite_game_category TEXT,           -- casino, keno, sport, etc.

  -- Betting metrics (rolling windows)
  total_bet_7d NUMERIC(14,2) DEFAULT 0,   -- total bet last 7 days
  total_bet_30d NUMERIC(14,2) DEFAULT 0,  -- total bet last 30 days
  bet_count_7d INTEGER DEFAULT 0,          -- number of bets last 7 days
  bet_count_30d INTEGER DEFAULT 0,         -- number of bets last 30 days
  avg_bet_value NUMERIC(14,2) DEFAULT 0,   -- average bet value (30d)

  -- Deposit metrics
  total_deposit_7d NUMERIC(14,2) DEFAULT 0,
  total_deposit_30d NUMERIC(14,2) DEFAULT 0,
  deposit_count_7d INTEGER DEFAULT 0,
  deposit_count_30d INTEGER DEFAULT 0,
  last_deposit_date TIMESTAMPTZ,

  -- Activity / engagement
  days_since_last_bet INTEGER,
  days_since_last_deposit INTEGER,
  days_since_last_login INTEGER,
  active_days_7d INTEGER DEFAULT 0,       -- days with activity in last 7d
  active_days_30d INTEGER DEFAULT 0,      -- days with activity in last 30d

  -- Engagement score (0-100)
  engagement_score INTEGER DEFAULT 0,

  -- Churn risk (0-100, higher = more likely to churn)
  churn_risk INTEGER DEFAULT 0,

  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for segment queries on common fields
CREATE INDEX IF NOT EXISTS idx_pcm_engagement ON player_computed_metrics (engagement_score);
CREATE INDEX IF NOT EXISTS idx_pcm_churn ON player_computed_metrics (churn_risk);
CREATE INDEX IF NOT EXISTS idx_pcm_favorite_game ON player_computed_metrics (favorite_game);
CREATE INDEX IF NOT EXISTS idx_pcm_total_bet_7d ON player_computed_metrics (total_bet_7d);
CREATE INDEX IF NOT EXISTS idx_pcm_days_since_last_bet ON player_computed_metrics (days_since_last_bet);

-- RLS
ALTER TABLE player_computed_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON player_computed_metrics
  FOR ALL USING (true) WITH CHECK (true);

-- Schedule cron to compute metrics daily at 04:00 UTC (01:00 BRT)
SELECT cron.schedule(
  'compute-player-metrics',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://backofficepixbingobr.vercel.app/api/cron/compute-metrics',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "x-cron-secret": "pixbingo-cron-2024-secret"}'::jsonb
  );
  $$
);
