ALTER TABLE popups ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'once';
ALTER TABLE popup_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();