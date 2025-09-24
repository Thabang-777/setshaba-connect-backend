/*
  # Create Municipalities Table

  1. New Tables
    - `municipalities`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `province` (text)
      - `bounds` (jsonb for geographic boundaries)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `municipalities` table
    - Add policy for public read access

  3. Seed Data
    - Insert 4 demo municipalities: Johannesburg, Pretoria, Nairobi, Cape Town
*/

-- Create municipalities table
CREATE TABLE IF NOT EXISTS municipalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  province text NOT NULL,
  bounds jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read municipalities" ON municipalities;

-- Create RLS policies
CREATE POLICY "Anyone can read municipalities"
  ON municipalities
  FOR SELECT
  TO public
  USING (true);

-- Insert seed data for demo municipalities
INSERT INTO municipalities (name, province, bounds) VALUES
  ('City of Johannesburg', 'Gauteng', '{"type": "Polygon", "coordinates": [[[-26.0, 28.0], [-26.0, 28.2], [-25.8, 28.2], [-25.8, 28.0], [-26.0, 28.0]]]}'),
  ('City of Tshwane (Pretoria)', 'Gauteng', '{"type": "Polygon", "coordinates": [[[-25.6, 28.1], [-25.6, 28.3], [-25.4, 28.3], [-25.4, 28.1], [-25.6, 28.1]]]}'),
  ('City of Nairobi', 'Nairobi County', '{"type": "Polygon", "coordinates": [[[-1.2, 36.7], [-1.2, 36.9], [-1.0, 36.9], [-1.0, 36.7], [-1.2, 36.7]]]}'),
  ('City of Cape Town', 'Western Cape', '{"type": "Polygon", "coordinates": [[[-34.0, 18.3], [-34.0, 18.5], [-33.8, 18.5], [-33.8, 18.3], [-34.0, 18.3]]]}')
ON CONFLICT (name) DO NOTHING;