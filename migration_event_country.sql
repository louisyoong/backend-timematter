-- Add country field to events (TH = Thailand, MY = Malaysia, NULL = both)
ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT DEFAULT NULL;
