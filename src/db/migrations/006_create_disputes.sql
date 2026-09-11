-- 006_create_disputes.sql
-- Off-chain deposit disputes between tenant and landlord.
-- Resolution records the agreed/arbitrated tenant share of the deposit.
CREATE TABLE IF NOT EXISTS disputes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id         UUID REFERENCES leases(id) NOT NULL,
  raised_by        UUID REFERENCES users(id) NOT NULL,
  reason           TEXT NOT NULL,
  evidence         JSONB,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'resolved')),
  tenant_share_pct INTEGER,
  resolved_by      UUID REFERENCES users(id),
  resolution_note  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS disputes_lease_id_idx ON disputes (lease_id);