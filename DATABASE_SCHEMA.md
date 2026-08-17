# PROPOSED DATABASE SCHEMA

**Project:** Milk-Reporting  
**Engine:** PostgreSQL / Supabase  
**Date:** August 17, 2026  

---

## 1. Schema Design Principles

1. **Multi-Tenancy via RLS:** All client-facing tables contain a `client_id` reference guarded by Supabase Row Level Security (RLS).
2. **Dual-Layer Architecture (Raw + Normalized):**
   - Raw JSON payloads from Airbyte & Graph API are retained in `raw_api_landings` to preserve platform-specific fields.
   - Standardized daily performance metrics are extracted into indexed `paid_daily_metrics` and `organic_daily_metrics` tables.
3. **Metric Governance:** Derived metrics are defined in `metric_catalog` with safe zero-division formulas.
4. **Dashboard Persistence:** Layout grids, widget settings, and templates are stored as structured JSONB documents.

---

## 2. PostgreSQL DDL Specification

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================================================================
-- 1. AGENCY & CLIENT TENANT MANAGEMENT
-- ==================================================================

CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agency_id, slug)
);

CREATE TABLE client_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References auth.users(id) in Supabase
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer', -- 'viewer', 'editor', 'admin'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, client_id)
);

-- ==================================================================
-- 2. PLATFORM CONNECTIONS & CREDENTIALS
-- ==================================================================

CREATE TABLE platform_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'meta', 'google_ads', 'tiktok_ads'
    connection_type VARCHAR(50) NOT NULL, -- 'paid_ads', 'organic_social'
    account_name VARCHAR(255) NOT NULL,
    external_account_id VARCHAR(255) NOT NULL,
    encrypted_credentials JSONB NOT NULL, -- Access token, refresh token, developer token
    sync_status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'error'
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, platform, external_account_id)
);

-- ==================================================================
-- 3. METRIC CATALOG TABLE
-- ==================================================================

CREATE TABLE metric_catalog (
    id VARCHAR(100) PRIMARY KEY, -- e.g., 'meta_reach', 'calc_ctr'
    display_name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL, -- 'meta', 'google_ads', 'tiktok_ads', 'cross_platform'
    category VARCHAR(100) NOT NULL, -- 'Media Delivery', 'Traffic', 'Video', 'Engagement', 'Social Audience', 'Content', 'Conversion', 'Value'
    metric_type VARCHAR(50) NOT NULL, -- 'integer', 'currency', 'percentage', 'duration', 'ratio'
    source_field VARCHAR(255),
    is_derived BOOLEAN DEFAULT FALSE,
    formula TEXT, -- Formula string for safe evaluation, e.g. "clicks / NULLIF(impressions, 0) * 100"
    description TEXT,
    is_default_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- 4. RAW DATA LANDING TABLE (UNTRUNCATED PLATFORM STORAGE)
-- ==================================================================

CREATE TABLE raw_api_landings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    stream_name VARCHAR(100) NOT NULL, -- 'insights', 'organic_posts', 'reels', 'stories'
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB NOT NULL
);

-- ==================================================================
-- 5. NORMALIZED PAID MARKETING PERFORMANCE
-- ==================================================================

CREATE TABLE paid_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    account_name VARCHAR(255),
    campaign_id VARCHAR(255) NOT NULL,
    campaign_name VARCHAR(255),
    campaign_objective VARCHAR(100),
    adset_id VARCHAR(255),
    adset_name VARCHAR(255),
    ad_id VARCHAR(255),
    ad_name VARCHAR(255),
    
    -- Media Delivery
    spend NUMERIC(14, 4) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    reach BIGINT DEFAULT 0,
    frequency NUMERIC(8, 4) DEFAULT 0,
    
    -- Traffic
    clicks BIGINT DEFAULT 0,
    link_clicks BIGINT DEFAULT 0,
    landing_page_views BIGINT DEFAULT 0,
    
    -- Video
    video_views BIGINT DEFAULT 0,
    video_3s_views BIGINT DEFAULT 0,
    thruplays BIGINT DEFAULT 0,
    video_completions BIGINT DEFAULT 0,
    video_avg_watch_time NUMERIC(10, 2) DEFAULT 0,
    
    -- Engagement
    post_engagements BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    
    -- Conversion & Value
    conversions NUMERIC(12, 2) DEFAULT 0,
    leads BIGINT DEFAULT 0,
    purchases BIGINT DEFAULT 0,
    conversion_value NUMERIC(14, 4) DEFAULT 0,
    
    -- Platform Specific Extra Metrics
    custom_metrics JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, platform, date, campaign_id, adset_id, ad_id)
);

