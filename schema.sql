CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('individual', 'company')),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Individual fields
    title VARCHAR(10),
    gender VARCHAR(10),
    dob DATE,
    age INT,
    nationality VARCHAR(100),
    religion VARCHAR(100),
    address TEXT,
    id_card_front_url TEXT,
    id_card_back_url TEXT,
    profile_photo_url TEXT,

    -- Company fields
    company_name VARCHAR(255),
    company_address TEXT,

    role VARCHAR(50) DEFAULT 'USER',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
