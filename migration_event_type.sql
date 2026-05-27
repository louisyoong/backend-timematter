-- Add event type (offline/online) and online URL to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE events ADD COLUMN IF NOT EXISTS online_url TEXT DEFAULT NULL;
