-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Add is_blocked column (default false — all users start unblocked)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Set the two admin users
--    NOTE: These users must have already signed in via Google OAuth
--    and completed their profile before running this.
--    If you run this before they sign up, re-run it after they do.
UPDATE users
    SET role = 'ADMIN'
    WHERE email IN ('louis910729@gmail.com', 'pp.prapada@gmail.com');
