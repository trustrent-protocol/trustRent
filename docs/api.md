# API Reference

Full documentation for the trustRent REST API.

Base URL: `http://localhost:3000/api/v1`

All endpoints except `/users/register` and `/users/login` require:
```
Authorization: Bearer <jwt>
```

## Users

### POST /users/register
```json
{ "email": "...", "password": "...", "role": "tenant|landlord|agent", "stellar_pk": "G..." }
```

### POST /users/login
```json
{ "email": "...", "password": "..." }
```

## Leases

### POST /leases
```json
{
  "tenant_id": "uuid",
  "property_address": "123 Main St",
  "rent_amount": "500.00",
  "deposit_amount": "1000.00",
  "agent_id": "uuid (optional)",
  "agent_fee_pct": 7,
  "lease_hash": "sha256hex",
  "starts_at": "2026-06-01",
  "ends_at": "2027-06-01",
  "duration_months": 12
}
```

### GET /leases/:id
### PATCH /leases/:id  `{ "status": "active|ended|cancelled" }`
### DELETE /leases/:id  (pending leases only)

## Escrow

### POST /escrow
```json
{ "lease_id": "uuid", "funding_secret_key": "S..." }
```

### GET /escrow/:leaseId
### POST /escrow/:leaseId/release  *(v0.2)*
### POST /escrow/:leaseId/dispute  *(v0.2)*

## Payments

### POST /payments
```json
{
  "lease_id": "uuid",
  "amount": "500.00",
  "asset": "USDC",
  "memo": "Rent June 2026",
  "tenant_secret_key": "S..."
}
```

### GET /payments/:leaseId
### GET /payments/receipt/:txHash
