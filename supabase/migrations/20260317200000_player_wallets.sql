-- Player wallet: tracks coins and XP per player
CREATE TABLE IF NOT EXISTS player_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT NOT NULL UNIQUE,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  total_coins_earned INTEGER NOT NULL DEFAULT 0,
  total_xp_earned INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_player_wallets_cpf ON player_wallets(cpf);

-- RLS
ALTER TABLE player_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON player_wallets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow read for anon" ON player_wallets FOR SELECT USING (true);

-- Trigger updated_at
CREATE TRIGGER set_player_wallets_updated_at
  BEFORE UPDATE ON player_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
