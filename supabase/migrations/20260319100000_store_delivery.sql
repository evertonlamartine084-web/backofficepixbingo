-- Add delivery tracking to store_purchases
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS reward_type TEXT;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS reward_value TEXT;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS delivery_note TEXT;

-- Update reward_type options on store_items (just a comment for reference)
-- Valid reward_types: bonus, free_bet, cartelas, coins, xp, physical, coupon
COMMENT ON COLUMN public.store_items.reward_type IS 'bonus | free_bet | cartelas | coins | xp | physical | coupon';

-- Index for pending deliveries (backoffice view)
CREATE INDEX IF NOT EXISTS idx_store_purchases_status ON store_purchases(status) WHERE status = 'pending';
