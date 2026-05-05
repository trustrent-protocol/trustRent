-- 002_create_leases.sql
CREATE TABLE IF NOT EXISTS leases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id         UUID REFERENCES users(id),
  tenant_id           UUID REFERENCES users(id),
  agent_id            UUID REFERENCES users(id),
  property_address    TEXT NOT NULL,
  rent_amount         TEXT NOT NULL,
  deposit_amount      TEXT NOT NULL,
  asset               TEXT NOT NULL DEFAULT 'USDC',
  agent_fee_pct       NUMERIC(5,2) DEFAULT 0,
  lease_hash          TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','ended','cancelled')),
  starts_at           DATE NOT NULL,
  ends_at             DATE NOT NULL,
  duration_months     INTEGER NOT NULL,
  escrow_account_pk   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
