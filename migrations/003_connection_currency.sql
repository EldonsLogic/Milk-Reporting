-- ==================================================================
-- MIGRATION 003 — Ad account currency
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Spend was formatted as USD everywhere, hardcoded in the query engine.
-- The first real connection is a Saudi ad account reporting in SAR, so a
-- client report would have shown "$41,263" against 41,263 riyals — the
-- kind of error that quietly destroys trust in every other number on the
-- page. Meta reports the currency on the ad account itself, so it's
-- captured on the connection and carried through to formatting.
-- ==================================================================

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

COMMENT ON COLUMN platform_connections.currency IS
  'ISO 4217 code reported by the platform for this account (e.g. SAR, USD). Null for organic connections, which carry no spend.';
