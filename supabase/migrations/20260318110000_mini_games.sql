-- =============================================================
-- Mini Games: Scratch Card, Gift Box, Prize Drop
-- =============================================================

-- 1. Mini Games Config (generic table for all mini game types)
CREATE TABLE IF NOT EXISTS public.mini_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'scratch_card', 'gift_box', 'prize_drop'
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  segment_id UUID REFERENCES public.segments(id) ON DELETE SET NULL,
  -- Attempt limits
  max_attempts_per_day INTEGER DEFAULT 1,
  free_attempts_per_day INTEGER DEFAULT 1,
  attempt_cost_coins INTEGER DEFAULT 0,
  -- Visual config
  theme TEXT DEFAULT 'default',
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mini_games_type ON mini_games(type);
CREATE INDEX IF NOT EXISTS idx_mini_games_active ON mini_games(active) WHERE active = true;

-- 2. Mini Game Prizes (prizes for each game)
CREATE TABLE IF NOT EXISTS public.mini_game_prizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.mini_games(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'coins', -- coins, xp, bonus, free_bet, spins, nothing
  value NUMERIC NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 1,
  icon TEXT,
  color TEXT DEFAULT '#8b5cf6',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mini_game_prizes_game ON mini_game_prizes(game_id);

-- 3. Player Mini Game Attempts (tracking per day)
CREATE TABLE IF NOT EXISTS public.player_mini_game_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  game_id UUID NOT NULL REFERENCES public.mini_games(id) ON DELETE CASCADE,
  attempts_today INTEGER NOT NULL DEFAULT 0,
  last_attempt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_mini_game_unique ON player_mini_game_attempts(cpf, game_id);

-- RLS
ALTER TABLE public.mini_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_game_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_mini_game_attempts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['mini_games', 'mini_game_prizes', 'player_mini_game_attempts']) LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "auth_all_%s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "anon_select_%s" ON public.%I FOR SELECT TO anon USING (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "anon_insert_%s" ON public.%I FOR INSERT TO anon WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "anon_update_%s" ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
