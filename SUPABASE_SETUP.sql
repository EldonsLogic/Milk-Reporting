-- ============================================================================
-- Milk-Reporting: full Supabase schema (base schema from DATABASE_SCHEMA.md
-- + Phase 1 additions: dashboard sections, hidden agency markup, custom
-- cross-source metrics, per-connection dimensional scope filters + fixed,
-- complete Row Level Security (the original DDL enabled RLS on `clients`,
-- `dashboard_pages`, and `dashboard_widgets` but never wrote policies for
-- them, and had no concept of an agency-admin user at all - only client
-- viewers. Both are fixed below.)
--
-- ID strategy: tables the app creates rows for interactively (clients,
-- platform_connections, custom_metrics, dashboards, dashboard_pages,
-- dashboard_widgets, dashboard_templates) use client-generated TEXT ids
-- (e.g. "client-1735000000000"), matching the id patterns already used
-- throughout the existing React code, rather than DB-generated UUIDs -
-- this avoids the app having to round-trip and remap ids after every
-- insert. Auth-tied tables (agencies, agency_users, client_users) and
-- data-volume tables the app never hand-authors ids for (paid/organic
-- metrics, raw landings, content items) keep DB-generated UUIDs.
--
-- Run this once, in full, in the Supabase SQL Editor for this project.
-- Safe to run on an empty database. Not safe to re-run after data exists
-- (uses CREATE TABLE, not CREATE TABLE IF NOT EXISTS) - this is a first-run
-- setup script, not a repeatable migration.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================================================================
-- 1. AGENCY & CLIENT TENANT MANAGEMENT
-- ==================================================================

CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency-side users (the people who see the full admin app). Separate from
-- client_users below - an agency admin isn't scoped to one client.
CREATE TABLE agency_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE, -- references auth.users(id)
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    logo_url TEXT,
    objective_type VARCHAR(50) DEFAULT 'mixed', -- 'brand_awareness' | 'lead_gen' | 'ecommerce' | 'social_content' | 'mixed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agency_id, slug)
);

-- Client-side users (the client's own login, read-only, one client only).
CREATE TABLE client_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE, -- references auth.users(id)
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- 2. PLATFORM CONNECTIONS & CREDENTIALS
-- ==================================================================

CREATE TABLE platform_connections (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'meta', 'google_ads', 'tiktok_ads', 'facebook_page', 'instagram'
    connection_type VARCHAR(50) NOT NULL, -- 'paid_ads', 'organic_social'
    account_name VARCHAR(255) NOT NULL,
    external_account_id VARCHAR(255) NOT NULL,
    encrypted_credentials JSONB DEFAULT '{}'::jsonb, -- access/refresh tokens, populated once real ingestion is wired up
    -- Dimensional scope: which page/ad account/campaign/ad set/ad/profile
    -- this connection is limited to reporting on. Shape is intentionally
    -- loose (platform-dependent) rather than a rigid column-per-dimension -
    -- e.g. {"campaign_ids": [...], "ad_account_ids": [...], "page_ids": [...]}
    scope_filters JSONB DEFAULT '{}'::jsonb,
    sync_status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'error'
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, platform, external_account_id)
);

-- ==================================================================
-- 3. METRIC CATALOG (built-in) + CUSTOM METRICS (agency-defined)
-- ==================================================================

