-- ============================================================
-- Support for Host-Generated Questions
-- Add ability to track which host created custom questions
-- ============================================================

-- Add created_by_host_id to track host-generated questions
ALTER TABLE questions 
  ADD COLUMN IF NOT EXISTS created_by_host_id UUID REFERENCES hosts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS questions_created_by_host_idx ON questions (created_by_host_id);

-- Drop existing policies if they exist to allow recreation
DROP POLICY IF EXISTS "questions_insert_host_own" ON questions;
DROP POLICY IF EXISTS "questions_update_host_own" ON questions;  
DROP POLICY IF EXISTS "questions_delete_host_own" ON questions;

-- Update RLS policy: hosts can insert their own questions
CREATE POLICY "questions_insert_host_own" ON questions
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role' OR 
    (auth.uid() IN (SELECT user_id FROM hosts WHERE id = created_by_host_id))
  );

-- Hosts can update their own questions
CREATE POLICY "questions_update_host_own" ON questions
  FOR UPDATE USING (
    auth.role() = 'service_role' OR
    (auth.uid() IN (SELECT user_id FROM hosts WHERE id = created_by_host_id))
  );

-- Hosts can delete their own questions
CREATE POLICY "questions_delete_host_own" ON questions
  FOR DELETE USING (
    auth.role() = 'service_role' OR
    (auth.uid() IN (SELECT user_id FROM hosts WHERE id = created_by_host_id))
  );
