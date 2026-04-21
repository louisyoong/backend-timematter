-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Organizations table
--    One user can own one organization.
CREATE TABLE IF NOT EXISTS organizations (
    id              SERIAL PRIMARY KEY,
    owner_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    logo_url        TEXT,
    address         TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_owner
    ON organizations (owner_user_id);

-- 2. Events table
CREATE TABLE IF NOT EXISTS events (
    id                  SERIAL PRIMARY KEY,
    organizer_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id     INTEGER REFERENCES organizations(id) ON DELETE SET NULL,

    -- Core info
    title               TEXT NOT NULL,
    description         TEXT,
    banner_image_url    TEXT,

    -- Date & location
    event_date          TIMESTAMP WITH TIME ZONE NOT NULL,
    location            TEXT,

    -- Parking: 'free' | 'paid' | 'none'
    parking_info        TEXT CHECK (parking_info IN ('free', 'paid', 'none')),

    -- Age restriction: 'all' | 'restricted'
    age_restriction     TEXT CHECK (age_restriction IN ('all', 'restricted')) DEFAULT 'all',
    age_min             INTEGER,   -- used when age_restriction = 'restricted'
    age_max             INTEGER,   -- used when age_restriction = 'restricted'

    -- Status: 'draft' | 'published' | 'cancelled'
    status              TEXT CHECK (status IN ('draft', 'published', 'cancelled')) DEFAULT 'draft',

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_organizer  ON events (organizer_user_id);
CREATE INDEX IF NOT EXISTS idx_events_status     ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events (event_date);
