CREATE TABLE IF NOT EXISTS mini_game_skins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL DEFAULT 'scratch_card' CHECK (game_type IN ('scratch_card','gift_box','prize_drop','prize_drop_live','quiz','match_x')),
  is_template BOOLEAN DEFAULT false,
  skin_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

ALTER TABLE mini_game_skins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access mini_game_skins" ON mini_game_skins FOR ALL USING (auth.role() = 'authenticated');
