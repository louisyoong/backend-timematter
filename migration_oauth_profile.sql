-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Add new columns needed for OAuth + new profile structure
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS supabase_user_id  TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS company_info_url  TEXT,
    ADD COLUMN IF NOT EXISTS profile_complete  BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Make password_hash nullable (OAuth users have no password)
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

-- 3. Drop old email verification columns (no longer needed — OAuth providers verify email)
ALTER TABLE users
    DROP COLUMN IF EXISTS email_verified,
    DROP COLUMN IF EXISTS verification_token,
    DROP COLUMN IF EXISTS verification_token_expires_at;

-- 4. Index for fast lookup by Supabase user ID
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id
    ON users (supabase_user_id);
