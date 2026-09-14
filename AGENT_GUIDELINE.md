# Multi-Store Retail ERP & POS — Master Engineering Guideline (v3 — Final)

This is the single, final version of the guideline. It supersedes the original PDF
guideline and all prior addenda. Give this document to your coding agent as its
system context, together with `schema.prisma` and the ERD diagrams in
`docs/architecture/`.

Where this document is silent, the SRS governs. Where the two disagree, this
document governs (the disagreements are called out explicitly in §9).

---

## 0. Reality Check (read this first)

Full scope = enterprise RBAC + WebAuthn/passkeys + TOTP 2FA + backup-code system +
new-device approval workflow + multi-shop POS + variant/barcode engine + purchasing +
inventory ledger + returns/refunds/exchanges + transfers + reporting/exports +
notifications + audit + backup/restore + switchable currency — built correctly, by
one developer plus an agent, in 4 days.

That is not a realistic "build everything to production-grade" timeline. It **is**
realistic to ship a professional, secure, fully-transactional **core system** (auth,
RBAC, shop isolation, catalog, inventory ledger, POS/checkout, returns/refunds) in 4
days, with the remaining items (currency switching, WebAuthn, backup/restore,
advanced reports) built as a clearly-labeled Phase 2 immediately after. §9 gives you
the exact cut line. Do not let the agent silently skip things — make it follow the
cut line explicitly so nothing is dropped, just sequenced.

---

## 1. Confirmed Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form + Zod, Zustand (POS cart/UI state only) |
| Backend | NestJS 10/11, TypeScript, Prisma ORM 5/6, PostgreSQL 16 |
| Cache/Queue | Redis 7 (rate limiting, session blacklist, low-stock job queue via BullMQ) |
| Auth | Argon2id password hashing, JWT access token (short-lived) + rotating refresh token in httpOnly cookie, `otplib` for TOTP, `@simplewebauthn/server` for passkeys |
| Docs | Swagger/OpenAPI at `/api/docs` |
| Files | S3-compatible object storage (return evidence photos, product images, generated PDFs) — local disk + MinIO in dev, real S3/R2 in prod |
| PDF/labels | `pdf-lib` or `@react-pdf/renderer` for receipts and barcode labels; `bwip-js` for CODE128/EAN-13 barcode + QR rendering |
| Infra | Docker + Docker Compose, Caddy or Nginx reverse proxy, HTTPS |

Modular monolith. Never split into microservices — the transactions here are too
interrelated and the timeline too short.

---

## 2. Repository Structure

```
project-root/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # NestJS backend
│       └── prisma/
│           └── schema.prisma
├── packages/
│   ├── shared-types/
│   └── config/
├── docs/
│   ├── AGENT_GUIDELINE.md   # this file
│   ├── architecture/        # erd-*.png
│   ├── api/
│   ├── database/
│   └── decisions/
├── docker/
├── docker-compose.yml
├── .env.example
├── README.md
└── CONTRIBUTING.md
```

## 3. Backend Structure (mandatory)

```
apps/api/src/
├── main.ts
├── app.module.ts
├── config/
├── common/
│   ├── decorators/  guards/  interceptors/  filters/
│   ├── middleware/  pipes/  constants/  types/  utils/
├── database/
│   ├── prisma.module.ts  prisma.service.ts  transaction.service.ts
└── modules/
    ├── auth/  users/  roles/  shops/
    ├── products/  inventory/  purchases/
    ├── sales/  payments/  customers/  suppliers/
    ├── returns/  exchanges/  transfers/
    ├── settings/  reports/  notifications/  audit/
    └── security/  backup/
```

Each module internally:
```
modules/<name>/
├── <name>.module.ts
├── controllers/  services/  dto/
├── commands/  queries/       # CQRS-lite for complex ops
├── policies/
├── events/  listeners/
├── types/  tests/
```

Controllers stay thin (HTTP concerns only). Business logic lives in
services/command handlers. Checkout, return approval, exchange completion, and the
currency-switch operation are each a dedicated application service.

