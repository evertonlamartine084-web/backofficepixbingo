CREATE TABLE IF NOT EXISTS formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'custom' CHECK (category IN ('cashback','bonus','xp','reward','custom')),
  formula_ast JSONB NOT NULL,
  variables_used TEXT[] DEFAULT '{}',
  test_input JSONB DEFAULT '{}'::jsonb,
  test_output NUMERIC,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access formulas" ON formulas FOR ALL USING (auth.role() = 'authenticated');
