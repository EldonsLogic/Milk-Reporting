# REPOSITORY AUDIT

**Project:** Milk-Reporting (Private Digital Marketing Agency Data & Dashboard Platform)  
**Date:** August 17, 2026  
**Auditor:** Antigravity AI Engineering Team  

---

## 1. Executive Summary

This repository audit evaluates 9 key reference repositories identified for building Milk-Reporting. The primary objective is to select architectural patterns, data models, connector strategies, and UI paradigms while preventing bloated dependencies, licensing violations, or Frankenstein codebase architecture.

---

## 2. Comprehensive Repository Evaluations

### A. LobsterBoard
* **Repository:** `Curbob/LobsterBoard` (https://github.com/Curbob/LobsterBoard)
* **Primary Purpose:** Visual drag-and-drop dashboard builder foundation.
* **1. Problem Solved:** Provides a fast, self-hosted, drag-and-drop grid dashboard editor with widget snapping, resizing, widget configuration, and persistence.
* **2. Exact Functionality to Reuse:** Grid layout mechanics (column snap, resize handles), widget registry architecture, widget editing modal flow, dashboard page tabs, duplicate dashboard workflow, dashboard template schema.
* **3. Direct Code Reuse?** **NO.** LobsterBoard is written in vanilla JavaScript (no build step, single Node.js server) and uses BSL-1.1 license. Direct source copy into a commercial agency software product would violate BSL-1.1 without a commercial license, and vanilla JS is incompatible with Next.js/React SPA architecture.
* **4. License:** **BSL-1.1 (Business Source License 1.1)**. Permits non-commercial use, but commercial use (including internal use by a commercial digital marketing agency servicing clients) requires licensing or clean concept replication using permissively licensed tools.
* **5. What Should NOT Be Imported:** Vanilla Node.js backend (`server.cjs`), homelab/system monitoring widgets (CPU, RAM, OpenClaw, weather, etc.), vanilla JS DOM manipulation scripts.
* **6. Dependencies Introduced:** If replicated cleanly using open-source libraries: `react-grid-layout` or `@dnd-kit/core` + `lucide-react`.
* **7. Next.js/Vercel/Supabase Compatibility:** Replicating the concept using React (`react-grid-layout` / Next.js) is 100% Vercel and Supabase compatible.
* **8. Better to Integrate or Replicate Concept?** **Replicate Concept.** Build a React-native dashboard engine matching LobsterBoard's UX and grid behavior while storing layouts in Supabase.
* **9. Smallest Useful Piece Needed:** Grid layout state engine (`x, y, w, h`), widget configuration drawer, grid snapping mechanics, dashboard layout JSON schema.

---

### B. Airbyte
* **Repository:** `airbytehq/airbyte` (https://github.com/airbytehq/airbyte)
* **Primary Purpose:** Scheduled Data Ingestion Layer.
* **1. Problem Solved:** Standardized ELT ingestion from ad platforms (Meta Ads, Google Ads, TikTok Ads) into destination databases (PostgreSQL / Supabase) with sync scheduling, pagination, and incremental sync.
* **2. Exact Functionality to Reuse:** Pre-built connector specifications and schemas for Meta Ads, Google Ads, and TikTok Ads.
* **3. Direct Code Reuse?** **NO (Infrastructure tool).** Use Airbyte Open Source / PyAirbyte or running Airbyte containers, or Airbyte Cloud API.
* **4. License:** **ELv2 (Elastic License v2)** / **MIT** for many connectors.
* **5. What Should NOT Be Imported:** Airbyte UI, Airbyte Java server code into our Next.js repository.
* **6. Dependencies Introduced:** None in the Next.js app (Airbyte runs as an external service or via scheduled webhook/PyAirbyte worker).
* **7. Next.js/Vercel/Supabase Compatibility:** Fully compatible. Airbyte writes directly to Supabase PostgreSQL; Next.js queries Supabase.
* **8. Better to Integrate or Replicate Concept?** **Integrate via Database Destination.** Airbyte syncs into Supabase schema; native API fallback connectors handle missing organic social endpoints (e.g. IG Reels/Stories detailed stats).
* **9. Smallest Useful Piece Needed:** Airbyte Meta Ads, Google Ads, and TikTok Ads source connectors writing to Supabase raw landing tables.

---

### C. Advertising Analytics Dashboard
* **Repository:** `Neilsmahajan/advertisinganalyticsdashboard` (https://github.com/Neilsmahajan/advertisinganalyticsdashboard)
* **Primary Purpose:** Agency reporting reference architecture.
* **1. Problem Solved:** Multitenant advertising reporting platform aggregating Google Ads, Meta Ads, and Google Analytics data for agency client reporting.
* **2. Exact Functionality to Reuse:** Multi-client account hierarchy pattern, Next.js + PostgreSQL structure, OAuth token management workflows, agency PDF export patterns.
* **3. Direct Code Reuse?** **Selective snippet adaptation.**
* **4. License:** **MIT License.**
* **5. What Should NOT Be Imported:** Microsoft Ads integration, website tracking tag detector, hard-coded dashboard cards.
* **6. Dependencies Introduced:** Minimal (standard Next.js / TypeScript / Postgres stack).
* **7. Next.js/Vercel/Supabase Compatibility:** 100% Compatible.
* **8. Better to Integrate or Replicate Concept?** **Replicate concepts & adapt snippets.**
* **9. Smallest Useful Piece Needed:** Agency client tenant structure (`agency -> clients -> ad_accounts`) and multi-platform OAuth credential storage pattern.

---

### D. Social Stats
* **Repository:** `cbsshekhawat18-lab/social-stats-social-media-manager` (https://github.com/cbsshekhawat18-lab/social-stats-social-media-manager)
* **Primary Purpose:** Organic social media reporting reference.
* **1. Problem Solved:** Ingesting and reporting organic Facebook and Instagram metrics (posts, reels, page metrics, account reach, engagement).
* **2. Exact Functionality to Reuse:** Meta Graph API query definitions for organic Facebook Pages and Instagram Business Accounts, post performance aggregation formulas.
* **3. Direct Code Reuse?** **No (Django/Python backend), extract Graph API schemas & parameters.**
* **4. License:** **MIT License.**
* **5. What Should NOT Be Imported:** Django backend, WhatsApp bot builder, unified inbox, post scheduling system, publishing workflows.
* **6. Dependencies Introduced:** None.
* **7. Next.js/Vercel/Supabase Compatibility:** Fully compatible when reimplemented in TypeScript server functions.
* **8. Better to Integrate or Replicate Concept?** **Replicate API fetchers and schema definitions.**
* **9. Smallest Useful Piece Needed:** Instagram organic Graph API query mappings (`/insights`, `media`, `reels_insights`, `stories_insights`).

---

### E. AutoPost
* **Repository:** `aialvi/autopost` (https://github.com/aialvi/autopost)
* **Primary Purpose:** Next.js application architecture & platform adapter separation reference.
* **1. Problem Solved:** Modular Next.js 15 application separating platform connectors, database access (Drizzle ORM), and AI recommendations.
* **2. Exact Functionality to Reuse:** Platform adapter pattern (decoupling platform fetching logic from application business logic), clean TypeScript interface boundaries.
* **3. Direct Code Reuse?** **Architectural layout and adapter interfaces.**
* **4. License:** **MIT / Open Source.**
* **5. What Should NOT Be Imported:** E-commerce integrations, Shopify COGS calculators, Telegram bots, Snapchat ads, autonomous ad budget changers, P&L modules.
* **6. Dependencies Introduced:** Drizzle ORM / Supabase client patterns.
* **7. Next.js/Vercel/Supabase Compatibility:** 100% Compatible (built natively for Vercel/Next.js/PostgreSQL).
* **8. Better to Integrate or Replicate Concept?** **Replicate architectural adapter pattern.**
* **9. Smallest Useful Piece Needed:** The `PlatformAdapter` TypeScript interface and service provider pattern.

---

### F. Fivetran dbt Ad Reporting
* **Repository:** `fivetran/dbt_ad_reporting` (https://github.com/fivetran/dbt_ad_reporting)
* **Primary Purpose:** Cross-platform marketing data model reference.
* **1. Problem Solved:** Standardizing ad performance data across Meta, Google Ads, TikTok Ads, and LinkedIn Ads into normalized reporting tables (`account_report`, `campaign_report`, `ad_group_report`, `ad_report`).
* **2. Exact Functionality to Reuse:** Column naming conventions, dimension hierarchy, cross-platform metric normalization standards.
* **3. Direct Code Reuse?** **Schema design reference only.**
* **4. License:** **Apache-2.0 License.**
* **5. What Should NOT Be Imported:** dbt transformations, Snowflake/BigQuery SQL dialects, dbt CLI pipeline runners.
* **6. Dependencies Introduced:** None (we execute normalization via PostgreSQL view/SQL functions in Supabase).
* **7. Next.js/Vercel/Supabase Compatibility:** 100% Compatible with PostgreSQL DDL.
* **8. Better to Integrate or Replicate Concept?** **Replicate normalization schema in PostgreSQL.**
* **9. Smallest Useful Piece Needed:** The cross-platform table definitions (`unified_daily_ad_performance`, `unified_campaigns`).

---

### G. Mureo
* **Repository:** `logly/mureo` (https://github.com/logly/mureo)
* **Primary Purpose:** AI analysis reference (read-only diagnostic layer).
* **1. Problem Solved:** AI ad operations framework performing structured diagnostics and trend analysis without executing unauthorized campaign edits.
* **2. Exact Functionality to Reuse:** Structured AI output template (FACT -> INTERPRETATION -> POSSIBLE EXPLANATION -> RECOMMENDATION) and read-only context builder.
* **3. Direct Code Reuse?** **Prompt templates and structured schema adapters.**
* **4. License:** **MIT License.**
* **5. What Should NOT Be Imported:** Autonomous write actions, automated bid adjusters, local CLI execution runners.
* **6. Dependencies Introduced:** `@google/genai` or Vercel AI SDK.
* **7. Next.js/Vercel/Supabase Compatibility:** 100% Vercel serverless compatible.
* **8. Better to Integrate or Replicate Concept?** **Replicate prompt structures and read-only AI agent pattern.**
* **9. Smallest Useful Piece Needed:** Structured diagnostic prompt builder feeding JSON data to LLM.

---

### H. Full-Funnel AI Analytics
* **Repository:** `eduardocornelsen/full-funnel-ai-analytics` (https://github.com/eduardocornelsen/full-funnel-ai-analytics)
* **Primary Purpose:** Metric governance and semantic metric catalog reference.
* **1. Problem Solved:** Enforces single metric definitions across platforms so derived metrics (CTR, ROAS, CPA, Engagement Rate) are computed consistently.
* **2. Exact Functionality to Reuse:** Metric Catalog schema structure (Metric ID, Name, Description, Type, Category, Platform, Raw Field, Safe Formula).
* **3. Direct Code Reuse?** **Catalog metadata definitions.**
* **4. License:** **MIT License.**
* **5. What Should NOT Be Imported:** dbt MetricFlow runtime, heavy Python semantic parsing server, XGBoost lead scoring pipelines.
* **6. Dependencies Introduced:** None (Metric Catalog stored in Supabase table / JSON file).
* **7. Next.js/Vercel/Supabase Compatibility:** 100% Compatible.
* **8. Better to Integrate or Replicate Concept?** **Replicate Metric Catalog structure in PostgreSQL & TypeScript.**
* **9. Smallest Useful Piece Needed:** Metric catalog definition JSON schema and zero-safe formula evaluator.

---

### I. Meta Ads Open CLI
* **Repository:** `Bin-Huang/meta-ads-open-cli` (https://github.com/Bin-Huang/meta-ads-open-cli)
* **Primary Purpose:** Meta Graph & Marketing API capability reference tool.
* **1. Problem Solved:** Fast inspection and querying of Meta ad accounts, campaigns, creatives, and insight breakdowns.
* **2. Exact Functionality to Reuse:** Meta API endpoint parameter mappings, breakdowns list, creative field lists.
* **3. Direct Code Reuse?** **No (CLI tool), reference for API query parameters.**
* **4. License:** **MIT License.**
* **5. What Should NOT Be Imported:** CLI terminal interface, Python CLI wrapper.
* **6. Dependencies Introduced:** None.
* **7. Next.js/Vercel/Supabase Compatibility:** 100% Compatible.
* **8. Better to Integrate or Replicate Concept?** **Reference API parameters for native Meta API fallback connector.**
* **9. Smallest Useful Piece Needed:** API breakdown parameter list (`publisher_platform`, `device_platform`, `age`, `gender`, `country`, `impression_device`).

---

## 3. Summary Division of Responsibility

| Component | Selected Foundation / Reference | Action in Milk-Reporting |
| :--- | :--- | :--- |
| **Dashboard Builder** | LobsterBoard | Replicate drag & drop grid engine in React using `react-grid-layout` + Tailwind/Milk aesthetic |
| **Data Ingestion** | Airbyte + Native Fallbacks | Airbyte for core ad streams; native Next.js API connectors for IG Reels/Stories |
| **Agency Reporting** | Advertising Analytics Dashboard | Replicate client tenant hierarchy & multi-account credential management |
| **Organic Social** | Social Stats | Replicate Graph API queries for FB Pages, IG Accounts, Posts, Reels, Stories |
| **Platform Adapters** | AutoPost | Replicate clean TypeScript adapter interface pattern (`PlatformAdapter`) |
| **Data Normalization** | Fivetran dbt Ad Reporting | Replicate unified database schema (`unified_daily_performance`, `unified_campaigns`) |
| **AI Analyst Layer** | Mureo | Replicate read-only diagnostic prompt format (Fact -> Interpretation -> Recommendation) |
| **Metric Governance** | Full-Funnel AI Analytics | Replicate centralized Metric Catalog with 8 categories & zero-safe formulas |
| **Meta API Verification**| Meta Ads Open CLI | Reference for query parameter, creative, and breakdown fields |
