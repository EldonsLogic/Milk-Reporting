-- ==================================================================
-- MIGRATION 002 — Platform expansion
--
-- Run this once in the Supabase SQL Editor. Safe to re-run: every
-- statement is guarded with IF NOT EXISTS / OR REPLACE / DROP-then-
-- CREATE, so a second run is a no-op rather than an error.
--
-- Covers:
--   1. Custom date ranges on dashboards
--   2. Annotations (agency-supplied context on a timeline)
--   3. Sync logs (data-health / ingestion history)
--   4. Indexes for server-side date filtering
--   5. Agency seat management policies
--   6. save_dashboard_atomic updated for custom dates
-- ==================================================================


-- ------------------------------------------------------------------
-- 1. CUSTOM DATE RANGES
--
-- global_date_range already stores the preset name; when that preset
-- is 'custom' these two columns carry the actual bounds. Nullable
-- because every other preset computes its own bounds at query time.
-- ------------------------------------------------------------------

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS custom_date_start DATE;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS custom_date_end   DATE;


-- ------------------------------------------------------------------
-- 2. ANNOTATIONS
--
-- The agency's own record of what happened on a given day — "new
-- creative live", "budget doubled", "site migration". Rendered as
-- markers on time-series widgets so a spike or drop carries the
-- explanation the agency actually knows, rather than one a model
-- guessed.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    title VARCHAR(255) NOT NULL,
    note TEXT,
    -- Free-text label so the agency can colour-code its own
    -- categories without a migration every time they invent one.
    category VARCHAR(50) DEFAULT 'general',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_client_date ON annotations(client_id, date);

ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS annotations_admin ON annotations;
CREATE POLICY annotations_admin ON annotations FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));

-- Client viewers see annotations on their own dashboards (that's the
-- point — it's the agency explaining the chart to them) but can never
-- write one.
DROP POLICY IF EXISTS annotations_viewer_read ON annotations;
CREATE POLICY annotations_viewer_read ON annotations FOR SELECT
  USING (user_has_client_access(client_id));


-- ------------------------------------------------------------------
-- 3. SYNC LOGS
--
-- One row per connection per sync attempt. connection_id is SET NULL
-- rather than CASCADE on delete so removing a data source doesn't
-- erase the history of what it ingested; client_id keeps the row
-- scoped for RLS either way.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id TEXT REFERENCES platform_connections(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    account_name VARCHAR(255),
    status VARCHAR(20) NOT NULL, -- 'success' | 'error' | 'partial'
    trigger_source VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual' | 'cron' | 'backfill'
    range_since DATE,
    range_until DATE,
    records_synced INT DEFAULT 0,
    content_items_synced INT DEFAULT 0,
    error TEXT,
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_client ON sync_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection ON sync_logs(connection_id, created_at DESC);

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Agency-only: ingestion internals aren't a client-facing concern.
DROP POLICY IF EXISTS sync_logs_admin ON sync_logs;
CREATE POLICY sync_logs_admin ON sync_logs FOR ALL
  USING (user_is_agency_admin_for(client_agency_id(client_id)))
  WITH CHECK (user_is_agency_admin_for(client_agency_id(client_id)));


-- ------------------------------------------------------------------
-- 4. INDEXES FOR SERVER-SIDE DATE FILTERING
--
-- The app previously fetched every row for a client and filtered by
-- date in the browser. Now that the date bounds go into the query,
-- these keep that query on an index rather than a full scan.
-- (paid_daily_metrics already had idx_paid_daily_client_date.)
-- ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_organic_daily_client_date
  ON organic_daily_metrics(client_id, date);

CREATE INDEX IF NOT EXISTS idx_content_items_client_published
  ON organic_content_items(client_id, published_at DESC);


-- ------------------------------------------------------------------
-- 5. AGENCY SEAT MANAGEMENT
--
-- agency_users previously had only a self-SELECT policy, so an admin
-- could confirm their own row and nothing else — no way to list or
-- invite colleagues. These add full management within one's own
-- agency, while keeping the self-read policy so profile lookup still
-- works for a user who somehow isn't yet an admin of anything.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS agency_users_admin_manage ON agency_users;
CREATE POLICY agency_users_admin_manage ON agency_users FOR ALL
  USING (user_is_agency_admin_for(agency_id))
  WITH CHECK (user_is_agency_admin_for(agency_id));


-- ------------------------------------------------------------------
-- 6. save_dashboard_atomic — now persists custom date bounds
--
-- Same single-transaction guarantee as before (see migration 001 /
-- SUPABASE_SETUP.sql section 9). Two new parameters carry the custom
-- range; they're nullable and ignored for every non-custom preset.
-- Still no SECURITY DEFINER — runs as the calling user so RLS applies.
--
-- Every existing overload is dropped by name first. CREATE OR REPLACE
-- only replaces a function with an identical argument list — adding
-- the two DATE parameters would otherwise create a SECOND overload
-- alongside the original 7-argument version, leaving the name
-- ambiguous (which breaks GRANT, and lets PostgREST resolve calls to
-- whichever it likes). The DO block handles any signature drift
-- rather than hardcoding the old argument list.
-- ------------------------------------------------------------------

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT oid::regprocedure AS signature
    FROM pg_proc
    WHERE proname = 'save_dashboard_atomic'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', fn.signature);
  END LOOP;
END $$;

CREATE FUNCTION save_dashboard_atomic(
  p_dashboard_id TEXT,
  p_title TEXT,
  p_description TEXT,
  p_global_date_range TEXT,
  p_global_filters JSONB,
  p_markup_percentage NUMERIC,
  p_pages JSONB,
  p_custom_date_start DATE DEFAULT NULL,
  p_custom_date_end DATE DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE dashboards SET
    title = p_title,
    description = p_description,
    global_date_range = p_global_date_range,
    global_filters = p_global_filters,
    markup_percentage = p_markup_percentage,
    custom_date_start = p_custom_date_start,
    custom_date_end = p_custom_date_end,
    updated_at = NOW()
  WHERE id = p_dashboard_id;

  DELETE FROM dashboard_pages WHERE dashboard_id = p_dashboard_id;

  INSERT INTO dashboard_pages (id, dashboard_id, title, sort_order, sections)
  SELECT
    page->>'id',
    p_dashboard_id,
    page->>'title',
    (page->>'sortOrder')::INT,
    COALESCE(page->'sections', '[]'::jsonb)
  FROM jsonb_array_elements(p_pages) AS page;

  INSERT INTO dashboard_widgets (id, page_id, section_id, widget_type, title, grid_x, grid_y, grid_w, grid_h, data_config, display_config)
  SELECT
    widget->>'id',
    page->>'id',
    widget->>'sectionId',
    widget->>'widgetType',
    widget->>'title',
    COALESCE((widget->'grid'->>'x')::INT, 0),
    COALESCE((widget->'grid'->>'y')::INT, 0),
    COALESCE((widget->'grid'->>'w')::INT, 4),
    COALESCE((widget->'grid'->>'h')::INT, 3),
    widget->'dataConfig',
    COALESCE(widget->'displayConfig', '{}'::jsonb)
  FROM jsonb_array_elements(p_pages) AS page,
       jsonb_array_elements(COALESCE(page->'widgets', '[]'::jsonb)) AS widget;
END;
$$ LANGUAGE plpgsql;

-- Granted with the full argument list rather than by bare name, so this
-- stays unambiguous even if an overload is ever reintroduced.
GRANT EXECUTE ON FUNCTION save_dashboard_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, JSONB, DATE, DATE
) TO authenticated;
