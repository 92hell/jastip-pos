# Titip Laili Yuk: jastip app

[![CI](https://github.com/92hell/jastip-pos/actions/workflows/ci.yml/badge.svg)](https://github.com/92hell/jastip-pos/actions/workflows/ci.yml)

Order, payment and trip management for **JASTIP TITIPLAILIYUK**
([@jastip_titiplailiyuk](https://instagram.com/jastip_titiplailiyuk)), a personal shopper ("jasa titip")
business in BSD, Tangerang Selatan. Clients ask her to buy things for them; she runs open pre-order
trips and one-off requests, charges a jastip fee in several ways, takes down payments or full
payment, and keeps clients updated over WhatsApp.

Installable as an app from Chrome (Android, desktop) or "Add to Home Screen" (iPhone), in
Bahasa Indonesia first and English.

**[Try the live demo →](https://92hell.github.io/jastip-pos/)** No sign-up: press **Try as the
admin** on the sign-in page. The demo runs on a free server that sleeps when idle; the link wakes it
and opens the app as soon as it answers, usually within a minute. It starts again from the sample
shop each time it wakes, and its clients and bank accounts are invented.

![Creating an order: two items with different fees typed as 89rb and 1,2jt, the voucher and a 50% down payment, the total updating while typing, then the invoice the client opens](docs/screenshots/order-journey.gif)

**Stack:** Next.js 16 (App Router, Server Actions, Cache Components) · React 19 · TypeScript ·
PostgreSQL 17 · Drizzle ORM · Tailwind CSS 4 · Vitest · Playwright · Testcontainers.

## The story

I built this for my wife Laili's jastip business, around how she actually runs it rather than
around a generic point-of-sale:

- **Every order is priced differently.** A fee per item, one fee for a bundle, a percentage, or a
  NETT price with the fee already in it, sometimes all in one order; then a discount, the
  Instagram-tag voucher and ongkir that is only known later. Amounts are typed the way they are
  written in chats: `350.000`, `25rb`, `1,5jt`.
- **Things sell out.** When an item is gone she tells the client, who either takes something similar
  or calls it off. The app keeps that conversation's outcome: the item stops being charged, a
  swap is linked to what it replaces, and money already paid is refunded or kept as credit.
- **Trips, bazaars and wholesale.** Orders can belong to an event with a deadline and its own
  shopping list, grouped by store, which still opens in a basement without signal.
- **Clients never sign in.** They get a private invoice link over WhatsApp showing their items,
  what is paid, what is still due and where to transfer.

### Decisions worth a look

| Decision | Why |
|---|---|
| One pure pricing function, used by the form and the server | What she sees while typing is exactly what is saved. Whole rupiah only; anything impossible is refused rather than guessed. Its tests are written from her real pricing. |
| "Sold out" is a state, not a deletion | The item, the client's answer and any swap stay on the order, so the invoice and the money explain themselves later. |
| A 128-bit invoice link instead of client accounts | Clients already live in WhatsApp. The page leaves out address, notes and receipt photos, is not indexed, sends no referrer, and the link can be replaced. |
| Offline shopping lists with a hand-written service worker | Malls have dead spots. Only shopping lists are stored; ticks wait on the phone and are sent when signal returns; signing out deletes them. Every caching rule is in one short file. |
| Money changes inside transactions, behind row locks | Order numbers come from one atomic counter per Jakarta year; payments, swaps and status changes lock their order first, so two quick taps cannot spend a client's credit twice. |
| Her data stays hers | The public repo and demo hold no real accounts or clients. Her copy runs separately, and deleting a client wipes their details but keeps the orders (UU PDP). |
| Accessibility checked in the browser | axe (WCAG 2.1 AA) runs on every page at desktop and phone size in the end-to-end tests. |
| The test list is the specification | [docs/TESTING.md](docs/TESTING.md) is generated from the test names, so it cannot drift from what is tested. |
| Free hosting, honestly handled | Two free Render services (demo and her shop) on free Neon databases; the demo link is a small page on GitHub Pages that wakes it ([docs/DEPLOY.md](docs/DEPLOY.md)). |

**Tested:** 37 unit tests, 49 integration tests against PostgreSQL 17 in Docker with the real
migrations, 24 end-to-end journeys in a real browser at desktop and phone size, and 6 tests for the
wake-up page; all in CI on every pull request.

## Screenshots

**Dashboard:** what needs doing, each linking to where it is done, and where the money stands.

![The dashboard: what clients still owe, money received and fees this month, items to buy, a sold-out item waiting for the client, and a down payment not paid in full](docs/screenshots/dashboard.png)

**An order:** items with their status and fee, the 50% down payment paid, the invoice link to send
on WhatsApp, shipping, and the totals.

![An order with two items, a down payment recorded, the invoice link and the summary](docs/screenshots/order.png)

**An event:** a trip with its deadline, shopping list and summary of fees, billed, paid and still owed.

![The Jastip Singapore trip with its event summary and orders](docs/screenshots/event.png)

**On her phone, in Indonesian:** the dashboard with the tab bar, a shopping list that works without
signal, and the invoice the client opens from WhatsApp.

![Three phone screens: dashboard, shopping list grouped by store, and the client's invoice with where to pay](docs/screenshots/phones.png)

## Milestones

Built in milestones, one pull request each:

1. **Setup** (done): sign-in, the shop's public page, shop settings, Indonesian/English, CI
2. **Clients, orders and the pricing engine** (done): fee per item, per bundle, a percentage, or
   NETT (fee included); discount, Instagram-tag voucher, ongkir; resellers
3. **Events and item status** (done): trips / open POs, bazaars, wholesale; the shopping list per
   event; item status; sold-out items swapped for something similar or called off
4. **Payments and the invoice link** (done): down payment or full, transfer proof, balances,
   refunds or credit for called-off items already paid, a private invoice link sent via WhatsApp
5. **Installable app** (done): installs from Chrome or the iPhone home screen, tab bar on phones,
   shopping lists usable without signal
6. **Dashboard** (done): what needs doing today, what clients still owe, money in and fees this
   month, and a summary per event
7. **Public demo and her own private copy** (done): free hosting, a wake-up link for the demo
8. Ready stock: excess stock sold at bazaars or wholesale

## Features

- **Shop page** (`/id`, `/en`): name, tagline, location, WhatsApp and Instagram, her jastip rules
  ("NETT" means no fee, shipping Monday–Friday, unboxing video required for complaints) and the
  Instagram-tag voucher.
- **Sign-in** for Laili (and helpers later). Clients never sign in: they get a private invoice link.
- **Shop settings**: profile, up to five payment accounts, rules and the voucher amount.
- **Clients**: name, WhatsApp (any way it is typed: 0812-…, +62 …), address, notes, reseller mark;
  search by name or number; a number another client already has is refused. Deleting a client with
  orders wipes their personal details but keeps the orders.
- **Orders**: items with store, quantity and price, each with its own jastip fee: a flat fee per item,
  a percentage, NETT (fee included) or part of a bundle with one flat fee. Then discount, the
  Instagram-tag voucher and ongkir (left open until known). Amounts can be typed the way they are in
  chats: `350.000`, `25rb`, `1,5jt`. The total updates while typing, and the server prices the order
  again on save. Orders are numbered per year in Jakarta time (`TLY-2026-0001`).
- **Events**: a trip or open PO ("Jastip Singapore"), a bazaar, a wholesale sale, or anything else,
  with dates and an order deadline. Orders can belong to an event or stand alone. A closed event
  takes no new orders; its orders carry on.
- **Shopping list** per event: everything still to buy, grouped by store, with who it is for. Tick
  what is bought; mark what is sold out.
- **Item status**: ordered → bought → arrived → packed → shipped, any step undoable. Shipping an
  order records the courier and tracking number.
- **Sold out**, the way she handles it: the item stops being charged and waits for the client.
  "Tell the client" opens WhatsApp with the message ready ("…sold out 🙏 Mau diganti yang mirip
  atau dibatalkan aja?"); then it is either swapped for a similar item (added to the same order,
  linked, priced again) or called off.
- **Payments**: a DP target per order (e.g. 50%), then any number of payments by transfer, QRIS,
  cash or the client's credit, each with an optional photo of the transfer receipt (made smaller in
  the browser, only visible to staff). The order shows what is paid, what is still due and the DP.
  When a paid item is called off, the difference is refunded or kept as credit for the next order.
- **Invoice link**: each order has a private link (`/id/i/<128-bit token>`) the client opens
  without signing in: items with their status, totals, payments, what is still due and where to
  pay. No address, notes or receipt photos; not indexed by search engines; the link is not passed
  on to other sites; she can replace it with a new one. "Send invoice" opens WhatsApp with the
  message and link ready.
- **Dashboard**: what needs doing, each linking to where it is done: items still to buy (per
  event), sold-out items waiting for the client, items to pack and to send, DPs not paid in full,
  overpaid orders to refund or keep as credit. Then the money: what clients still owe, what came in
  this month (Jakarta time) and the jastip fees earned this month.
- **Event summary**: orders, item value, the fees earned on the event, total billed, paid and still owed.
- **Installable app (PWA)**: Chrome on Android offers "Install app" (also from the More tab); on
  iPhone, "Add to Home Screen" (the steps are shown in the app). It opens full screen with its own
  icon. On phones the main sections are tabs at the bottom.
- **Offline shopping lists**: a list opened once with signal opens again without it, and ticks
  ("bought", "sold out") made offline are kept on the phone, marked "not sent yet", and sent
  automatically when signal returns. Only shopping lists are stored; signing out deletes them and
  any unsent ticks. The service worker is a short hand-written file
  ([`public/sw.js`](public/sw.js)) so every caching rule is visible.

## The pricing engine

[`src/lib/pricing.ts`](src/lib/pricing.ts) is one pure function used by both the order form and the
server, so what Laili sees while typing is what gets saved. Money is whole rupiah; a percentage fee
is rounded per line; discount and voucher never take the total below zero and never reduce ongkir;
anything impossible (zero quantity, negative or fractional amounts, an unknown bundle) is refused
rather than guessed. Its unit tests are written from how she actually prices orders.

## Her data stays hers

The repository and the public demo never contain her real bank accounts, client names, phone
numbers or addresses. Payment accounts are entered in the app's settings; the demo shows clearly
fake ones (`0000000000`, "Contoh Demo Jastip"). Her real clients live only in her own private copy,
which keeps what an order needs and lets her delete a client (UU PDP).

## Deploy

Free on Render (two services: the public demo and Laili's own copy) with free Neon databases, plus
a wake-up page on GitHub Pages for the demo link. Step by step: [docs/DEPLOY.md](docs/DEPLOY.md).

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
| `DEMO_MODE` | `false` | Public demo: sample shop, fake payment accounts, demo sign-in, reset on every start (on the free plan: after every sleep) |
| `TRUST_PROXY` | `false` | Behind a hosting proxy, use `X-Forwarded-For` for sign-in throttling |
| `PUBLIC_URL` | (from the request) | Public address used in invoice links sent to clients |
