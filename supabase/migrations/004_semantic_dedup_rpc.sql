-- ============================================================
-- Semantic Deduplication RPC Function
-- Enables efficient nearest-neighbor search for duplicate detection
-- ============================================================

CREATE OR REPLACE FUNCTION find_similar_questions(
  query_question_id UUID,
  similarity_threshold FLOAT DEFAULT 0.92,
  max_results INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.question_text,
    (1 - (qe1.embedding <=> qe2.embedding)) AS similarity
  FROM question_embeddings qe1
  CROSS JOIN question_embeddings qe2
  JOIN questions q ON q.id = qe2.question_id
  WHERE qe1.question_id = query_question_id
    AND qe2.question_id != query_question_id
    AND q.canonical_id IS NULL  -- Don't re-flag already marked duplicates
    AND (1 - (qe1.embedding <=> qe2.embedding)) > similarity_threshold
  ORDER BY qe1.embedding <=> qe2.embedding ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_similar_questions TO service_role;
GRANT EXECUTE ON FUNCTION find_similar_questions TO authenticated;
