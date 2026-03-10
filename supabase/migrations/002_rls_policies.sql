-- ============================================================
-- PubQuizParty — Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_category_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_scores ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HOSTS — only own row
-- ============================================================
CREATE POLICY "hosts_select_own" ON hosts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "hosts_insert_own" ON hosts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "hosts_update_own" ON hosts
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- QUESTIONS — readable by all authenticated users + service role
-- ============================================================
CREATE POLICY "questions_select_all" ON questions
  FOR SELECT USING (true);

-- Only service role can insert/update (via pipeline or admin)
CREATE POLICY "questions_insert_service" ON questions
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "questions_update_service" ON questions
  FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================
-- QUESTION EMBEDDINGS — readable by all (needed for search)
-- ============================================================
CREATE POLICY "question_embeddings_select_all" ON question_embeddings
  FOR SELECT USING (true);

CREATE POLICY "question_embeddings_insert_service" ON question_embeddings
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- QUESTION VARIANTS — readable by all
-- ============================================================
CREATE POLICY "question_variants_select_all" ON question_variants
  FOR SELECT USING (true);

-- ============================================================
-- QUESTION HISTORY — host sees own records
-- ============================================================
CREATE POLICY "question_history_select_own" ON question_history
  FOR SELECT USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "question_history_insert_own" ON question_history
  FOR INSERT WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

-- ============================================================
-- GAME TEMPLATES — host owns their templates
-- ============================================================
CREATE POLICY "game_templates_select_own" ON game_templates
  FOR SELECT USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "game_templates_insert_own" ON game_templates
  FOR INSERT WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "game_templates_update_own" ON game_templates
  FOR UPDATE USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "game_templates_delete_own" ON game_templates
  FOR DELETE USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

-- ============================================================
-- ROUND TEMPLATES — via game template ownership
-- ============================================================
CREATE POLICY "round_templates_select_own" ON round_templates
  FOR SELECT USING (
    game_template_id IN (
      SELECT id FROM game_templates
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "round_templates_insert_own" ON round_templates
  FOR INSERT WITH CHECK (
    game_template_id IN (
      SELECT id FROM game_templates
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "round_templates_update_own" ON round_templates
  FOR UPDATE USING (
    game_template_id IN (
      SELECT id FROM game_templates
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "round_templates_delete_own" ON round_templates
  FOR DELETE USING (
    game_template_id IN (
      SELECT id FROM game_templates
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- GAMES — host owns their games
-- ============================================================
CREATE POLICY "games_select_own" ON games
  FOR SELECT USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "games_insert_own" ON games
  FOR INSERT WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "games_update_own" ON games
  FOR UPDATE USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "games_delete_own" ON games
  FOR DELETE USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

-- ============================================================
-- ROUNDS — via game ownership
-- ============================================================
CREATE POLICY "rounds_select_own" ON rounds
  FOR SELECT USING (
    game_id IN (
      SELECT id FROM games
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "rounds_insert_own" ON rounds
  FOR INSERT WITH CHECK (
    game_id IN (
      SELECT id FROM games
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "rounds_update_own" ON rounds
  FOR UPDATE USING (
    game_id IN (
      SELECT id FROM games
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "rounds_delete_own" ON rounds
  FOR DELETE USING (
    game_id IN (
      SELECT id FROM games
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- ROUND QUESTIONS — readable by all (needed for players)
-- ============================================================
CREATE POLICY "round_questions_select_all" ON round_questions
  FOR SELECT USING (true);

CREATE POLICY "round_questions_insert_own" ON round_questions
  FOR INSERT WITH CHECK (
    round_id IN (
      SELECT r.id FROM rounds r
      JOIN games g ON r.game_id = g.id
      WHERE g.host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "round_questions_delete_own" ON round_questions
  FOR DELETE USING (
    round_id IN (
      SELECT r.id FROM rounds r
      JOIN games g ON r.game_id = g.id
      WHERE g.host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- GAME SESSIONS — host owns; players read by room_code
-- ============================================================
CREATE POLICY "game_sessions_select_host" ON game_sessions
  FOR SELECT USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    OR status IN ('waiting', 'active')  -- players can see active sessions
  );

CREATE POLICY "game_sessions_insert_own" ON game_sessions
  FOR INSERT WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "game_sessions_update_own" ON game_sessions
  FOR UPDATE USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

-- ============================================================
-- TEAMS — anyone can create; teams can read their own
-- ============================================================
CREATE POLICY "teams_select_all" ON teams
  FOR SELECT USING (true);

CREATE POLICY "teams_insert_any" ON teams
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- SESSION TEAMS — readable by all; anyone can join
-- ============================================================
CREATE POLICY "session_teams_select_all" ON session_teams
  FOR SELECT USING (true);

CREATE POLICY "session_teams_insert_any" ON session_teams
  FOR INSERT WITH CHECK (true);

CREATE POLICY "session_teams_update_score" ON session_teams
  FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================
-- ANSWERS — teams submit; host reads all
-- ============================================================
CREATE POLICY "answers_select_host" ON answers
  FOR SELECT USING (
    game_session_id IN (
      SELECT id FROM game_sessions
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "answers_insert_any" ON answers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "answers_update_host" ON answers
  FOR UPDATE USING (
    game_session_id IN (
      SELECT id FROM game_sessions
      WHERE host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    )
    OR auth.role() = 'service_role'
  );

-- ============================================================
-- TEAM GAME RESULTS — public read
-- ============================================================
CREATE POLICY "team_game_results_select_all" ON team_game_results
  FOR SELECT USING (true);

CREATE POLICY "team_game_results_insert_service" ON team_game_results
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- TEAM CATEGORY STATS — public read
-- ============================================================
CREATE POLICY "team_category_stats_select_all" ON team_category_stats
  FOR SELECT USING (true);

CREATE POLICY "team_category_stats_upsert_service" ON team_category_stats
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- SEASONS — host owns; public read
-- ============================================================
CREATE POLICY "seasons_select_all" ON seasons
  FOR SELECT USING (true);

CREATE POLICY "seasons_insert_own" ON seasons
  FOR INSERT WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "seasons_update_own" ON seasons
  FOR UPDATE USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

-- ============================================================
-- SEASON SCORES — public read
-- ============================================================
CREATE POLICY "season_scores_select_all" ON season_scores
  FOR SELECT USING (true);

CREATE POLICY "season_scores_upsert_service" ON season_scores
  FOR ALL USING (auth.role() = 'service_role');
