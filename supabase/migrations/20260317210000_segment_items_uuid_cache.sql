-- Cache UUID on segment_items to avoid repeated search_player calls
ALTER TABLE segment_items ADD COLUMN IF NOT EXISTS uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_segment_items_uuid ON segment_items(uuid) WHERE uuid IS NOT NULL;
