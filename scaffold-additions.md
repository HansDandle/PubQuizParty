# AI Trivia Host Platform — Spec Additions

This document supplements `initialscaffold.md` with the sections most likely to cause an AI coding agent to make bad assumptions. Add these into the main scaffold before handing it off.

---

# Auth Roles

The platform has three distinct roles. All auth is handled by Supabase Auth with Row Level Security enforcing access at the database level.

## host

- Authenticated Supabase user
- Has a corresponding row in the `hosts` table
- Can create and manage their own templates, games, and sessions
- Cannot see other hosts' games or questions they didn't create
- Accesses: `/host/*` routes

## player (team)

- No Supabase account required
- Identified by `team_id` stored in browser session/localStorage
- Optionally password-protected (for persistent teams)
- Can only submit answers for sessions they have joined
- Accesses: `/join/*` and `/play/*` routes

## admin (future)

- Full access to question database
- Can verify, edit, and bulk-import questions
- Not required for MVP

---

# Revised Database Schema

This replaces and expands the schema in the main scaffold. All tables use UUID primary keys. `created_at` defaults to `now()`.

---

## users

Managed by Supabase Auth. No custom table needed. Reference via `auth.users`.

---

## hosts

```
id            uuid PK
user_id       uuid FK → auth.users.id  UNIQUE
display_name  text
created_at    timestamptz
```

---

## questions

```
id                uuid PK
question_text     text NOT NULL
answer            text NOT NULL
category          text
difficulty        integer  -- 1 (easy) to 5 (hard)
tags              text[]
verified          boolean DEFAULT false
source            text
times_used        integer DEFAULT 0
correct_rate      numeric  -- updated by background job
average_time_to_answer  numeric  -- seconds, updated by background job
created_at        timestamptz
```

---

## question_embeddings

```
question_id   uuid PK FK → questions.id
embedding     vector(384)  -- dimension matches BGE-small / all-MiniLM-L6-v2
```

Index: `CREATE INDEX ON question_embeddings USING ivfflat (embedding vector_cosine_ops)`

---

## question_history

Tracks which questions a host has used recently. Used for duplicate detection.

```
id            uuid PK
host_id       uuid FK → hosts.id
question_id   uuid FK → questions.id
used_at       timestamptz
game_id       uuid FK → games.id
```

Duplicate window query example:
```sql
SELECT question_id FROM question_history
WHERE host_id = $1
  AND used_at > now() - interval '6 months'
```

---

## game_templates

```
id                      uuid PK
host_id                 uuid FK → hosts.id
name                    text
round_count             integer
default_timer_seconds   integer  -- null = no timer
auto_advance            boolean DEFAULT false
allow_confidence_scoring boolean DEFAULT false
allow_wager_round       boolean DEFAULT false
allow_double_round      boolean DEFAULT false
answer_reveal_mode      text  -- 'per_question' | 'end_of_round' | 'end_of_game'
leaderboard_frequency   text  -- 'never' | 'after_question' | 'after_round' | 'manual'
display_theme           text DEFAULT 'dark'  -- 'dark' | 'light' | 'high_contrast'
created_at              timestamptz
```

---

## round_templates

```
id                  uuid PK
game_template_id    uuid FK → game_templates.id
round_number        integer
round_name          text
question_count      integer
timer_seconds       integer  -- overrides template default; null = inherit
wager_enabled       boolean DEFAULT false
double_points       boolean DEFAULT false
confidence_enabled  boolean DEFAULT false
```

---

## games

Saved game instances generated from a template. A game is the content (questions). A session is the live running instance.

```
id            uuid PK
host_id       uuid FK → hosts.id
template_id   uuid FK → game_templates.id  -- nullable (game may be created ad-hoc)
title         text
created_at    timestamptz
```

---

## rounds

```
id            uuid PK
game_id       uuid FK → games.id
round_number  integer
round_name    text
timer_seconds integer  -- null = no timer for this round
wager_enabled       boolean DEFAULT false
double_points       boolean DEFAULT false
confidence_enabled  boolean DEFAULT false
```

