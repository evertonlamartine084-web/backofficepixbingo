-- Add updated_at column to track when mission progress was last synced
ALTER TABLE player_mission_progress
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_player_mission_progress_updated_at'
  ) THEN
    CREATE TRIGGER trg_player_mission_progress_updated_at
      BEFORE UPDATE ON player_mission_progress
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
