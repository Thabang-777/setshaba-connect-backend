/*
  # Add created_by field to status_updates table

  1. Changes
    - Add `created_by` column to `status_updates` table
    - Add foreign key constraint to `users` table
    - Add index for performance

  2. Security
    - Update RLS policies to include created_by checks
*/

-- Add created_by column to status_updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'status_updates' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE status_updates ADD COLUMN created_by uuid REFERENCES users(id);
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_status_updates_created_by ON status_updates(created_by);

-- Update RLS policies for status_updates
DROP POLICY IF EXISTS "Officials can create status updates" ON status_updates;
DROP POLICY IF EXISTS "Anyone can read updates" ON status_updates;

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

CREATE POLICY "Anyone can read status updates"
  ON status_updates
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Officials can update their own status updates"
  ON status_updates
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());