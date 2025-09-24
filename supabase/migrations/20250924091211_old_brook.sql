/*
  # Create Report Upvotes Table

  1. New Tables
    - `report_upvotes`
      - `id` (uuid, primary key)
      - `report_id` (uuid, references reports)
      - `user_id` (uuid, references users)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `report_upvotes` table
    - Add policy for citizens to manage their own upvotes

  3. Constraints
    - Unique constraint on (report_id, user_id) to prevent duplicate upvotes

  4. Indexes
    - Index on report_id for efficient upvote counting
    - Index on user_id for user upvote history

  5. Triggers
    - Trigger to automatically update report upvotes count

  6. Functions
    - Function to update report upvotes count when upvotes are added/removed
*/

-- Create report_upvotes table
CREATE TABLE IF NOT EXISTS report_upvotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(report_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_report_upvotes_report_id ON report_upvotes(report_id);
CREATE INDEX IF NOT EXISTS idx_report_upvotes_user_id ON report_upvotes(user_id);

-- Enable RLS
ALTER TABLE report_upvotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Citizens can manage their own upvotes" ON report_upvotes;

-- Create RLS policies
CREATE POLICY "Citizens can manage their own upvotes"
  ON report_upvotes
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create or replace function to update report upvotes count
CREATE OR REPLACE FUNCTION update_report_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reports 
    SET upvotes = (
      SELECT COUNT(*) 
      FROM report_upvotes 
      WHERE report_id = NEW.report_id
    )
    WHERE id = NEW.report_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reports 
    SET upvotes = (
      SELECT COUNT(*) 
      FROM report_upvotes 
      WHERE report_id = OLD.report_id
    )
    WHERE id = OLD.report_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_report_upvotes ON report_upvotes;

-- Create trigger to automatically update report upvotes count
CREATE TRIGGER trigger_update_report_upvotes
  AFTER INSERT OR DELETE ON report_upvotes
  FOR EACH ROW
  EXECUTE FUNCTION update_report_upvotes();