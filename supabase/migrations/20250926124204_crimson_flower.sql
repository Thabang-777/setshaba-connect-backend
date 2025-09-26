/*
  # Accountability and Transparency Enhancements

  1. Status Updates Table Enhancements
    - Add fields for better accountability tracking
    - Link all updates to specific officials
    - Track status changes with before/after states

  2. Reports Table Enhancements  
    - Add updated_at timestamp
    - Ensure assigned_official is properly tracked
    - Add fields for better analytics

  3. Users Table Enhancements
    - Add profile photo support for officials
    - Add role-specific fields

  4. Indexes and Performance
    - Add indexes for analytics queries
    - Optimize for dashboard performance

  5. Security Policies
    - Ensure proper RLS for accountability features
*/

-- Enhance status_updates table
ALTER TABLE status_updates ADD COLUMN IF NOT EXISTS previous_status report_status;
ALTER TABLE status_updates ADD COLUMN IF NOT EXISTS new_status report_status;
ALTER TABLE status_updates ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE status_updates ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

-- Add index for status updates by official
CREATE INDEX IF NOT EXISTS idx_status_updates_created_by ON status_updates(created_by);
CREATE INDEX IF NOT EXISTS idx_status_updates_report_created ON status_updates(report_id, created_at DESC);

-- Enhance reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enhance users table for officials
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number text;

-- Add indexes for analytics and performance
CREATE INDEX IF NOT EXISTS idx_reports_updated_at ON reports(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_category_status ON reports(category, status);
CREATE INDEX IF NOT EXISTS idx_reports_municipality_created ON reports(municipality_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_assigned_official ON reports(assigned_official);

-- Add index for ward-based analytics
CREATE INDEX IF NOT EXISTS idx_reports_ward_category ON reports(ward_id, category) WHERE ward_id IS NOT NULL;

-- Update RLS policies for status_updates
DROP POLICY IF EXISTS "Officials can create status updates" ON status_updates;
CREATE POLICY "Officials can create status updates"
  ON status_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'official'
      AND users.id = created_by
    )
  );

DROP POLICY IF EXISTS "Officials can read status updates in their municipality" ON status_updates;
CREATE POLICY "Officials can read status updates in their municipality"
  ON status_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN reports r ON r.id = status_updates.report_id
      WHERE u.id = auth.uid() 
      AND u.role = 'official'
      AND u.municipality_id = r.municipality_id
    )
  );

-- Add policy for citizens to read status updates on their reports
DROP POLICY IF EXISTS "Citizens can read status updates on their reports" ON status_updates;
CREATE POLICY "Citizens can read status updates on their reports"
  ON status_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = status_updates.report_id
      AND r.created_by = auth.uid()
    )
  );

-- Create function for analytics dashboard
CREATE OR REPLACE FUNCTION get_municipality_analytics(
  p_municipality_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  date_filter timestamptz;
BEGIN
  date_filter := now() - (p_days || ' days')::interval;
  
  WITH report_stats AS (
    SELECT 
      category,
      status,
      ward_id,
      created_at,
      assigned_official
    FROM reports 
    WHERE municipality_id = p_municipality_id
    AND created_at >= date_filter
  ),
  category_counts AS (
    SELECT category, count(*) as count
    FROM report_stats
    GROUP BY category
  ),
  status_counts AS (
    SELECT status, count(*) as count
    FROM report_stats
    GROUP BY status
  ),
  ward_counts AS (
    SELECT w.name as ward_name, count(r.*) as count
    FROM report_stats r
    JOIN wards w ON w.ward_id = r.ward_id
    WHERE r.ward_id IS NOT NULL
    GROUP BY w.name
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'period_days', p_days,
    'municipality_id', p_municipality_id,
    'categories', (SELECT jsonb_object_agg(category, count) FROM category_counts),
    'statuses', (SELECT jsonb_object_agg(status, count) FROM status_counts),
    'top_wards', (SELECT jsonb_agg(jsonb_build_object('name', ward_name, 'count', count)) FROM ward_counts),
    'generated_at', now()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Create materialized view for simplified ward boundaries (if not exists)
DROP MATERIALIZED VIEW IF EXISTS simplified_wards;
CREATE MATERIALIZED VIEW simplified_wards AS
SELECT 
  id,
  ward_id,
  name,
  municipality_id,
  geojson as simplified_geojson,
  created_at
FROM wards
WHERE geojson IS NOT NULL;

-- Add index on materialized view
CREATE INDEX IF NOT EXISTS idx_simplified_wards_municipality ON simplified_wards(municipality_id);
CREATE INDEX IF NOT EXISTS idx_simplified_wards_ward_id ON simplified_wards(ward_id);

-- Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE 'REFRESH MATERIALIZED VIEW ' || quote_ident(view_name);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;