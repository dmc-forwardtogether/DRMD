-- ============================================================
-- 018_normalize_kinds: Unify feature_type to simplified format
-- Removes parcel_ prefix from all kind values
-- Old: parcel_residential, parcel_commercial, etc.
-- New: residential, commercial, etc.
-- ============================================================

-- Drop the old constraint from 017
ALTER TABLE features
  DROP CONSTRAINT IF EXISTS features_feature_type_check;

-- Update existing data: strip parcel_ prefix
UPDATE features SET feature_type = 'residential' WHERE feature_type = 'parcel_residential';
UPDATE features SET feature_type = 'public'      WHERE feature_type = 'parcel_public';
UPDATE features SET feature_type = 'commercial'  WHERE feature_type = 'parcel_commercial';
UPDATE features SET feature_type = 'industrial'  WHERE feature_type = 'parcel_industrial';
UPDATE features SET feature_type = 'transport'   WHERE feature_type = 'parcel_transport';
UPDATE features SET feature_type = 'green'       WHERE feature_type = 'parcel_green';
UPDATE features SET feature_type = 'water'       WHERE feature_type = 'parcel_water';
-- Also normalize props.kind in JSONB
UPDATE features SET props = jsonb_set(props, '{kind}', to_jsonb(replace(props->>'kind', 'parcel_', '')))
  WHERE props->>'kind' LIKE 'parcel_%';

-- New constraint with simplified format
ALTER TABLE features
  ADD CONSTRAINT features_feature_type_check
  CHECK (feature_type IN (
    'residential', 'public', 'commercial', 'industrial',
    'transport', 'green', 'water',
    'road', 'poi'
  ));