CREATE INDEX idx_paid_daily_client_date ON paid_daily_metrics(client_id, date);
CREATE INDEX idx_paid_daily_platform ON paid_daily_metrics(platform);

-- ==================================================================
-- 6. NORMALIZED ORGANIC SOCIAL PERFORMANCE
-- ==================================================================

CREATE TABLE organic_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'facebook_page', 'instagram_business'
    date DATE NOT NULL,
    
    -- Social Audience
    total_followers BIGINT DEFAULT 0,
    followers_gained BIGINT DEFAULT 0,
    followers_lost BIGINT DEFAULT 0,
    profile_visits BIGINT DEFAULT 0,
    accounts_reached BIGINT DEFAULT 0,
    accounts_engaged BIGINT DEFAULT 0,
    
    -- Content Performance (Aggregated Daily)
    post_impressions BIGINT DEFAULT 0,
    post_reach BIGINT DEFAULT 0,
    post_engagements BIGINT DEFAULT 0,
    reel_views BIGINT DEFAULT 0,
    story_views BIGINT DEFAULT 0,
    
    custom_metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, platform, date)
);

CREATE TABLE organic_content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    external_content_id VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'post', 'reel', 'story', 'carousel', 'video'
    caption TEXT,
    media_url TEXT,
    permalink TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    
    -- Performance Snapshot
    reach BIGINT DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,
    video_views BIGINT DEFAULT 0,
    avg_watch_time NUMERIC(10, 2) DEFAULT 0,
    
    raw_insights JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, platform, external_content_id)
);

-- ==================================================================
-- 7. DASHBOARDS, PAGES, WIDGETS & TEMPLATES
-- ==================================================================

CREATE TABLE dashboard_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'Executive', 'Brand Awareness', 'Lead Gen', 'Social', 'Paid Media'
    description TEXT,
    template_structure JSONB NOT NULL, -- JSON definition of pages and widgets
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    global_date_range VARCHAR(50) DEFAULT 'last_30_days',
    global_filters JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboard_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES dashboard_pages(id) ON DELETE CASCADE,
    widget_type VARCHAR(50) NOT NULL, -- 'kpi_card', 'line_chart', 'bar_chart', 'table', etc.
    title VARCHAR(255) NOT NULL,
    
    -- Grid Positioning (LobsterBoard compatible layout specs)
    grid_x INT NOT NULL DEFAULT 0,
    grid_y INT NOT NULL DEFAULT 0,
    grid_w INT NOT NULL DEFAULT 4,
    grid_h INT NOT NULL DEFAULT 3,
    
    -- Widget Data Configuration
    data_config JSONB NOT NULL, -- Platform, metric_ids, breakdowns, date_range_override, filters
    
    -- Widget Display Options
    display_config JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==================================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Helper check function for Client access isolation
CREATE OR REPLACE FUNCTION user_has_client_access(check_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM client_users
        WHERE user_id = auth.uid()
        AND client_id = check_client_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policy for Dashboards
CREATE POLICY client_dashboards_policy ON dashboards
    FOR ALL USING (user_has_client_access(client_id));

-- RLS Policy for Daily Metrics
CREATE POLICY client_paid_metrics_policy ON paid_daily_metrics
    FOR ALL USING (user_has_client_access(client_id));

CREATE POLICY client_organic_metrics_policy ON organic_daily_metrics
    FOR ALL USING (user_has_client_access(client_id));
```