CREATE TABLE metric_catalog (
    id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    source_field VARCHAR(255),
    is_derived BOOLEAN DEFAULT FALSE,
    formula TEXT,
    description TEXT,
    is_default_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency-defined metrics combining fields across sources into one formula.
-- Evaluated client-side by the same safe formula parser as built-ins
-- (src/lib/formula-evaluator.ts) - this table just persists the definition.
CREATE TABLE custom_metrics (
    id TEXT PRIMARY KEY, -- e.g. 'custom_blended_cpa'
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    formula TEXT NOT NULL,
    description TEXT,
    created_by UUID, -- references auth.users(id)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- 4. RAW DATA LANDING TABLE
-- ==================================================================

CREATE TABLE raw_api_landings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    stream_name VARCHAR(100) NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB NOT NULL
);

-- ==================================================================
-- 5. NORMALIZED PAID MARKETING PERFORMANCE
-- ==================================================================

CREATE TABLE paid_daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    connection_id TEXT REFERENCES platform_connections(id) ON DELETE CASCADE,
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

    spend NUMERIC(14, 4) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    reach BIGINT DEFAULT 0,
    frequency NUMERIC(8, 4) DEFAULT 0,

    clicks BIGINT DEFAULT 0,
    link_clicks BIGINT DEFAULT 0,
    landing_page_views BIGINT DEFAULT 0,
    outbound_clicks BIGINT DEFAULT 0,
    unique_clicks BIGINT DEFAULT 0,

    video_views BIGINT DEFAULT 0,
    video_3s_views BIGINT DEFAULT 0,
    thruplays BIGINT DEFAULT 0,
    video_completions BIGINT DEFAULT 0,
    video_avg_watch_time NUMERIC(10, 2) DEFAULT 0,
    video_views_2s BIGINT DEFAULT 0,
    video_views_6s BIGINT DEFAULT 0,

    post_engagements BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,
    negative_feedback BIGINT DEFAULT 0,

    conversions NUMERIC(12, 2) DEFAULT 0,
    leads BIGINT DEFAULT 0,
    purchases BIGINT DEFAULT 0,
    conversion_value NUMERIC(14, 4) DEFAULT 0,
    view_through_conversions BIGINT DEFAULT 0,

    search_impression_share NUMERIC(5, 2), -- Google Ads only, averaged not summed
    quality_score NUMERIC(4, 2), -- Google Ads only, averaged not summed

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
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    connection_id TEXT REFERENCES platform_connections(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    date DATE NOT NULL,

    total_followers BIGINT DEFAULT 0,
    followers_gained BIGINT DEFAULT 0,
    followers_lost BIGINT DEFAULT 0,
    profile_visits BIGINT DEFAULT 0,
    accounts_reached BIGINT DEFAULT 0,
    accounts_engaged BIGINT DEFAULT 0,

    post_impressions BIGINT DEFAULT 0,
    post_reach BIGINT DEFAULT 0,
    post_engagements BIGINT DEFAULT 0,
    reel_views BIGINT DEFAULT 0,
    story_views BIGINT DEFAULT 0,
    story_exits BIGINT DEFAULT 0,

    comments_responded BIGINT DEFAULT 0,
    avg_response_time_minutes NUMERIC(10, 2), -- averaged not summed
    posts_published BIGINT DEFAULT 0,

    custom_metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, platform, date)
);

CREATE TABLE organic_content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    external_content_id VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- 'post', 'reel', 'story', 'carousel', 'video'
    caption TEXT,
    media_url TEXT, -- populated by real ingestion (Meta Graph API full_picture); null renders a placeholder
    permalink TEXT,
    published_at TIMESTAMPTZ NOT NULL,

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
-- 7. DASHBOARDS, PAGES, SECTIONS, WIDGETS & TEMPLATES
-- ==================================================================

