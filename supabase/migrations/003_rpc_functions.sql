-- RPC: match_questions via pgvector cosine similarity
CREATE OR REPLACE FUNCTION match_questions(
  query_embedding VECTOR(384),
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  answer TEXT,
  category TEXT,
  subcategory TEXT,
  difficulty INTEGER,
  source TEXT,
  source_year INTEGER,
  tags TEXT[],
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    q.id,
    q.question_text,
    q.answer,
    q.category,
    q.subcategory,
    q.difficulty,
    q.source,
    q.source_year,
    q.tags,
    1 - (qe.embedding <=> query_embedding) AS similarity
  FROM questions q
  JOIN question_embeddings qe ON q.id = qe.question_id
  ORDER BY qe.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RPC: increment_team_score atomically
CREATE OR REPLACE FUNCTION increment_team_score(
  p_session_id UUID,
  p_team_id UUID,
  p_delta INT
)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE session_teams
  SET score = COALESCE(score, 0) + p_delta
  WHERE game_session_id = p_session_id
    AND team_id = p_team_id;
$$;

-- RPC: update_team_correct_count atomically
CREATE OR REPLACE FUNCTION update_team_correct_count(
  p_session_id UUID,
  p_team_id UUID,
  p_delta INT
)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE session_teams
  SET correct_count = COALESCE(correct_count, 0) + p_delta
  WHERE game_session_id = p_session_id
    AND team_id = p_team_id;
$$;

CREATE OR REPLACE FUNCTION increment_team_total_answered(
  p_session_id UUID,
  p_team_id UUID,
  p_delta INT
)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE session_teams
  SET total_answered = COALESCE(total_answered, 0) + p_delta
  WHERE game_session_id = p_session_id
    AND team_id = p_team_id;
$$;
