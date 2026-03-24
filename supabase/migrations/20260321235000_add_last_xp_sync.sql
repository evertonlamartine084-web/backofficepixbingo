-- Add last_xp_sync to player_wallets for XP deduplication
ALTER TABLE public.player_wallets ADD COLUMN IF NOT EXISTS last_xp_sync TIMESTAMPTZ;
