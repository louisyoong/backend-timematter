-- Run in Supabase Dashboard → SQL Editor → New Query
-- Adds check-in tracking to event_attendees

ALTER TABLE event_attendees
  ADD COLUMN IF NOT EXISTS checked_in      BOOLEAN                  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS checked_in_at   TIMESTAMP WITH TIME ZONE DEFAULT NULL;
