# Multi-Store Retail ERP & POS

Modular monolith: Next.js 15 (`apps/web`) + NestJS (`apps/api`) + Prisma + PostgreSQL 16 + Redis 7.

Binding spec: `docs/AGENT_GUIDELINE.md`. Schema: `apps/api/prisma/schema.prisma`.

## Quick start

1. Copy `.env.example` to `.env`.
2. `docker compose up -d postgres redis minio`
3. `npm install`
4. `npm run db:migrate` (or `npx prisma migrate dev` in `apps/api`)
5. `npm run db:seed`
6. `npm run dev:api` and `npm run dev:web`

Default Super Admin: `admin@erp.local` / `ChangeMeNow!123`  
Swagger: http://localhost:4000/api/docs

## Shop isolation

Every shop-scoped query is filtered by `user_shops`. Request `shopId` is never trusted until it matches the authenticated user's assignments.

## Money and stock

Amounts are `Decimal(12,2)`, quantities `Decimal(12,3)`. Stock changes only through `InventoryLedgerService`, which writes `stock_movements` in the same transaction.
