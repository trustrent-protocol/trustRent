-- 003_create_payments.sql
CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id    UUID REFERENCES leases(id),
  amount      TEXT NOT NULL,
  asset       TEXT NOT NULL DEFAULT 'USDC',
  memo        TEXT,
  tx_hash     TEXT UNIQUE,
  ledger      BIGINT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','failed')),
  splits      JSONB,
  settled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
