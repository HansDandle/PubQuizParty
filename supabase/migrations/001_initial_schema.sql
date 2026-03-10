-- ============================================================
-- PubQuizParty — Initial Schema Migration
-- Run this against your Supabase project database
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- HOSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS hosts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT hosts_user_id_unique UNIQUE (user_id)
);

-- ============================================================
-- QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text           TEXT NOT NULL,
  answer                  TEXT NOT NULL,
  category                TEXT NOT NULL,
  subcategory             TEXT,
  tags                    TEXT[],
  difficulty              INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  source                  TEXT,
  source_year             INTEGER,
  verified                BOOLEAN DEFAULT FALSE,
  times_used              INTEGER DEFAULT 0,
  correct_rate            NUMERIC,
  average_time_to_answer  NUMERIC,
  normalized_hash         TEXT UNIQUE,
  canonical_id            UUID REFERENCES questions(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS questions_category_idx ON questions (category);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON questions (difficulty);
CREATE INDEX IF NOT EXISTS questions_tags_idx ON questions USING GIN (tags);

-- ============================================================
-- QUESTION EMBEDDINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS question_embeddings (
  question_id  UUID PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  embedding    VECTOR(384)
);

CREATE INDEX IF NOT EXISTS question_embeddings_ivfflat_idx
  ON question_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- QUESTION VARIANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS question_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  variant_text  TEXT NOT NULL
);

-- ============================================================
-- QUESTION HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS question_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id      UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  game_id      UUID,  -- FK to games added below (circular dep handled)
  used_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS question_history_host_used_idx ON question_history (host_id, used_at);

-- ============================================================
-- GAME TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS game_templates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id                   UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  round_count               INTEGER NOT NULL DEFAULT 4,
  default_timer_seconds     INTEGER,
  auto_advance              BOOLEAN DEFAULT FALSE,
  allow_confidence_scoring  BOOLEAN DEFAULT FALSE,
  allow_wager_round         BOOLEAN DEFAULT FALSE,
  allow_double_round        BOOLEAN DEFAULT FALSE,
  answer_reveal_mode        TEXT NOT NULL DEFAULT 'end_of_round'
                              CHECK (answer_reveal_mode IN ('per_question','end_of_round','end_of_game')),
  leaderboard_frequency     TEXT NOT NULL DEFAULT 'after_round'
                              CHECK (leaderboard_frequency IN ('never','after_question','after_round','manual')),
  display_theme             TEXT NOT NULL DEFAULT 'dark'
                              CHECK (display_theme IN ('dark','light','high_contrast')),
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROUND TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS round_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_template_id    UUID NOT NULL REFERENCES game_templates(id) ON DELETE CASCADE,
  round_number        INTEGER NOT NULL,
  round_name          TEXT NOT NULL,
  question_count      INTEGER NOT NULL DEFAULT 8,
  timer_seconds       INTEGER,
  wager_enabled       BOOLEAN DEFAULT FALSE,
  double_points       BOOLEAN DEFAULT FALSE,
  confidence_enabled  BOOLEAN DEFAULT FALSE,
  CONSTRAINT round_templates_unique_round UNIQUE (game_template_id, round_number)
);

-- ============================================================
-- GAMES
-- ============================================================
CREATE TABLE IF NOT EXISTS games (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id      UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  template_id  UUID REFERENCES game_templates(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Add deferred FK from question_history to games
ALTER TABLE question_history
  ADD CONSTRAINT question_history_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number        INTEGER NOT NULL,
  round_name          TEXT NOT NULL,
  timer_seconds       INTEGER,
  wager_enabled       BOOLEAN DEFAULT FALSE,
  double_points       BOOLEAN DEFAULT FALSE,
  confidence_enabled  BOOLEAN DEFAULT FALSE,
  CONSTRAINT rounds_unique_round UNIQUE (game_id, round_number)
);

-- ============================================================
-- ROUND QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS round_questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL,
  CONSTRAINT round_questions_unique_order UNIQUE (round_id, order_index)
);

-- ============================================================
-- GAME SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS game_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                 UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  host_id                 UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  room_code               TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting','active','finished')),
  current_round_id        UUID REFERENCES rounds(id) ON DELETE SET NULL,
  current_question_index  INTEGER DEFAULT 0,
  answer_reveal_mode      TEXT NOT NULL DEFAULT 'end_of_round'
                            CHECK (answer_reveal_mode IN ('per_question','end_of_round','end_of_game')),
  leaderboard_frequency   TEXT NOT NULL DEFAULT 'after_round'
                            CHECK (leaderboard_frequency IN ('never','after_question','after_round','manual')),
  display_theme           TEXT NOT NULL DEFAULT 'dark'
                            CHECK (display_theme IN ('dark','light','high_contrast')),
  started_at              TIMESTAMPTZ,
  finished_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT game_sessions_room_code_unique UNIQUE (room_code)
);

CREATE INDEX IF NOT EXISTS game_sessions_room_code_idx ON game_sessions (room_code);
CREATE INDEX IF NOT EXISTS game_sessions_status_idx ON game_sessions (status);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name      TEXT NOT NULL,
  avatar_emoji   TEXT DEFAULT '🎯',
  password_hash  TEXT,
  home_host_id   UUID REFERENCES hosts(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SESSION TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS session_teams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id  UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  avatar_emoji     TEXT DEFAULT '🎯',
  joined_at        TIMESTAMPTZ DEFAULT NOW(),
  score            INTEGER DEFAULT 0,
  correct_count    INTEGER DEFAULT 0,
  total_answered   INTEGER DEFAULT 0,
  CONSTRAINT session_teams_unique UNIQUE (game_session_id, team_id)
);

-- ============================================================
-- ANSWERS
-- ============================================================
CREATE TABLE IF NOT EXISTS answers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id  UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text      TEXT NOT NULL,
  confidence_rank  INTEGER CHECK (confidence_rank IN (1,2,3)),
  wager_amount     INTEGER,
  correct          BOOLEAN,
  points_awarded   INTEGER,
  submitted_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT answers_unique_per_question UNIQUE (game_session_id, team_id, question_id)
);

CREATE INDEX IF NOT EXISTS answers_session_idx ON answers (game_session_id);
CREATE INDEX IF NOT EXISTS answers_team_idx ON answers (team_id);

-- ============================================================
-- TEAM GAME RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS team_game_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_session_id  UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  score            INTEGER NOT NULL DEFAULT 0,
  rank             INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT team_game_results_unique UNIQUE (team_id, game_session_id)
);

-- ============================================================
-- TEAM CATEGORY STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS team_category_stats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category         TEXT NOT NULL,
  questions_seen   INTEGER DEFAULT 0,
  correct_answers  INTEGER DEFAULT 0,
  accuracy_rate    NUMERIC,
  CONSTRAINT team_category_stats_unique UNIQUE (team_id, category)
);

-- ============================================================
-- SEASONS
-- ============================================================
CREATE TABLE IF NOT EXISTS seasons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE,
  scoring_method  TEXT NOT NULL DEFAULT 'raw_score'
                    CHECK (scoring_method IN ('placement_points','raw_score','top_n')),
  top_n_games     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEASON SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS season_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  points        INTEGER DEFAULT 0,
  games_played  INTEGER DEFAULT 0,
  wins          INTEGER DEFAULT 0,
  CONSTRAINT season_scores_unique UNIQUE (season_id, team_id)
);

-- ============================================================
-- Enable Realtime on game_sessions
-- (Run in Supabase Dashboard > Database > Replication, or here)
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE session_teams;
-- ALTER PUBLICATION supabase_realtime ADD TABLE answers;
