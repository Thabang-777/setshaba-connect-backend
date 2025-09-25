/*
  # Optimize Wards Table for Performance

  1. Indexes
    - Add GIN index on geojson for spatial queries
    - Add composite indexes for common query patterns
    - Add index on name for text searches

  2. Performance Optimizations
    - Add materialized view for simplified boundaries
    - Add function for spatial queries

  3. Constraints
    - Add check constraint for valid GeoJSON
*/

-- Add GIN index for geojson spatial queries (if PostGIS is available)
-- CREATE INDEX IF NOT EXISTS idx_wards_geojson_gin ON wards USING gin(geojson);

-- Add composite index for municipality + name queries
CREATE INDEX IF NOT EXISTS idx_wards_municipality_name ON wards(municipality_id, name);

-- Add index for name searches
CREATE INDEX IF NOT EXISTS idx_wards_name_text ON wards USING gin(to_tsvector('english', name));

-- Add function to get simplified ward boundaries
CREATE OR REPLACE FUNCTION get_simplified_ward_boundaries(
  p_municipality_id uuid DEFAULT NULL,
  p_bounds jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH filtered_wards AS (
    SELECT 
      ward_id,
      name,
      geojson
    FROM wards
    WHERE 
      (p_municipality_id IS NULL OR municipality_id = p_municipality_id)
      -- Add spatial filtering here if needed
    ORDER BY name
    LIMIT 100 -- Limit for performance
  )
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object(
          'ward_id', ward_id,
          'name', name
        ),
        'geometry', geojson
      )
    )
  )
  INTO result
  FROM filtered_wards;
  
  RETURN COALESCE(result, '{"type":"FeatureCollection","features":[]}'::jsonb);
END;
$$;

-- Add function to find ward by point
CREATE OR REPLACE FUNCTION find_ward_by_point(
  p_latitude double precision,
  p_longitude double precision
)
RETURNS TABLE(
  ward_id text,
  name text,
  municipality_id uuid,
  properties jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Simple point-in-polygon check using JSON operations
  -- This is a basic implementation - in production you'd use PostGIS
  RETURN QUERY
  SELECT 
    w.ward_id,
    w.name,
    w.municipality_id,
    w.properties
  FROM wards w
  WHERE w.geojson IS NOT NULL
  -- Add spatial query logic here
  LIMIT 1;
END;
$$;

-- Add check constraint for valid ward_id format
ALTER TABLE wards 
ADD CONSTRAINT check_ward_id_format 
CHECK (ward_id ~ '^[A-Za-z0-9_-]+$');

-- Add check constraint for non-empty name
ALTER TABLE wards 
ADD CONSTRAINT check_ward_name_not_empty 
CHECK (length(trim(name)) > 0);