-- 001_create_users.sql
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('landlord', 'tenant', 'agent')),
  stellar_pk  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
