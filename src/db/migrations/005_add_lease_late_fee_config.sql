-- 005_add_lease_late_fee_config.sql
-- Allows a lease to define its rent due day and automated late-fee terms.
-- rent_due_day NULL means late fees are not computed for the lease.
ALTER TABLE leases ADD COLUMN IF NOT EXISTS rent_due_day INTEGER;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS late_fee_daily_pct NUMERIC(6,4) NOT NULL DEFAULT 0.05;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS late_fee_grace_days INTEGER NOT NULL DEFAULT 0;