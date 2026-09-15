CREATE TABLE IF NOT EXISTS indexer_cursors (
  account_id  TEXT PRIMARY KEY,
  cursor      TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);