## 4. Frontend Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   ├── (admin)/
│   │   ├── dashboard/ products/ inventory/ purchases/
│   │   ├── returns/ shops/ users/ reports/
│   │   ├── security/ backup/ settings/
│   └── (shop)/
│       ├── dashboard/ pos/ products/ sales/ returns/ account/
├── components/
│   ├── ui/  layout/  forms/  data-table/  pos/
├── features/
│   ├── auth/ products/ inventory/ sales/ returns/
├── hooks/  lib/  stores/  types/
```

Route groups are enforced server-side too — never rely on them alone. Reusable
primitives to build once and reuse everywhere: `PageHeader`, `DataTable`,
`FilterBar`, `ConfirmDialog`, `FormField`, `StatusBadge`, `EmptyState`.

### POS UX (non-negotiable — this is what makes it usable at a real till)

- Barcode input auto-focuses immediately after a sale completes — the cashier
  should never need to click into a field before scanning the next item.
- Keyboard shortcuts for: focus search, add scanned item, remove line item,
  complete sale, print receipt, start new transaction. Document the actual
  key bindings in `docs/api/pos-shortcuts.md` once decided.
- Treat the barcode scanner as a keyboard-input device (it types + sends
  Enter) — the product search field must capture that without a dedicated
  "scan mode" toggle.
- Minimize modal interruptions during checkout; confirm only genuinely
  destructive actions (clearing the cart, voiding a sale).
- Admin dashboard must be responsive (desktop, tablet, mobile). POS is
  optimized primarily for desktop/tablet — don't over-invest in a phone POS
  layout for this phase.

### Barcode label printing (part of Phase 3 — catalog, not an afterthought)

After stock is added, the admin can generate printable barcode labels
containing: product name, variant, size/colour, SKU, barcode, selling price.
Support single-label and bulk printing, an A4 sheet layout, and a
thermal-printer-friendly layout, both generated as PDF (`pdf-lib` /
`@react-pdf/renderer` per §1, barcode rendering via `bwip-js`). This has no
schema of its own — it reads from `Product`, `ProductVariant`, and `Barcode`
— but it's a real feature to build, not just a library mentioned in the
stack table.

---

## 5. Database — Design Principles

- UUID primary keys, `snake_case` table/column names, `timestamptz` timestamps.
- `numeric(12,2)` for all money and `numeric(12,3)` for quantities — **never float**.
- Foreign keys and unique constraints enforced at the DB level, not just app level.
- Soft-delete (`archived_at`) for products/categories/suppliers referenced by
  historical transactions. Sales/returns/refunds are never physically deleted.
- Every stock-affecting action writes to `stock_movements` — the balance in
  `inventory_balances` is a derived cache, never edited directly outside the
  inventory service.

Full schema is in **`schema.prisma`** — this is your source of truth. Generate
migrations from it; never write raw SQL migrations by hand. Diagrammed across the
four ERDs in `docs/architecture/`.

### Inventory formula (non-negotiable)
`quantity_available = quantity_on_hand - quantity_reserved`

### Stock movement types
`PURCHASE_RECEIPT, SALE, SALE_REVERSAL, RETURN_SELLABLE, RETURN_DAMAGED, EXCHANGE_OUT,
EXCHANGE_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE, LOSS, TRANSFER_OUT, TRANSFER_IN`

---

## 6. RBAC — Full Permission List

Two roles exist (`SUPER_ADMIN`, `SHOP_USER`) but permissions are granular and
DB-backed so a third role can be added later without a schema change.

```
products.view products.create products.update products.delete products.archive
categories.manage brands.manage suppliers.manage
inventory.view inventory.add inventory.adjust inventory.transfer.request
inventory.transfer.approve inventory.transfer.dispatch inventory.transfer.receive
purchases.view purchases.create
sales.create sales.view sales.view.own_shop sales.void
returns.create returns.view returns.approve returns.reject
refunds.process exchanges.process
customers.manage
payments.view payments.configure
reports.view reports.export expenses.manage
users.manage shops.manage settings.manage
audit.view security.manage backup.manage notifications.manage
```

`SUPER_ADMIN` is seeded with all permissions, including `settings.manage` (which
gates the currency-switch operation in §9.7). `SHOP_USER` is seeded with exactly:
`sales.create, sales.view.own_shop, inventory.view, returns.create, customers.manage
(create/view only), notifications.manage (own)`. Every guard checks permission +
shop-scope together — see §7.

---

## 7. Authorization & Shop Isolation (non-negotiable)

Every protected request passes through, in order:
1. Authentication (valid access token)
2. Session validity (not revoked, not expired, idle-timeout not exceeded)
3. Role check
4. Permission check
5. Shop-access check (when the resource is shop-scoped)

Frontend hiding a menu item is not authorization. Every shop-scoped table carries
`shop_id`, and every query in a shop-scoped service must filter by the caller's
assigned shop(s) — never trust a `shopId` passed in the request body/params without
verifying it against `user_shops`. Write an integration test that specifically tries
to fetch another shop's sale/inventory by guessing an ID, for every shop-scoped
module.

### API hardening checklist (explicit — don't rely on "the stack implies it")

- CORS configured to the actual frontend origin(s), not `*`.
- `helmet` (or NestJS equivalent) for security headers on every response.
- Redis-backed rate limiting on auth endpoints specifically (login, password
  reset, 2FA verify) in addition to any global rate limit.
- Every DTO validates and sanitizes input — reject unknown fields
  (`whitelist: true` / `forbidNonWhitelisted: true` in class-validator).
- File uploads (return evidence photos, product images) validate MIME type
  and size server-side, not just in the frontend `<input accept>`, and store
  with a generated filename — never trust the client-supplied filename.
- Refund and exchange endpoints must check `Return.status === APPROVED`
  before processing — a `Refund`/`Exchange` row existing is not itself proof
  the return was approved; enforce it in the service, and the
  `REFUND_NOT_ALLOWED`/`EXCHANGE_NOT_ALLOWED` error codes exist precisely
  for this check.
- Every mutating Super Admin action writes an `audit_logs` row, including
  the actor's role and device info at the time (see `AuditLog.actorRole` /
  `AuditLog.deviceInfo` in the schema) — not just financial actions.

---

## 8. API Conventions

- Prefix `/api/v1`. Every write validated via DTOs (class-validator/Zod).
- Consistent envelope:
```json
// success
{ "success": true, "message": "Operation completed", "data": {} }
// error
{ "success": false, "message": "Insufficient stock", "error": { "code": "INSUFFICIENT_STOCK" } }
```
- Never leak raw DB errors or stack traces to the client.
- Error codes: `AUTH_INVALID_CREDENTIALS, AUTH_ACCOUNT_LOCKED, AUTH_SESSION_EXPIRED,
  AUTH_SESSION_REVOKED, AUTH_DEVICE_APPROVAL_REQUIRED, PERMISSION_DENIED,
  SHOP_ACCESS_DENIED, PRODUCT_NOT_FOUND, PRODUCT_ARCHIVED, BARCODE_ALREADY_EXISTS,
  INSUFFICIENT_STOCK, SALE_NOT_FOUND, SALE_ALREADY_VOIDED, RETURN_NOT_FOUND,
  RETURN_NOT_APPROVED, RETURN_QUANTITY_INVALID, REFUND_NOT_ALLOWED,
  EXCHANGE_NOT_ALLOWED, TRANSFER_INVALID_STATE, CURRENCY_RATE_NOT_SET,
  VALIDATION_ERROR`

---

## 9. Ambiguities Resolved (per SRS §27 / guideline: "flag, don't guess")

1. **New-device login approval channel.** Send an approval link by email to the
   account's verified email + allow fallback via TOTP/backup code, and log every
   attempt to `security_events`. Real push-to-trusted-device is Phase 2.
2. **Negative inventory toggle.** Store as a per-shop `shop_settings.allow_negative_stock`
   boolean, default `false`. Checkout always re-validates stock inside the DB
   transaction regardless of this flag.
3. **Return inventory routing.** `return_decisions` records a `condition` field
   (`SELLABLE` / `DAMAGED`) chosen by the approving admin; sellable → back to
   `inventory_balances` via `RETURN_SELLABLE`, damaged → tracked via
   `RETURN_DAMAGED` movement, never mixed into sellable quantity.
4. **Exchange payment difference.** Modeled as its own `exchange_payments` row
   (`direction`: `CUSTOMER_PAYS` / `REFUND_TO_CUSTOMER`).
5. **Backup/restore mechanics.** "Backup" = a scheduled `pg_dump` to object storage
   with a `backup_records` table logging status/size/checksum, downloadable by
   Super Admin only. Gate "restore" behind a documented CLI runbook until tested;
   wire the UI button in Phase 2.
6. **CAPTCHA provider.** Default to Cloudflare Turnstile unless infra already has a
   preferred provider.
7. **Currency system — system-wide switchable BDT/GBP.** One currency is active
   for the entire system at any time — never per-shop, never per-transaction
   choice. Settings has a switch action (Super Admin only, `settings.manage`)
   that converts every **current** product price using the exchange rate in
   effect at that moment. **Already-completed transactions never change** — every
  `Sale`, `Payment`, `Purchase`, `Refund`, and `ExchangePayment` snapshots its own `currency`
   at creation time and keeps it forever, exactly like the existing
  `productNameSnapshot`/`skuSnapshot` pattern on `sale_items`.
  (`Payment.currency` was added because payments are also money moved at a point
  in time and require their own immutable currency snapshot.)

   The switch operation, inside one DB transaction:
   1. Look up the current rate from `exchange_rates` for the target currency.
      If none exists, reject with `CURRENCY_RATE_NOT_SET` — never guess a rate.
   2. Update every `Product.sellingPrice`, `purchasePrice`, and `discount`
      (and any set `ProductVariant.priceOverride`), converted and rounded to 2
      decimals. Set `Product.currency` to the target currency.
   3. Update the `active_currency` key in `SystemSetting`.
   4. Write one `audit_logs` row (`action = "CURRENCY_SWITCH"`) with the rate used
      and count of products converted.
   5. Commit, or roll back entirely on any failure — no partially-converted state.

   Do **not** touch `sales`, `sale_items`, `purchases`, `purchase_items`,
   `refunds`, or `payments` during a switch — they keep their own snapshot.

   Required safeguards: a type-to-confirm UI step before calling the endpoint, an
   automatic backup triggered immediately before the switch runs, and a
   recommendation (in the runbook, not enforced in code for MVP) to run it during
   low-traffic hours.

   Reporting: once a switch has happened, historical sales exist in more than one
   currency. Never silently sum mismatched currencies into one total — group and
   subtotal by `currency`, or explicitly label converted figures as estimates.

   POS/checkout always operates in whatever the current active currency is — no
   currency choice at the point of sale, and receipts/legal documents always
   print in the currency the sale was actually made in (its own snapshot), never
   a converted figure.

8. **Known, deliberate deviation from the SRS's literal text: `Shop.currency`.**
   The original SRS lists currency as a per-shop field (its §3, Shop fields).
   Per an explicit client decision, currency is now a single system-wide
   setting instead (§9.7) — the `currency` field was removed from `Shop` in
   `schema.prisma`. This is intentional, not an oversight; don't "fix" it by
   adding currency back onto `Shop`.

9. **Schema additions made to close SRS gaps found on review**, before any
   code was written — these are part of the design, not optional extras:
   - `AuditLog.actorRole` / `AuditLog.deviceInfo` — the SRS's audit log
     section explicitly asks for role and device on every entry.
   - `NotificationPreference` — the SRS asks for per-type email/in-app
     notification toggles; this was in the SRS's own suggested table list
     but had been missed in earlier schema drafts.
   - `BackupCode.revokedAt` — distinguishes "revoked on regeneration" from
     "used", per the SRS's backup-code lifecycle requirements.
   - `Refund.processedById` — the SRS asks for the processing admin to be
     recorded directly on the refund, not just derivable via
     `ReturnDecision`.
   - `Expense` — the SRS's Profit/Loss report explicitly subtracts "other
     configured expenses"; there was nowhere to record those. Scoped to
     Phase 2 reporting, but the table exists now so Phase 2 isn't blocked
     rebuilding the schema later.
   - `Payment.currency` — added so payment records retain their creation-time
     currency snapshot like other historical financial records.
   - `TrustedDevice` has no direct relation to `User`; trusted devices are
     reached through `User.devices -> device.trusted`. The invalid redundant
     `User.trustedDevices` relation was removed.

---

## 10. Testing Checklist (before calling any phase "done")

Auth: wrong password, account lockout, expired session, revoked session,
unauthorized API call.
Authorization: shop user hitting an admin endpoint, user requesting another shop's
data by ID manipulation, unauthorized inventory adjustment, unauthorized return
approval.
Inventory: receive, sell, adjust, return, transfer, prevent negative stock (when
disabled), concurrent-sale race on the same variant.
Sales: normal sale, multi-item, insufficient stock, exact cash, cash with change,
digital payment, server recalculates totals independent of client-sent totals.
Returns: valid return, invalid sale reference, return qty exceeding sold qty,
approval, rejection, refund, exchange, refund/exchange rejected when return
isn't APPROVED yet.
Currency: switch with no rate set (must reject), switch with a valid rate
(product prices update, past sales unchanged), report correctly separates
pre-/post-switch currencies.
Auth lifecycle: backup code marked used on redemption, old backup codes
marked revoked (not silently deleted) on regeneration, audit log entries
carry the correct actor role and device info.
Data integrity: FK constraints, unique barcode, unique `(shop_id, product_variant_id)`
balance, rollback on mid-transaction failure, historical sale snapshots survive
product edits/archival/currency switches.

---

## 11. Non-Negotiable Rules (still binding)

Do not skip agreed SRS requirements without flagging them here first. Do not trust
client-side authorization or money/stock calculations. Do not update stock without a
movement record. Do not run multi-step financial/inventory operations outside a DB
transaction. Do not physically delete auditable historical records. Do not store
secrets/passwords/backup codes in plaintext. Do not create giant monolithic
services/components. Do not sacrifice data integrity for UI polish. Do not let the
currency-switch operation touch any historical transaction record. Keep the system
modular, typed, documented, and reusable — a new developer should be able to trace a
sale to its payment and inventory movements without asking you.
