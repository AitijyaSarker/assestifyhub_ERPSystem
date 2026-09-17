# Cloud Deployment Guide: Multi-Store Retail ERP & POS

This guide walks you through deploying the complete production system to cloud managed services:
- **Frontend**: Next.js 15 web application on **Vercel**.
- **Backend API**: NestJS REST API on **Railway** (or **Render**).
- **Database & Cache**: Managed **PostgreSQL 16+** and **Redis 7+** on **Railway** (or **Render**).

---

## Architecture Overview

```
                        ┌──────────────────────────────┐
                        │      Customer / Staff        │
                        └──────────────┬───────────────┘
                                       │ HTTPS
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                      Vercel Edge Network                            │
    │  Next.js 15 Web Application (POS, Admin Dashboard, Reports)         │
    │  URL: https://erp-pos.vercel.app                                   │
    └──────────────────────────────────┬──────────────────────────────────┘
                                       │ HTTPS + JWT/Session Cookies
                                       │ (NEXT_PUBLIC_API_URL)
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                   Railway / Render Cloud Platform                   │
    │                                                                     │
    │   ┌─────────────────────────────────────────────────────────────┐   │
    │   │               NestJS REST API (Port 4000)                   │   │
    │   │   • Endpoints: /api/v1/*                                    │   │
    │   │   • Swagger UI: /api/docs                                   │   │
    │   │   • Automated Prisma migration & idempotent seeding         │   │
    │   │   URL: https://erp-api-production.up.railway.app           │   │
    │   └──────────────────────┬───────────────────────┬──────────────┘   │
    │                          │                       │                  │
    │                          ▼                       ▼                  │
    │           ┌────────────────────────────┐  ┌───────────────────┐     │
    │           │ Managed PostgreSQL 16+     │  │ Managed Redis 7+  │     │
    │           │ (Isolated Shop & Inventory)│  │ (Session & Cache) │     │
    │           └────────────────────────────┘  └───────────────────┘     │
    └─────────────────────────────────────────────────────────────────────┘
```

---

## Option A: Deploying Backend to Railway (Recommended)

Railway is recommended because it deploys PostgreSQL, Redis, and the Dockerized NestJS API in a single visual dashboard with internal networking.

### Step 1: Create a Railway Project
1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Select `AitijyaSarker/assestifyhub_ERPSystem`.

### Step 2: Provision Database & Redis
1. In your Railway project canvas, click **New** $\rightarrow$ **Database** $\rightarrow$ **Add PostgreSQL**.
2. Click **New** $\rightarrow$ **Database** $\rightarrow$ **Add Redis**.

### Step 3: Configure API Service
1. Click on the web service created from your GitHub repo.
2. Go to **Settings**:
   - **Build**: Set **Builder** to `Dockerfile`.
   - **Dockerfile Path**: `docker/api.Dockerfile`.
3. Go to **Variables** and add:
   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   API_PORT=4000
   API_PREFIX=api/v1
   NODE_ENV=production
   COOKIE_SECURE=true
   CSRF_ENABLED=true
   JWT_ACCESS_SECRET=<generate-a-32-char-random-string>
   JWT_REFRESH_SECRET=<generate-a-32-char-random-string>
   JWT_ACCESS_EXPIRES=15m
   JWT_REFRESH_EXPIRES_DAYS=7
   SESSION_IDLE_TIMEOUT_MINUTES=60
   SUPER_ADMIN_EMAIL=admin@yourcompany.com
   SUPER_ADMIN_PASSWORD=SetAStrongPassword123!
   SEED_SHOP_CODE=HQ01
   SEED_SHOP_NAME=Headquarters
   FRONTEND_ORIGIN=https://<your-vercel-app>.vercel.app
   ```
4. Go to **Networking** $\rightarrow$ Click **Generate Domain**.
   - Note the generated domain (e.g. `https://erp-api-production.up.railway.app`).

---

## Option B: Deploying Backend to Render (Using Blueprint)

The repository includes a ready-to-use `render.yaml` blueprint.

1. Go to [render.com](https://render.com) and log in.
2. Click **New +** $\rightarrow$ **Blueprint**.
3. Connect `AitijyaSarker/assestifyhub_ERPSystem`.
4. Render automatically parses `render.yaml` and sets up:
   - Database: `erp-pos-db` (PostgreSQL)
   - Cache: `erp-pos-redis` (Redis)
   - Web Service: `erp-pos-api` (Docker build via `docker/api.Dockerfile`)
5. Enter your `SUPER_ADMIN_PASSWORD` and `FRONTEND_ORIGIN` in the prompt, then click **Apply**.
6. Copy your public API URL once the service is live.

---

## Step 4: Deploying Frontend to Vercel

The repository includes a `vercel.json` configured specifically for this Next.js monorepo.

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import `AitijyaSarker/assestifyhub_ERPSystem`.
4. In the **Configure Project** screen:
   - **Framework Preset**: Next.js (automatically detected)
   - **Root Directory**: Leave as `./` (the root `vercel.json` routes builds into `apps/web`)
5. Open **Environment Variables** and add:
   ```env
   NEXT_PUBLIC_API_URL=https://<your-api-url>/api/v1
   ```
   *(Replace `<your-api-url>` with your Railway or Render API URL, e.g. `https://erp-api-production.up.railway.app`)*
6. Click **Deploy**.

---

## Step 5: Post-Deployment Verification

### 1. Check API Health
Open in your browser:
```
https://<your-api-url>/api/v1/health
```
**Expected response**:
```json
{
  "success": true,
  "message": "Operation completed",
  "data": {
    "status": "ok"
  }
}
```

### 2. View API Docs (Swagger)
Open:
```
https://<your-api-url>/api/docs
```
Swagger UI will display all available REST endpoints with interactive documentation.

### 3. Log In on the Frontend
1. Navigate to your Vercel deployment URL: `https://<your-vercel-app>.vercel.app/login`.
2. Log in with the credentials set during backend deployment:
   - **Email**: `admin@yourcompany.com` (or `admin@erp.local`)
   - **Password**: Your configured `SUPER_ADMIN_PASSWORD`
3. The Super Admin dashboard will load with:
   - Real-time stock alerts
   - Shop switcher
   - POS terminal link
   - Product and stock transfer management

---

## Production Security & Best Practices

1. **Custom Apex Domains (Recommended)**:
   For seamless cross-subdomain cookie handling, configure:
   - Frontend: `https://app.yourdomain.com`
   - Backend API: `https://api.yourdomain.com`
   - Set backend `COOKIE_DOMAIN=.yourdomain.com`.
2. **Rotating Secrets**:
   Never use development secrets in production. Ensure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are unique, cryptographically random strings (`openssl rand -base64 32`).
3. **Automated Migrations**:
   The Dockerfile runs `prisma migrate deploy` and `seed.ts` automatically on container start. Any future migrations pushed to GitHub will run seamlessly on next deployment.
