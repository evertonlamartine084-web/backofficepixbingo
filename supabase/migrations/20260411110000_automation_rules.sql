-- Automation Rules engine
-- "When condition X, do action Y" — inspired by Smartico's Automation Rules

-- Lifecycle stages for players
CREATE TABLE IF NOT EXISTS player_lifecycle (
  cpf TEXT PRIMARY KEY,
  stage TEXT NOT NULL DEFAULT 'new',  -- new, active, loyal, at_risk, churned, reactivated
  previous_stage TEXT,
  markers TEXT[] DEFAULT '{}',        -- arbitrary tags like 'vip', 'whale', 'first_deposit', etc.
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pl_stage ON player_lifecycle (stage);
CREATE INDEX IF NOT EXISTS idx_pl_markers ON player_lifecycle USING GIN (markers);

ALTER TABLE player_lifecycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON player_lifecycle FOR ALL USING (true) WITH CHECK (true);

-- Automation rules definition
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,

  -- Trigger: what starts the evaluation
  -- 'metric_threshold' = runs on cron, checks computed metrics
  -- 'lifecycle_change' = triggers when player changes stage
  -- 'event' = triggers on specific event (deposit, bet, login)
  trigger_type TEXT NOT NULL DEFAULT 'metric_threshold',

  -- Conditions: JSON array of rules to evaluate
  -- Same format as segment rules: [{field, operator, value}]
  conditions JSONB NOT NULL DEFAULT '[]',
  match_type TEXT DEFAULT 'all',  -- all = AND, any = OR

  -- Optional: only apply to players in specific segment
  segment_id TEXT,

  -- Optional: only apply to specific lifecycle stages
  lifecycle_stages TEXT[] DEFAULT '{}',

  -- Action to execute when conditions match
  -- 'credit_bonus' = credit BRL bonus
  -- 'add_marker' = add marker/tag to player
  -- 'remove_marker' = remove marker
  -- 'change_lifecycle' = force lifecycle stage
  -- 'give_spins' = credit wheel spins
  -- 'give_coins' = credit gamification coins
  -- 'send_popup' = queue popup for player
  -- 'give_mission' = assign mission
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  -- action_config examples:
  -- credit_bonus:    {"amount": 15, "description": "Bônus anti-churn"}
  -- add_marker:      {"marker": "vip"}
  -- give_spins:      {"amount": 5}
  -- give_coins:      {"amount": 100}
  -- send_popup:      {"title": "Oferta especial!", "body": "...", "cta": "Depositar"}
  -- give_mission:    {"mission_id": "uuid"}

  -- Cooldown: prevent firing again for the same player within N hours
  cooldown_hours INTEGER DEFAULT 24,

  -- Limits
  max_executions_per_player INTEGER,  -- null = unlimited
  max_executions_total INTEGER,       -- null = unlimited

  -- Schedule (for metric_threshold type)
  -- null = every cron run, or cron expression
  schedule TEXT,

  -- Stats
  total_executions INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON automation_rules FOR ALL USING (true) WITH CHECK (true);

-- Automation execution log
CREATE TABLE IF NOT EXISTS automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  rule_name TEXT,
  cpf TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB,
  result JSONB DEFAULT '{}',  -- {"success": true} or {"error": "..."}
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_al_rule ON automation_log (rule_id);
CREATE INDEX IF NOT EXISTS idx_al_cpf ON automation_log (cpf);
CREATE INDEX IF NOT EXISTS idx_al_executed ON automation_log (executed_at DESC);

ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON automation_log FOR ALL USING (true) WITH CHECK (true);

-- Schedule cron for automation evaluation every 30 minutes
SELECT cron.schedule(
  'evaluate-automations',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://backofficepixbingobr.vercel.app/api/cron/evaluate-automations',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "x-cron-secret": "pixbingo-cron-2024-secret"}'::jsonb
  );
  $$
);
