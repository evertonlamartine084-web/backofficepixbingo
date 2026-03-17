-- Gamification tables: achievements, missions, tournaments, daily wheel

-- ==========================================
-- ACHIEVEMENTS (Conquistas)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT NOT NULL DEFAULT 'geral', -- deposito, aposta, login, vitoria, social, geral
  condition_type TEXT NOT NULL, -- first_deposit, total_deposited, total_bet, consecutive_days, total_wins, total_games, referrals
  condition_value NUMERIC NOT NULL DEFAULT 1,
  reward_type TEXT NOT NULL DEFAULT 'bonus', -- bonus, coins, xp
  reward_value NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_auth" ON public.achievements FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER update_achievements_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- MISSIONS (Missões)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  type TEXT NOT NULL DEFAULT 'daily', -- daily, weekly
  condition_type TEXT NOT NULL, -- deposit, bet, win, login, play_keno, play_cassino
  condition_value NUMERIC NOT NULL DEFAULT 1,
  reward_type TEXT NOT NULL DEFAULT 'bonus', -- bonus, coins, xp
  reward_value NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missions_auth" ON public.missions FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER update_missions_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- TOURNAMENTS (Torneios)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  metric TEXT NOT NULL DEFAULT 'total_bet', -- total_bet, total_won, total_deposit, ggr
  game_filter TEXT NOT NULL DEFAULT 'all', -- keno, cassino, all
  min_bet NUMERIC NOT NULL DEFAULT 0,
  prizes JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{rank: 1, value: 1000, description: "1º lugar"}]
  status TEXT NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, ATIVO, ENCERRADO
  segment_id UUID REFERENCES public.segments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournaments_auth" ON public.tournaments FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- DAILY WHEEL PRIZES (Roleta Diária)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.daily_wheel_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'bonus', -- bonus, coins, xp, nothing
  probability INT NOT NULL DEFAULT 1, -- weight (higher = more likely)
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_wheel_prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_wheel_auth" ON public.daily_wheel_prizes FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER update_daily_wheel_updated_at
  BEFORE UPDATE ON public.daily_wheel_prizes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
