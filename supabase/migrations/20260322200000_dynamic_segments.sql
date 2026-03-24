-- Add dynamic segmentation fields to segments table
ALTER TABLE segments ADD COLUMN IF NOT EXISTS segment_type TEXT NOT NULL DEFAULT 'manual'; -- manual | automatic
ALTER TABLE segments ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '[]'::jsonb; -- array of rule objects
ALTER TABLE segments ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'all'; -- all (AND) | any (OR)
ALTER TABLE segments ADD COLUMN IF NOT EXISTS auto_refresh BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6d28d9';
ALTER TABLE segments ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'users';

-- Add metadata to segment_items for tracking
ALTER TABLE segment_items ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'; -- manual | rule | import
ALTER TABLE segment_items ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_segment_items_cpf ON segment_items(cpf);
CREATE INDEX IF NOT EXISTS idx_segments_type ON segments(segment_type);
