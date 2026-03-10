-- ============================================================
-- Performance Optimizations Migration
-- ============================================================

-- Increase timeout and memory for index operations
SET statement_timeout = '30min';
SET maintenance_work_mem = '512MB';

-- 1. Optimize vector search index
-- Drop existing index and recreate with better parameters
DROP INDEX IF EXISTS question_embeddings_ivfflat_idx;

CREATE INDEX question_embeddings_ivfflat_idx
  ON question_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 500);  -- Balanced for performance and creation time

-- Reset to defaults
RESET statement_timeout;
RESET maintenance_work_mem;

-- 2. Add missing composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS answers_session_team_idx 
  ON answers (game_session_id, team_id);

CREATE INDEX IF NOT EXISTS answers_session_question_idx 
  ON answers (game_session_id, question_id);

CREATE INDEX IF NOT EXISTS session_teams_session_score_idx
  ON session_teams (game_session_id, score DESC);

CREATE INDEX IF NOT EXISTS round_questions_round_order_idx
  ON round_questions (round_id, order_index);

-- 3. Add index for question history lookups
CREATE INDEX IF NOT EXISTS question_history_question_idx
  ON question_history (question_id, used_at DESC);

-- 4. Optimize RLS policy queries
CREATE INDEX IF NOT EXISTS game_sessions_host_status_idx
  ON game_sessions (host_id, status);

CREATE INDEX IF NOT EXISTS games_host_created_idx
  ON games (host_id, created_at DESC);

-- 5. Set optimal configuration for vector operations
-- Note: These are session-level settings. For permanent changes,
-- configure in Supabase dashboard or postgresql.conf

COMMENT ON INDEX question_embeddings_ivfflat_idx IS 
  'Optimized for semantic search with lists=1000. Use SET ivfflat.probes = 10 for better recall at query time.';
