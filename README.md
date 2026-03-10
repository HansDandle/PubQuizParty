# PubQuizParty 🎉

An AI-powered live trivia host platform. Hosts build and run pub quiz nights; players join on their phones; a TV display shows questions and scores in real time.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Database | Supabase (Postgres + pgvector + Realtime + Auth) |
| Styling | Tailwind CSS 3 (dark theme) |
| AI – Embeddings | HuggingFace Inference API (all-MiniLM-L6-v2, dim=384) |
| AI – LLM | Groq (llama3-8b) or Ollama (local) |
| Realtime | Supabase broadcast channels |

## Getting Started

### 1. Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project with pgvector enabled
- (Optional) HuggingFace API key for embeddings
- (Optional) Groq API key for LLM category tagging & Jeopardy reformatting

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL, anon key, service role key, and AI keys
```

### 4. Run database migrations

Apply all SQL files in order using the Supabase dashboard SQL editor or the CLI:

```bash
supabase db push
# or paste each file in supabase/migrations/ into the SQL editor in order
```

This creates all tables, RLS policies, and RPC helper functions (including pgvector similarity search).

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
src/
  app/
    page.tsx                    # Landing page
    login/ signup/              # Auth pages
    host/                       # Host-authenticated area
      dashboard/                # Overview: templates, games, sessions
      templates/                # Create / edit game templates
      games/                    # Build games (AI round gen + manual)
        [id]/session/           # Live session host control panel
      seasons/                  # Season management
      insights/                 # Venue analytics
    join/                       # Player join flow (room code → team setup)
    play/[session_id]/          # Live player view
    display/[session_id]/       # TV display screen
    season/[id]/leaderboard/    # Public season standings
    team/[id]/                  # Team profile & stats
    api/
      auth/                     # signup / logout
      templates/                # CRUD + clone
      games/                    # Create games, manage rounds
      rounds/generate/          # AI round generation (pgvector + LLM)
      sessions/                 # Create/update sessions, finish, answers, leaderboard
      join/                     # Player join room + team registration
      answers/                  # Host scoring
      hosts/[id]/insights/      # Venue analytics
      teams/[id]/stats/         # Team profile data
      seasons/[id]/leaderboard/ # Season standings
  lib/
    supabase/                   # client / server / middleware / types
    ai/embeddings.ts            # getEmbedding() + classifyTopic()
    utils.ts                    # Shared helpers

supabase/
  migrations/
    001_initial_schema.sql      # All 18 tables
    002_rls_policies.sql        # Row-level security for all tables
    003_rpc_functions.sql       # match_questions(), increment_team_score(), etc.
  functions/
    generate-round/index.ts     # Deno Edge Function (pgvector similarity search)

scripts/pipeline/
  ingest.py                     # Question bank ingestion CLI
  requirements.txt
```

## Gameplay Flow

1. **Host** signs up → creates a game template → builds rounds (AI-generated or manual)
2. **Host** starts a session → gets a 4-char room code + QR code
3. **Players** join on their phones via `pubquiz.app/join` or scanning the QR code
4. **Host** controls the session from the host panel: advances questions, manages the timer, scores answers
5. **Display screen** (`/display/:session_id`) shown on a TV/projector via browser
6. After the game, results are saved; if in a **season**, points are tallied

## Question Bank Pipeline

Two datasets are supported:

| Dataset | File | Rows |
|---------|------|------|
| Trivia Collection (categorized) | `Trivia Collection (Categorized) - questions.csv` | ~30,622 |
| Jeopardy seasons 1–41 | `header added combined_season1-41 - combined_season1-41.csv.csv` | ~997 |

### Run ingestion

```bash
cd scripts/pipeline
pip install -r requirements.txt

# Set env vars
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
export EMBEDDING_API_URL=https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2
export EMBEDDING_API_KEY=hf_your_token
export LLM_API_URL=https://api.groq.com/openai/v1/chat/completions
export LLM_API_KEY=your-groq-key

# Ingest trivia collection
python ingest.py --source trivia --file "../../Trivia Collection (Categorized) - questions.csv"

# Ingest Jeopardy (reformat clues to natural questions with LLM)
python ingest.py --source jeopardy \
  --file "../../header added combined_season1-41 - combined_season1-41.csv.csv" \
  --reformat-questions

# Dry run (no DB writes)
python ingest.py --source trivia --file questions.csv --dry-run
```

The pipeline:
1. Normalizes + SHA-256 deduplicates (skips already-ingested questions)
2. Maps raw categories → 17-category taxonomy (LLM or keyword heuristic)
3. Computes sentence embeddings (dim=384) for pgvector similarity search
4. Inserts in configurable batch sizes

## Realtime Events

Game state is broadcast on channel `game:session:{session_id}`:

| Event | Payload |
|-------|---------|
| `round_start` | `{ round_number, round_name }` |
| `question_start` | `{ question_id, question_text, choices?, timer_seconds }` |
| `timer_update` | `{ seconds_remaining }` |
| `answer_lock` | `{}` |
| `answer_reveal` | `{ correct_answer, question_id }` |
| `score_update` | `{ team_id, new_score, delta }` |
| `leaderboard_show` | `{ standings: [{rank, team_name, score}] }` |
| `game_finish` | `{ final_standings }` |

## Scripts

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build
npm run type-check # TypeScript check without emitting
npm run lint       # ESLint
```
