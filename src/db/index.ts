import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'database.sqlite'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_type TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    
    -- Individual fields
    title TEXT,
    gender TEXT,
    dob TEXT,
    age INTEGER,
    nationality TEXT,
    religion TEXT,
    address TEXT,
    id_card_front_url TEXT,
    id_card_back_url TEXT,
    profile_photo_url TEXT,

    -- Company fields
    company_name TEXT,
    company_address TEXT,

    role TEXT DEFAULT 'USER',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;
