-- Customer Journey Engine tables
CREATE TABLE IF NOT EXISTS journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativa','pausada','encerrada')),
  entry_event TEXT NOT NULL DEFAULT 'deposit' CHECK (entry_event IN ('deposit','bet','login','level_up','achievement_unlock','registration','segment_enter','manual')),
  entry_conditions JSONB DEFAULT '[]'::jsonb,
  entry_match_type TEXT DEFAULT 'all',
  segment_id UUID REFERENCES segments(id),
  max_entries_per_player INT DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS journey_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 0,
  step_type TEXT NOT NULL DEFAULT 'action' CHECK (step_type IN ('action','delay','condition_split')),
  delay_minutes INT DEFAULT 0,
  action_type TEXT CHECK (action_type IN ('credit_bonus','give_coins','give_xp','give_spins','give_mission','give_achievement','add_to_segment','send_push','send_inbox')),
  action_config JSONB DEFAULT '{}'::jsonb,
  conditions JSONB DEFAULT '[]'::jsonb,
  condition_yes_next INT,
  condition_no_next INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journey_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  cpf TEXT NOT NULL,
  current_step_order INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','exited','paused')),
  entered_at TIMESTAMPTZ DEFAULT now(),
  step_entered_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(journey_id, cpf)
);

CREATE TABLE IF NOT EXISTS journey_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES journey_enrollments(id) ON DELETE SET NULL,
  cpf TEXT NOT NULL,
  step_order INT,
  action_type TEXT,
  result JSONB DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_journey_enrollments_active ON journey_enrollments(journey_id, status) WHERE status = 'active';
CREATE INDEX idx_journey_log_journey ON journey_log(journey_id, executed_at DESC);

ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access journeys" ON journeys FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access journey_steps" ON journey_steps FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access journey_enrollments" ON journey_enrollments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access journey_log" ON journey_log FOR ALL USING (auth.role() = 'authenticated');
