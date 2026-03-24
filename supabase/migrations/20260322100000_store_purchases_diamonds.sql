-- Add price_diamonds column to store_purchases (was missing)
ALTER TABLE store_purchases ADD COLUMN IF NOT EXISTS price_diamonds integer DEFAULT 0;