---

## round_questions

```
id            uuid PK
round_id      uuid FK → rounds.id
question_id   uuid FK → questions.id
order_index   integer
```

---

## game_sessions

The live running instance of a game.

```
id                uuid PK
game_id           uuid FK → games.id
host_id           uuid FK → hosts.id
room_code         text UNIQUE  -- e.g. 'H7K2', 4-char uppercase
status            text  -- 'waiting' | 'active' | 'finished'
current_round_id  uuid FK → rounds.id  -- null until game starts
current_question_index  integer DEFAULT 0
answer_reveal_mode      text  -- copied from template at session start
leaderboard_frequency   text
display_theme           text
created_at        timestamptz
started_at        timestamptz
finished_at       timestamptz
```

---

## teams

Supports both ephemeral (no password) and persistent (password-protected) teams.

```
id             uuid PK
team_name      text NOT NULL
password_hash  text  -- null for ephemeral teams
home_host_id   uuid FK → hosts.id  -- optional, for league affiliation
created_at     timestamptz
```

---

## session_teams

Join table linking teams to a specific game session.

```
id               uuid PK
game_session_id  uuid FK → game_sessions.id
team_id          uuid FK → teams.id
avatar_emoji     text
joined_at        timestamptz
score            integer DEFAULT 0
```

This replaces putting `score` directly on `teams`, since a team's score is per-session, not global.

---

## answers

```
id               uuid PK
game_session_id  uuid FK → game_sessions.id
team_id          uuid FK → teams.id
question_id      uuid FK → questions.id
answer_text      text
confidence_rank  integer  -- 1 | 2 | 3, null if not enabled
wager_amount     integer  -- null if not a wager question
correct          boolean  -- set by host when scoring
points_awarded   integer  -- calculated after host marks correct
submitted_at     timestamptz
```

---

## team_game_results

Summary record written at end of each session.

```
id               uuid PK
team_id          uuid FK → teams.id
game_session_id  uuid FK → game_sessions.id
score            integer
rank             integer
created_at       timestamptz
```

---

## team_category_stats

Updated by nightly background job.

```
id               uuid PK
team_id          uuid FK → teams.id
category         text
questions_seen   integer DEFAULT 0
correct_answers  integer DEFAULT 0
accuracy_rate    numeric  -- computed: correct_answers / questions_seen
```

---

## seasons

```
id          uuid PK
host_id     uuid FK → hosts.id
name        text
start_date  date
end_date    date
scoring_method  text  -- 'placement_points' | 'raw_score' | 'top_n'
top_n_games     integer  -- only used when scoring_method = 'top_n'
created_at  timestamptz
```

---

## season_scores

```
id            uuid PK
season_id     uuid FK → seasons.id
team_id       uuid FK → teams.id
points        integer DEFAULT 0
games_played  integer DEFAULT 0
wins          integer DEFAULT 0
```

---

# AI Integration Architecture

The AI pipeline should be implemented as **Supabase Edge Functions** (Deno). This keeps embeddings and LLM calls server-side and away from the client.

## Embedding Flow

1. Client (Next.js) calls `POST /api/rounds/generate` with round topics
2. Next.js API route calls Supabase Edge Function `generate-round`
3. Edge Function converts topic text to embedding using `all-MiniLM-L6-v2` (via HuggingFace Inference API or a self-hosted endpoint)
4. Edge Function runs pgvector similarity search against `question_embeddings`
5. Filters out questions in `question_history` for this host within 6 months
6. Returns top 8 questions ranked by similarity score

## LLM Usage

LLMs (Llama 3 8B or Phi-3 Mini) are used only for:
- Parsing freeform round topic text into structured category queries
- Question cleanup / deduplication flagging

LLMs must NOT generate trivia questions. All questions come from the database.

Suggested hosting: Ollama on a small VPS, or Groq API for Llama 3 8B (fast, low latency).

---

# API Surface

These are the minimum routes needed for MVP. All `/api/*` routes are Next.js API routes. Auth is validated via Supabase JWT on every request.

