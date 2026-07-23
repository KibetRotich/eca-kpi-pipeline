-- =============================================================
-- MASP IV Sprint 20 Migration — CVA altitude (queryable)
-- Adds GPS altitude to cva_households alongside the existing lat/lon.
-- Source: 3rd token of the Kobo gps_location string ("lat lon altitude accuracy");
-- a 0/negative reading means the device did not capture it -> stored as NULL.
--
-- Additive only. Idempotent: safe to re-run. Run in Supabase SQL Editor or via MCP.
-- After applying, re-run pipeline/cva/load_supabase.py to populate the column.
-- =============================================================

-- raw altitude in metres (NULL where the device did not capture it)
ALTER TABLE cva_households
  ADD COLUMN IF NOT EXISTS altitude numeric;

-- convenience: elevation band, derived from altitude so band-level queries need no
-- CASE. Generated + STORED (immutable expression); the loader never writes it, so the
-- whole-dict upsert in load_supabase.py stays valid.
ALTER TABLE cva_households
  ADD COLUMN IF NOT EXISTS elevation_band text
  GENERATED ALWAYS AS (
    CASE
      WHEN altitude IS NULL      THEN NULL
      WHEN altitude < 1000       THEN '<1000 m'
      WHEN altitude < 1500       THEN '1000-1500 m'
      WHEN altitude < 2000       THEN '1500-2000 m'
      ELSE '2000 m+'
    END
  ) STORED;

COMMENT ON COLUMN cva_households.altitude       IS 'GPS altitude (m) from gps_location token 3; NULL if not captured (Sprint 20).';
COMMENT ON COLUMN cva_households.elevation_band IS 'Derived elevation band from altitude (Sprint 20).';