CREATE TABLE dashboard_templates (
    id TEXT PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    template_structure JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboards (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    global_date_range VARCHAR(50) DEFAULT 'last_30_days',
    global_filters JSONB DEFAULT '{}'::jsonb,
    -- Hidden agency markup applied to spend/cost metrics for the
    -- client-facing view only; agency admins always see true spend.
    markup_percentage NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboard_pages (
    id TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0,
    -- Named widget groupings within the page: [{id, title, sortOrder}, ...].
    -- Not a separate table - sections are cheap, page-scoped, and widgets
    -- reference one by its JSON id via dashboard_widgets.section_id below.
    sections JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboard_widgets (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES dashboard_pages(id) ON DELETE CASCADE,
    section_id VARCHAR(100), -- matches an id inside the parent page's `sections` JSONB, or null = ungrouped
    widget_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,

    grid_x INT NOT NULL DEFAULT 0,
    grid_y INT NOT NULL DEFAULT 0,
    grid_w INT NOT NULL DEFAULT 4,
    grid_h INT NOT NULL DEFAULT 3,

    data_config JSONB NOT NULL,
    display_config JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================================
-- 8. ROW LEVEL SECURITY
--
-- Two access tiers:
--   agency admin  -> full read/write on every client under their agency
--   client viewer -> read-only on their own client's dashboards/data,
--                    never write (they don't edit their own dashboard)
-- ==================================================================

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION user_is_agency_admin_for(check_agency_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM agency_users WHERE user_id = auth.uid() AND agency_id = check_agency_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_has_client_access(check_client_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_users WHERE user_id = auth.uid() AND client_id = check_client_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION client_agency_id(check_client_id TEXT)
RETURNS UUID AS $$
  SELECT agency_id FROM clients WHERE id = check_client_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- agencies / agency_users: an admin can see/manage their own agency's row
CREATE POLICY agencies_admin_access ON agencies FOR ALL
  USING (user_is_agency_admin_for(id)) WITH CHECK (user_is_agency_admin_for(id));

CREATE POLICY agency_users_self_access ON agency_users FOR SELECT
  USING (user_id = auth.uid() OR user_is_agency_admin_for(agency_id));

-- clients: admins full access to their agency's clients; client viewers
-- get read-only on their own single client row.
CREATE POLICY clients_admin_access ON clients FOR ALL
  USING (user_is_agency_admin_for(agency_id)) WITH CHECK (user_is_agency_admin_for(agency_id));
CREATE POLICY clients_viewer_read ON clients FOR SELECT
  USING (user_has_client_access(id));

CREATE POLICY client_users_admin_access ON client_users FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));
CREATE POLICY client_users_self_read ON client_users FOR SELECT
  USING (user_id = auth.uid());

-- Generic pattern for the rest of the client-scoped tables: admin gets
-- full CRUD, client viewer gets read-only.
CREATE POLICY platform_connections_admin ON platform_connections FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));
CREATE POLICY platform_connections_viewer_read ON platform_connections FOR SELECT
  USING (user_has_client_access(client_id));

CREATE POLICY paid_metrics_admin ON paid_daily_metrics FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));
CREATE POLICY paid_metrics_viewer_read ON paid_daily_metrics FOR SELECT
  USING (user_has_client_access(client_id));

CREATE POLICY organic_metrics_admin ON organic_daily_metrics FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));
CREATE POLICY organic_metrics_viewer_read ON organic_daily_metrics FOR SELECT
  USING (user_has_client_access(client_id));

CREATE POLICY content_items_admin ON organic_content_items FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));
CREATE POLICY content_items_viewer_read ON organic_content_items FOR SELECT
  USING (user_has_client_access(client_id));

CREATE POLICY dashboards_admin ON dashboards FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));
CREATE POLICY dashboards_viewer_read ON dashboards FOR SELECT
  USING (user_has_client_access(client_id));

CREATE OR REPLACE FUNCTION dashboard_client_id(check_dashboard_id TEXT)
RETURNS TEXT AS $$
  SELECT client_id FROM dashboards WHERE id = check_dashboard_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY dashboard_pages_admin ON dashboard_pages FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(dashboard_client_id(dashboard_id))))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(dashboard_client_id(dashboard_id))));
CREATE POLICY dashboard_pages_viewer_read ON dashboard_pages FOR SELECT
  USING (user_has_client_access(dashboard_client_id(dashboard_id)));

CREATE OR REPLACE FUNCTION page_dashboard_id(check_page_id TEXT)
RETURNS TEXT AS $$
  SELECT dashboard_id FROM dashboard_pages WHERE id = check_page_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY dashboard_widgets_admin ON dashboard_widgets FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(dashboard_client_id(page_dashboard_id(page_id)))))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(dashboard_client_id(page_dashboard_id(page_id)))));
CREATE POLICY dashboard_widgets_viewer_read ON dashboard_widgets FOR SELECT
  USING (user_has_client_access(dashboard_client_id(page_dashboard_id(page_id))));

CREATE POLICY dashboard_templates_admin ON dashboard_templates FOR ALL
  USING (user_is_agency_admin_for(agency_id)) WITH CHECK (user_is_agency_admin_for(agency_id));

CREATE POLICY custom_metrics_admin ON custom_metrics FOR ALL
  USING (user_is_agency_admin_for(agency_id)) WITH CHECK (user_is_agency_admin_for(agency_id));
-- Client viewers can read custom metrics (they may appear on their
-- dashboard) but never write them.
CREATE POLICY custom_metrics_viewer_read ON custom_metrics FOR SELECT
  USING (EXISTS (SELECT 1 FROM client_users WHERE user_id = auth.uid()));

-- metric_catalog (built-ins) is readable by anyone authenticated - it's
-- not client-scoped data, just the definition list.
ALTER TABLE metric_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY metric_catalog_read_all ON metric_catalog FOR SELECT
  USING (auth.role() = 'authenticated');
