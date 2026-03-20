-- Add discount_percent column to store_items
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS discount_percent integer DEFAULT 0;
