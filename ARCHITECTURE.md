# ARCHITECTURE

**Project:** Milk-Reporting  
**Description:** Private Agency Marketing Data & Reporting Platform  
**Target Environment:** Next.js 14+ (App Router), Supabase PostgreSQL, Vercel Deployment  

---

## 1. High-Level Architecture Overview

Milk-Reporting follows a **Data-First, Dashboard-Second, AI-Third** architectural design.
It separates data ingestion from metric definitions, reporting queries, layout rendering, and AI diagnostics.

```
+-----------------------------------------------------------------------------------+
|                                MARKETING PLATFORMS                                |
|          Meta Ads  |  Facebook Pages  |  Instagram  |  Google Ads  |  TikTok Ads   |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                                DATA INGESTION LAYER                               |
|        Airbyte Connectors (Daily Scheduled)  +  Native Graph API Connectors       |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                           POSTGRESQL / SUPABASE DATABASE                          |
|    - RAW LANDING (JSONB)                                                          |
|    - NORMALIZED REPORTING (paid_daily_metrics, organic_daily_metrics)              |
|    - METRIC CATALOG (definitions, formulas, categories)                           |
|    - SYSTEM TABLES (agencies, clients, credentials, dashboards, widgets)          |
|    - ROW LEVEL SECURITY (RLS)                                                     |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                            QUERY & REPORTING ENGINE LAYER                         |
|   Server-side aggregation, filter handling, date-range overrides, safe formula    |
|   evaluations, period-over-period comparisons.                                     |
+------------------------------------------+----------------------------------------+
                                           |
                   +-----------------------+-----------------------+
                   |                                               |
                   v                                               v
+-------------------------------------+         +-----------------------------------+
|      DASHBOARD BUILDER UI LAYER     |         |         READ-ONLY AI ANALYST      |
|  - LobsterBoard UX pattern (React)   |         |  - Anomaly detection              |
|  - Drag & Drop snap grid layout     |         |  - Diagnostic insights            |
|  - Widget Configuration Drawer      |         |  - Structured summaries           |
|  - Custom Theme (Milk Aesthetic)    |         |  (FACT -> REASON -> RECOMMEND)    |
+-------------------------------------+         +-----------------------------------+
```

---

## 2. Technical Stack & Deployment Constraints

* **Frontend & Server Engine:** Next.js 14+ (React Server Components, App Router, Route Handlers).
* **Database & Auth:** Supabase PostgreSQL with Row Level Security (RLS) & Supabase Auth.
* **Grid & Drag-and-Drop:** `react-grid-layout` + HTML5 DnD (replicating LobsterBoard grid snapping and layout mechanics natively in React).
* **Data Visualization:** Recharts / Tremor / Chart.js configured with Milk custom design palette.
* **Deployment Target:** Vercel (Serverless Edge & Node functions). Zero local disk storage dependencies; all state persists to Supabase PostgreSQL.

---

## 3. Visual Design System: "Milk Network Aesthetic"

Inspired by [milknetwork.com](https://milknetwork.com/):

```
+-----------------------------------------------------------------------+
|  BACKGROUND: #FAF9F6 (Off-white / Warm Canvas)                        |
|  TEXT:       #111111 (High-contrast obsidian black)                   |
|  ACCENT:     #FFE600 (Milk Vibrant Yellow)                            |
|  BORDER:     #E2E2DF (Subtle thin rule)                               |
|  CARD BG:    #FFFFFF (Pure White)                                     |
|  MUTED TEXT: #666666 (Neutral Charcoal)                               |
+-----------------------------------------------------------------------+
```

### Visual Characteristics
1. **Typography:** Bold sans-serif typography (`Inter` / `Outfit` / `Space Grotesk`) with strong editorial hierarchy.
2. **Layout & Grid:** Clean rectangular cards, crisp 1px borders (`border-neutral-200`), generous whitespace padding (p-6/p-8), zero unnecessary card roundedness (max `rounded-none` or `rounded-sm`).
3. **No SaaS Clichés:** Zero purple gradients, zero glowing glassmorphism effects, zero floating soft drop-shadows. High-contrast typography and clear metric numbers.
4. **Isolated Theme Engine:** The visual aesthetic is applied strictly via CSS variables and design tokens (`index.css` / Tailwind tokens), ensuring widget logic and grid code are 100% decoupled from styling.

---

## 4. Layer Independence & Separation of Concerns

1. **Ingestion Layer:** Ingests platform payloads into `raw_landings` and `normalized_*` PostgreSQL tables. Ingestion code has zero knowledge of dashboards or UI widgets.
2. **Database & Metric Catalog Layer:** Defines raw fields and metric formulas. Zero UI code. Exposes PostgreSQL views and server query interfaces.
3. **Reporting Query Engine:** Serves aggregation queries for date ranges, account filters, and metric breakdowns. Never makes live external API calls during page views.
4. **Dashboard Engine:** Manages layout grids, drag-and-drop state, widget options, and renders configured visualization controls.
5. **AI Analyst Layer:** Optional read-only LLM service taking structured JSON reporting payloads and returning diagnostic cards. Never alters data or bid settings.

---

## 5. Security & Multi-Tenancy Architecture

* **Agency Administration:** Full platform access to manage clients, credentials, data connectors, metric catalogs, global templates, and dashboards.
* **Client Access Isolation:** Client users log in via Supabase Auth. Row Level Security (RLS) policies enforce `client_id` checks on every database table.
* **Credential Vaulting:** Platform OAuth tokens and API secrets are encrypted at rest using Supabase Secrets Vault / Vault functions, accessible exclusively through serverless Node route handlers. Never exposed to browser bundle.
