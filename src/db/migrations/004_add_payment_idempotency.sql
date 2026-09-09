-- 004_add_payment_idempotency.sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Prevent double submission of the same logical payment (lease + client key).
CREATE UNIQUE INDEX IF NOT EXISTS payments_lease_idempotency_key
  ON payments (lease_id, idempotency_key) WHERE idempotency_key IS NOT NULL;