## Auth
```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
```

## Host — Templates
```
GET    /api/templates              List host's templates
POST   /api/templates              Create template
GET    /api/templates/:id          Get single template
PUT    /api/templates/:id          Update template
DELETE /api/templates/:id          Delete template
POST   /api/templates/:id/clone    Clone a template
```

## Host — Games
```
POST   /api/games                  Create game (from template or blank)
GET    /api/games/:id              Get game with rounds and questions
PUT    /api/games/:id/rounds       Update rounds (bulk replace)
```

## AI Round Generation
```
POST   /api/rounds/generate        
  body: { host_id, topics: string[], question_count: number, exclude_question_ids: string[] }
  returns: { rounds: [{ topic, questions: Question[] }] }
```

## Sessions
```
POST   /api/sessions               Create session from game_id, generates room_code
GET    /api/sessions/:id           Get session state
PATCH  /api/sessions/:id           Update status, current_round, current_question_index
POST   /api/sessions/:id/finish    Mark session finished, write team_game_results
```

## Player Join
```
GET    /api/join/:room_code        Validate room code, return session info
POST   /api/join/:room_code/team   Join session as team (create or authenticate persistent team)
```

## Answers
```
POST   /api/sessions/:id/answers   Submit answer (player-facing)
PATCH  /api/answers/:id            Mark correct/incorrect and award points (host-facing)
GET    /api/sessions/:id/answers   Get all answers for session (host-facing)
```

## Leaderboard
```
GET    /api/sessions/:id/leaderboard   Current standings for session
```

## Analytics
```
GET    /api/hosts/:id/insights     Venue metrics summary
GET    /api/teams/:id/stats        Team profile and category stats
GET    /api/seasons/:id/leaderboard  Season standings
```

---

# Realtime Events

The display screen and player views subscribe to Supabase Realtime on the `game_sessions` table and a `game_events` broadcast channel.

## Channel: `game:session:{session_id}`

Events broadcast by the host control panel and consumed by display screen and player devices:

```
round_start         { round_id, round_number, round_name, question_count }
question_start      { question_id, question_text, question_number, timer_seconds }
timer_update        { seconds_remaining }
answer_lock         {}  -- timer expired or host locked answers
answer_reveal       { question_id, correct_answer, explanation? }
score_update        { team_scores: [{ team_id, team_name, score }] }
leaderboard_show    { standings: [{ rank, team_name, score }] }
game_finish         {}
```

Display and player clients subscribe on mount and update local state on each event. No polling.

---

# Page Routes (Next.js)

```
/                          Marketing / landing page
/login                     Host login
/signup                    Host signup

/host/dashboard            Host home — list templates and recent games
/host/templates/new        Create template
/host/templates/:id        Edit template
/host/games/new            Create game (select template, enter round topics)
/host/games/:id            Edit game rounds manually
/host/games/:id/session    Active session control panel
/host/seasons              Manage seasons
/host/insights             Venue analytics

/display/:session_id       Public display screen (TV/projector mode)

/join                      Player landing — enter room code
/join/:room_code           Team name entry / join flow
/play/:session_id          Player answer submission view

/team/:id                  Public team stats page (optional)
/season/:id/leaderboard    Public season leaderboard
```

---

# Environment Variables

The agent should expect these in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # server-side only
EMBEDDING_API_URL                  # HuggingFace or self-hosted endpoint
EMBEDDING_API_KEY
LLM_API_URL                        # Groq, Ollama, or other
LLM_API_KEY
```

---

# MVP Scope Clarifications

These items are explicitly OUT of scope for MVP to prevent scope creep:

- Slide generation (PowerPoint / Google Slides export)
- Elo / skill ratings
- Predictive difficulty insights
- Remote venue display link (permanent screen URL)
- Animated transitions on display screen
- Admin dashboard for question management
- Host analytics beyond basic venue metrics

Everything in the "Future Features" and "Optional Future" sections of the main scaffold is post-MVP.
