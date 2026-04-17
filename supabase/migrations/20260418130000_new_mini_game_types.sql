-- Quiz questions for quiz-type mini games
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES mini_games(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_limit_seconds INT DEFAULT 30,
  points INT DEFAULT 10,
  explanation TEXT,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Match X items for match-pairs games
CREATE TABLE IF NOT EXISTS match_x_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES mini_games(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  image_url TEXT,
  pair_group INT NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Detailed game results for all mini-game types
CREATE TABLE IF NOT EXISTS player_mini_game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT NOT NULL,
  game_id UUID REFERENCES mini_games(id) ON DELETE SET NULL,
  game_type TEXT NOT NULL,
  score INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  pairs_found INT DEFAULT 0,
  prizes_caught INT DEFAULT 0,
  time_taken_ms INT DEFAULT 0,
  reward_type TEXT,
  reward_value NUMERIC DEFAULT 0,
  played_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_x_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_mini_game_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users full access quiz_questions" ON quiz_questions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access match_x_items" ON match_x_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access player_mini_game_results" ON player_mini_game_results FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_quiz_questions_game ON quiz_questions(game_id, sort_order);
CREATE INDEX idx_match_x_items_game ON match_x_items(game_id, sort_order);
CREATE INDEX idx_player_mini_game_results_cpf ON player_mini_game_results(cpf, played_at DESC);
