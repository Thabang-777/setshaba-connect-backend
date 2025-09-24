/*
  # Create Reports Table and Enums

  1. New Types
    - `report_category` enum ('water', 'electricity', 'roads', 'waste', 'safety', 'other')
    - `report_status` enum ('pending', 'acknowledged', 'in_progress', 'resolved')

  2. New Tables
    - `reports`
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text)
      - `category` (report_category)
      - `lat` (double precision)
      - `lng` (double precision)
      - `address` (text)
      - `status` (report_status, default 'pending')
      - `municipality_id` (uuid, references municipalities)
      - `created_by` (uuid, references users)
      - `assigned_official` (uuid, references users, nullable)
      - `upvotes` (integer, default 0)
      - `photo_url` (text, nullable)
      - `created_at` (timestamp)

  3. Security
    - Enable RLS on `reports` table
    - Add policies for citizens to manage own reports
    - Add policies for officials to manage reports in their municipality

  4. Indexes
    - Index on municipality_id, status, category, created_by for efficient queries
    - Index on created_at for chronological ordering

  5. Seed Data
    - Insert 10 sample reports across different categories and municipalities
*/

-- Create report enums if they don't exist
DO $$ BEGIN
    CREATE TYPE report_category AS ENUM ('water', 'electricity', 'roads', 'waste', 'safety', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE report_status AS ENUM ('pending', 'acknowledged', 'in_progress', 'resolved');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category report_category NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text NOT NULL,
  status report_status DEFAULT 'pending' NOT NULL,
  municipality_id uuid NOT NULL REFERENCES municipalities(id),
  created_by uuid NOT NULL REFERENCES users(id),
  assigned_official uuid REFERENCES users(id),
  upvotes integer DEFAULT 0,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reports_municipality_id ON reports(municipality_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports(created_by);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Citizens can create reports" ON reports;
DROP POLICY IF EXISTS "Citizens can read own reports" ON reports;
DROP POLICY IF EXISTS "Citizens can update own reports" ON reports;
DROP POLICY IF EXISTS "Officials can read reports in their municipality" ON reports;
DROP POLICY IF EXISTS "Officials can update reports in their municipality" ON reports;

-- Create RLS policies
CREATE POLICY "Citizens can create reports"
  ON reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'citizen'
    )
  );

CREATE POLICY "Citizens can read own reports"
  ON reports
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Citizens can update own reports"
  ON reports
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Officials can read reports in their municipality"
  ON reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'official'
        AND users.municipality_id = reports.municipality_id
    )
  );

CREATE POLICY "Officials can update reports in their municipality"
  ON reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'official'
        AND users.municipality_id = reports.municipality_id
    )
  );

-- Insert seed data for demo reports
DO $$
DECLARE
    jhb_id uuid;
    pta_id uuid;
    nbo_id uuid;
    cpt_id uuid;
    citizen_ids uuid[];
    official_ids uuid[];
BEGIN
    -- Get municipality IDs
    SELECT id INTO jhb_id FROM municipalities WHERE name = 'City of Johannesburg';
    SELECT id INTO pta_id FROM municipalities WHERE name = 'City of Tshwane (Pretoria)';
    SELECT id INTO nbo_id FROM municipalities WHERE name = 'City of Nairobi';
    SELECT id INTO cpt_id FROM municipalities WHERE name = 'City of Cape Town';

    -- Get citizen IDs for creating reports
    SELECT ARRAY(SELECT id FROM users WHERE role = 'citizen' LIMIT 8) INTO citizen_ids;
    
    -- Get official IDs for assignment
    SELECT ARRAY(SELECT id FROM users WHERE role = 'official') INTO official_ids;

    -- Insert sample reports across different categories and municipalities
    INSERT INTO reports (title, description, category, lat, lng, address, status, municipality_id, created_by, assigned_official, upvotes) VALUES
        -- Johannesburg reports
        ('Burst water pipe on Main Street', 'There is a major water leak causing flooding on Main Street near the shopping center. Water is gushing out and affecting traffic.', 'water', -26.2041, 28.0473, '123 Main Street, Johannesburg', 'acknowledged', jhb_id, citizen_ids[1], official_ids[1], 15),
        ('Streetlight not working', 'The streetlight at the corner of Oak Avenue has been out for 3 weeks. It''s very dark and unsafe at night.', 'electricity', -26.1076, 28.0567, '456 Oak Avenue, Sandton', 'pending', jhb_id, citizen_ids[2], NULL, 8),
        ('Pothole on highway', 'Large pothole on the M1 highway causing damage to vehicles. Multiple cars have had tire damage.', 'roads', -26.1849, 28.0131, 'M1 Highway, Johannesburg', 'in_progress', jhb_id, citizen_ids[1], official_ids[1], 23),
        
        -- Pretoria reports
        ('Garbage not collected', 'Garbage has not been collected in our area for 2 weeks. It''s starting to smell and attracting pests.', 'waste', -25.7479, 28.2293, '321 Church Street, Pretoria', 'pending', pta_id, citizen_ids[3], NULL, 12),
        ('Broken traffic light', 'Traffic light at the intersection is stuck on red in all directions. Causing major traffic delays.', 'safety', -25.8601, 28.1880, '654 Union Avenue, Centurion', 'acknowledged', pta_id, citizen_ids[4], official_ids[2], 19),
        
        -- Nairobi reports
        ('Water shortage in area', 'Our neighborhood has had no water supply for 5 days. Residents are struggling to get clean water.', 'water', -1.2921, 36.8219, '111 Kenyatta Avenue, Nairobi', 'in_progress', nbo_id, citizen_ids[5], official_ids[3], 31),
        ('Road needs repair', 'The road surface is completely damaged with multiple potholes making it impassable for small vehicles.', 'roads', -1.2864, 36.8172, '222 Uhuru Highway, Nairobi', 'pending', nbo_id, citizen_ids[6], NULL, 7),
        
        -- Cape Town reports
        ('Power outage in neighborhood', 'Entire neighborhood has been without electricity for 12 hours. No communication from utility company.', 'electricity', -33.9249, 18.4241, '444 Long Street, Cape Town', 'acknowledged', cpt_id, citizen_ids[7], official_ids[4], 25),
        ('Illegal dumping site', 'People are dumping construction waste in the park. It''s becoming an environmental hazard.', 'waste', -33.9258, 18.4232, '555 Adderley Street, Cape Town', 'resolved', cpt_id, citizen_ids[8], official_ids[4], 14),
        ('Vandalism at bus stop', 'Bus stop has been vandalized with broken glass everywhere. Dangerous for commuters.', 'other', -33.9249, 18.4241, '666 Civic Centre, Cape Town', 'pending', cpt_id, citizen_ids[7], NULL, 5)
    ON CONFLICT DO NOTHING;

END $$;