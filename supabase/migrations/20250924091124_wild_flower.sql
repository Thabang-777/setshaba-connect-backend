/*
  # Create Users Table and Enums

  1. New Types
    - `user_role` enum ('citizen', 'official')

  2. New Tables
    - `users`
      - `id` (uuid, primary key, references auth.users)
      - `name` (text)
      - `email` (text, unique)
      - `role` (user_role, default 'citizen')
      - `municipality_id` (uuid, references municipalities)
      - `home_address` (text, nullable)
      - `lat` (double precision, nullable)
      - `lng` (double precision, nullable)
      - `created_at` (timestamp)

  3. Security
    - Enable RLS on `users` table
    - Add policies for users to read own data
    - Add policies for officials to read users in their municipality

  4. Indexes
    - Index on municipality_id for efficient queries
    - Index on role for role-based queries

  5. Seed Data
    - Insert 2 citizens + 1 official per municipality (12 users total)
*/

-- Create user_role enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('citizen', 'official');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  role user_role DEFAULT 'citizen' NOT NULL,
  municipality_id uuid REFERENCES municipalities(id),
  home_address text,
  lat double precision,
  lng double precision,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_municipality_id ON users(municipality_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Officials can read users in their municipality" ON users;

-- Create RLS policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Officials can read users in their municipality"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users officials
      WHERE officials.id = auth.uid()
        AND officials.role = 'official'
        AND officials.municipality_id = users.municipality_id
    )
  );

-- Insert seed data for demo users
-- Note: In a real application, these would be created through the auth system
-- This is just for demo purposes to show the data structure

-- Get municipality IDs for seed data
DO $$
DECLARE
    jhb_id uuid;
    pta_id uuid;
    nbo_id uuid;
    cpt_id uuid;
BEGIN
    -- Get municipality IDs
    SELECT id INTO jhb_id FROM municipalities WHERE name = 'City of Johannesburg';
    SELECT id INTO pta_id FROM municipalities WHERE name = 'City of Tshwane (Pretoria)';
    SELECT id INTO nbo_id FROM municipalities WHERE name = 'City of Nairobi';
    SELECT id INTO cpt_id FROM municipalities WHERE name = 'City of Cape Town';

    -- Insert demo users (using generated UUIDs for demo purposes)
    -- Johannesburg users
    INSERT INTO users (id, name, email, role, municipality_id, home_address, lat, lng) VALUES
        (gen_random_uuid(), 'John Citizen', 'john.citizen@jhb.co.za', 'citizen', jhb_id, '123 Main St, Johannesburg', -26.2041, 28.0473),
        (gen_random_uuid(), 'Mary Resident', 'mary.resident@jhb.co.za', 'citizen', jhb_id, '456 Oak Ave, Sandton', -26.1076, 28.0567),
        (gen_random_uuid(), 'David Official', 'david.official@joburg.org.za', 'official', jhb_id, '789 Government St, Johannesburg', -26.2041, 28.0473)
    ON CONFLICT (email) DO NOTHING;

    -- Pretoria users
    INSERT INTO users (id, name, email, role, municipality_id, home_address, lat, lng) VALUES
        (gen_random_uuid(), 'Sarah Smith', 'sarah.smith@pta.co.za', 'citizen', pta_id, '321 Church St, Pretoria', -25.7479, 28.2293),
        (gen_random_uuid(), 'Mike Johnson', 'mike.johnson@pta.co.za', 'citizen', pta_id, '654 Union Ave, Centurion', -25.8601, 28.1880),
        (gen_random_uuid(), 'Lisa Manager', 'lisa.manager@tshwane.gov.za', 'official', pta_id, '987 Municipal Rd, Pretoria', -25.7479, 28.2293)
    ON CONFLICT (email) DO NOTHING;

    -- Nairobi users
    INSERT INTO users (id, name, email, role, municipality_id, home_address, lat, lng) VALUES
        (gen_random_uuid(), 'James Mwangi', 'james.mwangi@nairobi.ke', 'citizen', nbo_id, '111 Kenyatta Ave, Nairobi', -1.2921, 36.8219),
        (gen_random_uuid(), 'Grace Wanjiku', 'grace.wanjiku@nairobi.ke', 'citizen', nbo_id, '222 Uhuru Highway, Nairobi', -1.2864, 36.8172),
        (gen_random_uuid(), 'Peter Kamau', 'peter.kamau@nairobi.gov.ke', 'official', nbo_id, '333 City Hall Way, Nairobi', -1.2921, 36.8219)
    ON CONFLICT (email) DO NOTHING;

    -- Cape Town users
    INSERT INTO users (id, name, email, role, municipality_id, home_address, lat, lng) VALUES
        (gen_random_uuid(), 'Emma van der Merwe', 'emma.vandermerwe@cpt.co.za', 'citizen', cpt_id, '444 Long St, Cape Town', -33.9249, 18.4241),
        (gen_random_uuid(), 'Thabo Ndlovu', 'thabo.ndlovu@cpt.co.za', 'citizen', cpt_id, '555 Adderley St, Cape Town', -33.9258, 18.4232),
        (gen_random_uuid(), 'Helen Adams', 'helen.adams@capetown.gov.za', 'official', cpt_id, '666 Civic Centre, Cape Town', -33.9249, 18.4241)
    ON CONFLICT (email) DO NOTHING;

END $$;