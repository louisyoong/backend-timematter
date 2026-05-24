-- Run in Supabase Dashboard → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS articles (
    id              SERIAL PRIMARY KEY,
    author_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    banner_image_url TEXT,
    published_at    DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_author      ON articles (author_user_id);
CREATE INDEX IF NOT EXISTS idx_articles_published   ON articles (published_at DESC);
