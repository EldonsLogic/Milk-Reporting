# VERCEL & SUPABASE PRODUCTION DEPLOYMENT GUIDE

**Project:** Milk-Reporting  
**Target Platform:** Vercel (Next.js 14 Serverless + Vercel Crons)  
**Database:** Supabase PostgreSQL  
**Date:** August 17, 2026  

---

## 1. Prerequisites

Before deploying to Vercel, ensure you have:

1. A **Vercel Account** (https://vercel.com).
2. A **Supabase Project** (https://supabase.com).
3. The **Vercel CLI** installed locally (`npm i -g vercel`).

---

## 2. Step 1: Database Migration on Supabase

1. Log into your **Supabase Dashboard** and open your project's **SQL Editor**.
2. Copy the full PostgreSQL DDL from [`DATABASE_SCHEMA.md`](file:///Users/eldon/Documents/Milk-Reporting/DATABASE_SCHEMA.md).
3. Paste and run the SQL script in Supabase. This creates:
   - `agencies`, `clients`, `client_users` tenant tables.
   - `platform_connections` credential storage.
   - `metric_catalog` normalized catalog table.
   - `paid_daily_metrics` & `organic_daily_metrics` performance tables.
   - `dashboards`, `dashboard_pages`, `dashboard_widgets`, `dashboard_templates` layout tables.
   - Supabase Row Level Security (RLS) policies.

---

## 3. Step 2: Configure Environment Variables in Vercel

In your Vercel Project Settings under **Environment Variables**, add the keys defined in [`.env.example`](file:///Users/eldon/Documents/Milk-Reporting/.env.example):

* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`
* `SUPABASE_SERVICE_ROLE_KEY`
* `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`
* `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`
* `TIKTOK_ACCESS_TOKEN`

---

## 4. Step 3: Deploy via Vercel CLI or GitHub

### Option A: Deploy using Vercel CLI
Run the following commands in the project root:

```bash
# Link project to Vercel
vercel link

# Deploy to production
vercel --prod
```

### Option B: Deploy via GitHub Integration
1. Push your repository to your private agency GitHub organization.
2. In Vercel, click **Import Project** and select the `Milk-Reporting` repository.
3. Vercel will automatically detect `vercel.json` and deploy.

---

## 5. Step 4: Verify Scheduled Daily Data Ingestion

Milk-Reporting uses **Vercel Crons** declared in [`vercel.json`](file:///Users/eldon/Documents/Milk-Reporting/vercel.json):

```json
"crons": [
  {
    "path": "/api/ingest",
    "schedule": "0 6 * * *"
  }
]
```

- Every day at **06:00 UTC**, Vercel automatically triggers `/api/ingest` to execute daily data synchronization across Meta Ads, Google Ads, TikTok Ads, Facebook Pages, and Instagram Business.
- You can inspect execution logs in your Vercel Dashboard under **Project -> Crons**.

---

## 6. Security Checklist

- [x] All platform API secrets and OAuth tokens are stored in server-side environment variables and encrypted database tables.
- [x] Client access is isolated via Supabase Row Level Security (RLS).
- [x] API routes enforce HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`).
