# Titip Laili Yuk: jastip app

[![CI](https://github.com/92hell/jastip-pos/actions/workflows/ci.yml/badge.svg)](https://github.com/92hell/jastip-pos/actions/workflows/ci.yml)

Order, payment and trip management for **JASTIP TITIPLAILIYUK**
([@jastip_titiplailiyuk](https://instagram.com/jastip_titiplailiyuk)), a personal shopper ("jasa titip")
business in BSD, Tangerang Selatan. Clients ask her to buy things for them; she runs open pre-order
trips and one-off requests, charges a jastip fee in several ways, takes down payments or full
payment, and keeps clients updated over WhatsApp.

Installable as an app from Chrome (Android, desktop) or "Add to Home Screen" (iPhone), in
Bahasa Indonesia first and English.

**Stack:** Next.js 16 (App Router, Server Actions, Cache Components) · React 19 · TypeScript ·
PostgreSQL 17 · Drizzle ORM · Tailwind CSS 4 · Vitest · Playwright · Testcontainers.

## Status

Built in milestones, one pull request each:

1. **Setup** (done): sign-in, the shop's public page, shop settings, Indonesian/English, CI
2. Clients, orders and the pricing engine: fee per item, per bundle, a percentage, or NETT (fee
   included); discount, Instagram-tag voucher, shipping; resellers
3. Trips (open PO) and one-off orders, the shopping list per trip, item status, sold-out items
   refunded or kept as credit
4. Payments: down payment or full, transfer proof, balances, a private invoice link sent via WhatsApp
5. Installable app (PWA) with the shopping list working offline
6. Dashboard and per-trip reports
7. Public demo and her own private copy

## What is in it now

- **Shop page** (`/id`, `/en`): name, tagline, location, WhatsApp and Instagram, her jastip rules
  ("NETT" means no fee, shipping Monday–Friday, unboxing video required for complaints) and the
  Instagram-tag voucher.
- **Sign-in** for Laili (and helpers later). Clients never sign in: they will get a private invoice link.
- **Shop settings**: profile, up to five payment accounts, rules and the voucher amount.

## Her data stays hers

The repository and the public demo never contain her real bank accounts, client names, phone
numbers or addresses. Payment accounts are entered in the app's settings; the demo shows clearly
fake ones (`0000000000`, "Contoh Demo Jastip"). Her real clients live only in her own private copy,
which keeps what an order needs and lets her delete a client (UU PDP).

## Run it locally

Needs Node 22 and Docker.

```bash
docker compose up -d
```

```bash
cp .env.example .env.local
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. On first start the database is migrated and the owner account from
`OWNER_USERNAME` / `OWNER_PASSWORD` is created. With `DEMO_MODE=true` you get the sample shop and a
"Try as the admin" button instead.

## Tests

```bash
npm test
```

Unit tests, plus integration tests against a real PostgreSQL started in Docker (Testcontainers)
with the real migrations.

```bash
npm run build && npm run e2e
```

Browser journeys at desktop and phone size, with axe (WCAG 2.1 AA) checks on every page. They need
a PostgreSQL database for the app (`E2E_DATABASE_URL`, default
`postgres://jastip:jastip@localhost:5432/jastip_e2e`).

[docs/TESTING.md](docs/TESTING.md) lists every test by name; it is generated (`npm run catalog`).

## Security

- Passwords hashed with Argon2id; a wrong username takes as long to refuse as a wrong password.
- Sessions: 32 random bytes in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); only
  a SHA-256 hash is stored, so a copy of the database cannot be used to sign in. 30 days, extended
  while in use.
- Sign-in throttled: 5 failures per username and address, 20 per address, within 15 minutes.
- Every page and Server Action checks the session itself; settings are owner-only. Next.js checks
  the `Origin` of every Server Action (CSRF).
- All input validated on the server (zod), field by field.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection |
| `OWNER_USERNAME`, `OWNER_PASSWORD`, `OWNER_NAME` | (none) | Owner account created on first start (password 12+ characters) |
| `DEMO_MODE` | `false` | Public demo: sample shop, fake payment accounts, demo sign-in, reset on every start |
| `TRUST_PROXY` | `false` | Behind a hosting proxy, use `X-Forwarded-For` for sign-in throttling |
