-- Add diamonds currency to player wallets
ALTER TABLE public.player_wallets ADD COLUMN IF NOT EXISTS diamonds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.player_wallets ADD COLUMN IF NOT EXISTS total_diamonds_earned INTEGER NOT NULL DEFAULT 0;

-- Add diamond pricing to store items
ALTER TABLE public.store_items ADD COLUMN IF NOT EXISTS price_diamonds INTEGER NOT NULL DEFAULT 0;

-- Update reward_type comment
COMMENT ON COLUMN public.store_items.reward_type IS 'bonus | free_bet | cartelas | coins | xp | diamonds | physical | coupon';
