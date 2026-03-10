-- ============================================================
-- Add unique constraint on team_name
-- Teams are identified by their name across sessions
-- ============================================================

-- Add unique constraint to team_name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS teams_team_name_unique_idx 
  ON teams (LOWER(team_name));

-- Add constraint to ensure team_name is unique (case-insensitive)
ALTER TABLE teams 
  DROP CONSTRAINT IF EXISTS teams_team_name_unique;

ALTER TABLE teams 
  ADD CONSTRAINT teams_team_name_unique 
  UNIQUE USING INDEX teams_team_name_unique_idx;
