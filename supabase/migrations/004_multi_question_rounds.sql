-- ============================================================
-- Multi-Question Round Support
-- ============================================================
-- Allow hosts to "call" multiple questions simultaneously in a round
-- Players can see and answer all called questions

ALTER TABLE game_sessions 
ADD COLUMN called_question_ids UUID[] DEFAULT ARRAY[]::UUID[];

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

