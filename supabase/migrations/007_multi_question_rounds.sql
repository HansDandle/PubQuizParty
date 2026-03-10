-- ============================================================
-- Multi-Question Round Support
-- ============================================================
-- Allow hosts to "call" multiple questions simultaneously in a round
-- Players can see and answer all called questions

ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS called_question_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS game_sessions_called_questions_idx 
ON game_sessions USING GIN (called_question_ids);

COMMENT ON COLUMN game_sessions.called_question_ids IS 
'Array of round_question IDs that have been called/activated by the host. Players can answer any called question.';

-- ============================================================
-- Update Confidence Rank Constraint
-- ============================================================
-- Remove old constraint that only allowed ranks 1-3
ALTER TABLE answers 
DROP CONSTRAINT IF EXISTS answers_confidence_rank_check;

-- Add new constraint that allows any positive integer (for multiple questions per round)
ALTER TABLE answers 
ADD CONSTRAINT answers_confidence_rank_check CHECK (confidence_rank >= 1 AND confidence_rank <= 100);

COMMENT ON COLUMN answers.confidence_rank IS 
'Point value assigned to this answer (1-100). In ranking systems, higher values indicate higher confidence.';

-- ============================================================
-- Add Configurable Points Per Question
-- ============================================================
-- Add points_per_question to rounds table for non-confidence rounds
ALTER TABLE rounds 
ADD COLUMN IF NOT EXISTS points_per_question INTEGER DEFAULT 1;

COMMENT ON COLUMN rounds.points_per_question IS 
'Points awarded for each correct answer when confidence_enabled is false. Defaults to 1 point per correct answer.';

-- Add points_per_question to round_templates so new rounds inherit the setting
ALTER TABLE round_templates 
ADD COLUMN IF NOT EXISTS points_per_question INTEGER DEFAULT 1;

COMMENT ON COLUMN round_templates.points_per_question IS 
'Default points awarded for each correct answer in rounds created from this template. Used when confidence_enabled is false.';

