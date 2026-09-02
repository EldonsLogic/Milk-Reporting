-- ============================================================================
-- 004: GOOGLE ANALYTICS 4 (WEB ANALYTICS)
--
-- GA4 is neither paid_daily_metrics (no spend/campaign dimension) nor
-- organic_daily_metrics (no follower/post vocabulary) - it is site
-- behaviour, so it gets its own normalized table.
--
-- Grain: one row per (property, date, channel group, device category).
-- That is deliberately the *only* breakdown stored: adding source/medium or
-- landing page to the same key would multiply the row count and, more
-- importantly, make every "total sessions" read double-count unless every
-- query knew to collapse the extra dimensions first. Channel + device is
-- what a client report actually shows, and totals are a clean SUM.
--
-- Rate metrics are NOT stored. Engagement rate, bounce rate and average
-- session duration are ratios; summing them across days or channels is
-- meaningless. Their numerators (engaged_sessions, user_engagement_duration)
-- are stored instead, and the ratios are derived at query time from the
-- summed numerator/denominator - which is the only way they stay correct at
-- every level of aggregation.
--
-- Safe to run more than once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    connection_id TEXT REFERENCES platform_connections(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL DEFAULT 'google_analytics',
    property_id VARCHAR(64) NOT NULL,        -- GA4 numeric property id, no "properties/" prefix
    property_name VARCHAR(255),
    date DATE NOT NULL,

    channel_group VARCHAR(120) NOT NULL DEFAULT '(not set)',   -- sessionDefaultChannelGroup
    device_category VARCHAR(60) NOT NULL DEFAULT '(not set)',  -- deviceCategory

    sessions BIGINT DEFAULT 0,
    engaged_sessions BIGINT DEFAULT 0,
    total_users BIGINT DEFAULT 0,   -- NOT additive across rows; see metric catalog caveat
    new_users BIGINT DEFAULT 0,
    screen_page_views BIGINT DEFAULT 0,
    user_engagement_duration BIGINT DEFAULT 0,  -- seconds, summable
    key_events NUMERIC(14, 2) DEFAULT 0,        -- GA4's renamed "conversions"
    transactions BIGINT DEFAULT 0,
    total_revenue NUMERIC(14, 4) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, property_id, date, channel_group, device_category)
);

CREATE INDEX IF NOT EXISTS idx_web_analytics_client_date ON web_analytics_daily(client_id, date);
CREATE INDEX IF NOT EXISTS idx_web_analytics_property ON web_analytics_daily(property_id);

ALTER TABLE web_analytics_daily ENABLE ROW LEVEL SECURITY;

-- Same two-tier pattern as every other client-scoped table: agency admins
-- get full CRUD on their own agency's clients, client viewers read-only on
-- their own client.
DROP POLICY IF EXISTS web_analytics_admin ON web_analytics_daily;
CREATE POLICY web_analytics_admin ON web_analytics_daily FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));

DROP POLICY IF EXISTS web_analytics_viewer_read ON web_analytics_daily;
CREATE POLICY web_analytics_viewer_read ON web_analytics_daily FOR SELECT
  USING (user_has_client_access(client_id));
