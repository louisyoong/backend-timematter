-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS name TEXT;
