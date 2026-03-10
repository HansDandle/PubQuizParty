# Question Bank Pipeline — Spec Additions & Assessment

This document supplements `questionBankPipeline.md` with concrete implementation detail derived from the actual source datasets. An AI agent should treat this as the authoritative guide for the ingestion pipeline.

---

# Source Dataset Analysis

## Dataset 1: Trivia Collection (Categorized)

```
File:         Trivia_Collection__Categorized__-_questions.csv
Rows:         30,622 questions
Missing data: None (question, answer, category, difficulty all complete)
Flagged rows: 0
```

### Fields available
```
Code          integer — internal ID, discard after import
Category      text    — 14 top-level categories (usable as-is)
Sub_Category  integer — numeric code, not useful directly
SubCatName    text    — pipe-delimited e.g. "Arts & Literature|Literature & Authors" — USE THIS
Question      text
Answer        text
Difficulty    text    — see mapping below
Flag          text    — empty in all rows, ignore
```

### Difficulty mapping (text → integer 1–5)
```
Common Knowledge      → 1
Moderate Knowledge    → 2
Specialized Knowledge → 3
Obscure Knowledge     → 4
(anything else)       → NULL, flag for manual review
```

Note: a small number of rows (~20) have garbage values in the Difficulty column ("Brown", "Tango", "Milk", etc.) — these are data entry errors and should be set to NULL and flagged.

### Category mapping
The 14 existing categories are clean and map well to the platform hierarchy. Use them directly as `category`. Use `SubCatName` (right side of pipe) as `subcategory`.

```
Arts & Literature
Business & Economics
Entertainment
Food & Drink
Geography
History
Holidays & Traditions
Language & Words
Mathematics & Logic
Music
People & Places
Religion & Mythology
Science & Nature
Sports & Leisure
Technology & Gaming
Transportation
```

---

## Dataset 2: Season Archive (Jeopardy-style)

```
File:         exampleheader_added_combined_season1-41_-_Sheet1.csv
Rows:         997 questions
Missing data: None
Unique categories: 192 (all freeform, e.g. "LAKES & RIVERS", "THE OLYMPICS", "'50S TV")
```

### Fields available
```
round         integer — Jeopardy round number, discard
clue_value    integer — dollar value (100–1000), use as difficulty proxy
category      text    — freeform ALL CAPS, needs normalization + mapping
question      text    — phrased as clue, not direct question (see note)
answer        text
air_date      date    — useful as `year` field
```

### Difficulty mapping (clue_value → integer 1–5)
```
100  → 1
200  → 1
300  → 2
400  → 2
500  → 3
600  → 3
800  → 4
1000 → 5
0    → NULL (daily doubles — value unknown)
```

### Category normalization
The 192 freeform categories need to be mapped to the platform's top-level category taxonomy. This should be done using the LLM (one-shot classification prompt), not hardcoded rules, because the long tail is too varied.

Example prompt pattern:
```
Given this trivia category name: "LAKES & RIVERS"
Map it to exactly one of these categories:
[Arts & Literature, Business & Economics, Entertainment, Food & Drink,
Geography, History, Holidays & Traditions, Language & Words,
Mathematics & Logic, Music, People & Places, Religion & Mythology,
Science & Nature, Sports & Leisure, Technology & Gaming, Transportation, Other]
Return only the category name.
```

The original freeform category should be stored as `subcategory` after lowercasing and title-casing.

### Important: Jeopardy phrasing
Jeopardy clues are phrased as statements that prompt a "What is X?" response. The pipeline should reformat these into direct questions.

Example:
```
Original:  "River mentioned most often in the Bible"
Answer:    "the Jordan"
Reformat:  "Which river is mentioned most often in the Bible?"
```

Use the LLM to reformat these. Prompt pattern:
```
Convert this Jeopardy clue into a direct trivia question.
Clue: "River mentioned most often in the Bible"
Answer: "the Jordan"
Return only the question text. Do not include the answer.
```

---

# Revised Normalized Schema

This replaces the schema in `questionBankPipeline.md`.

## questions

```sql
CREATE TABLE questions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text         TEXT NOT NULL,
  answer                TEXT NOT NULL,
  category              TEXT NOT NULL,         -- top-level taxonomy value
  subcategory           TEXT,                  -- e.g. "Literature & Authors"
  tags                  TEXT[],                -- auto-generated, e.g. ['ocean','fish','marine']
  difficulty            INTEGER,               -- 1 (easy) to 5 (hard), NULL if unknown
  source                TEXT,                  -- e.g. 'trivia_collection', 'jeopardy_s1-41'
  source_year           INTEGER,               -- year of original question if known
  verified              BOOLEAN DEFAULT FALSE, -- manually reviewed
  times_used            INTEGER DEFAULT 0,
  correct_rate          NUMERIC,               -- updated by background job
  average_time_to_answer NUMERIC,              -- seconds, updated by background job
  normalized_hash       TEXT UNIQUE,           -- for exact dedup (see below)
  canonical_id          UUID REFERENCES questions(id), -- points to preferred version if this is a variant
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

## question_embeddings

```sql
CREATE TABLE question_embeddings (
  question_id  UUID PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  embedding    VECTOR(384)  -- all-MiniLM-L6-v2 or BGE-small output dimension
);

CREATE INDEX ON question_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

## question_variants

```sql
CREATE TABLE question_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  variant_text  TEXT NOT NULL
);
```

Variants are alternate phrasings of the same question. The canonical version lives in `questions`. Variants are used for display rotation only — they are not independently searchable.

## question_history

(Already defined in scaffold-additions.md — repeated here for completeness)

```sql
CREATE TABLE question_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id      UUID NOT NULL REFERENCES hosts(id),
  question_id  UUID NOT NULL REFERENCES questions(id),
  game_id      UUID REFERENCES games(id),
  used_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON question_history (host_id, used_at);
```

---

# Pipeline Implementation

The pipeline is a standalone script (not part of the Next.js app). Run it once for initial load and on-demand for new source imports.

Suggested stack: **Python script**, run locally or as a one-off job. Does not need to be a deployed service.

## Step-by-step

### Step 1: Load and normalize

For each source file, normalize all rows into this intermediate structure:

```python
{
  "question_text": str,
  "answer": str,
  "category": str,        # top-level, normalized
  "subcategory": str,     # original sub-category
  "difficulty": int,      # 1–5 or None
  "source": str,
  "source_year": int | None,
  "raw_category": str     # preserve original for debugging
}
```

Apply the difficulty mappings defined above per source.

For dataset 2 (Jeopardy), run the LLM reformatter on question_text before storing.

### Step 2: Exact deduplication

Normalize each question for hashing:

```python
import re, hashlib

def normalize_for_hash(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def make_hash(text: str) -> str:
    return hashlib.sha256(normalize_for_hash(text).encode()).hexdigest()
```

Before inserting any row, check if `normalized_hash` already exists. If it does, skip.

### Step 3: Category auto-tagging

Generate tags using the LLM. One API call per question is too slow at scale — batch them.

Recommended approach: batch 50 questions per LLM call.

Prompt pattern:
```
For each of the following trivia questions, return a JSON array of 2–5 lowercase descriptive tags.
Tags should describe the topic, not the category. Focus on the subject matter.

Questions:
1. Which planet has the most moons?
2. What is the capital of France?
3. Who wrote Moby Dick?

Return a JSON array of arrays, one per question:
[["planets","astronomy","solar system"],["geography","europe","capitals"],["literature","novels","american authors"]]
Return only the JSON. No explanation.
```

Store results in `questions.tags` as a text array.

### Step 4: Generate embeddings

Use `sentence-transformers` with `all-MiniLM-L6-v2` locally:

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")

# Batch for efficiency
embeddings = model.encode(question_texts, batch_size=256, show_progress_bar=True)
```

Insert into `question_embeddings` in batches of 500 using `psycopg2` or `supabase-py`.

### Step 5: Semantic deduplication

After all embeddings are generated, run a nearest-neighbor pass:

```sql
-- Find candidate duplicates (cosine similarity > 0.92)
SELECT a.question_id, b.question_id,
       1 - (a.embedding <=> b.embedding) AS similarity
FROM question_embeddings a
JOIN question_embeddings b ON a.question_id < b.question_id
WHERE 1 - (a.embedding <=> b.embedding) > 0.92;
```

For each pair above the threshold:
- Keep the question with the richer metadata (verified source, subcategory, etc.)
- Set `canonical_id` on the duplicate to point to the keeper
- Do NOT delete the duplicate — it becomes a variant

At scale (300k+ questions), the full pairwise join is too expensive. Instead, use approximate nearest neighbor: for each question, find its top-3 neighbors and check only those pairs.

---

# Expected Pipeline Output

After running the full pipeline on the provided datasets:

```
Dataset 1 input:     30,622 rows
Dataset 2 input:        997 rows
                    ─────────
Raw total:           31,619

Exact duplicates:    ~2,000–4,000 estimated
Semantic dupes:      ~1,000–2,000 estimated
Garbage difficulty:      ~20 rows (flagged, not deleted)

Estimated final:     ~26,000–28,000 clean questions
```

This is well short of the 300k–400k target mentioned in the pipeline doc. The provided files are sample/seed data only. The pipeline architecture supports ingesting additional bulk datasets (e.g. Open Trivia Database, full Jeopardy archive) to reach the target volume.

---

# Ingestion API (for future sources)

Once the platform is live, new questions can be added via a protected admin endpoint:

```
POST /api/admin/questions/import
  body: { source: string, rows: NormalizedQuestion[] }
  returns: { inserted: number, skipped_duplicates: number, flagged: number }
```

This calls the same normalization and dedup logic as the offline pipeline.

---

# Additions to scaffold-additions.md Schema

The following tables should be added to the main schema document:

### question_variants (add to schema)

Already defined above. Key point: variants are linked to a `question_id` and used for display rotation. They are not independently indexed or searchable.

### Updated questions table

Add these columns to the `questions` table in `scaffold-additions.md`:

```
normalized_hash       text UNIQUE   -- SHA-256 of lowercased, stripped question_text
canonical_id          uuid NULL FK → questions.id  -- set if this is a duplicate/variant
source                text          -- 'trivia_collection' | 'jeopardy' | 'manual' | etc.
source_year           integer NULL  -- year of original question
subcategory           text NULL     -- e.g. "Literature & Authors", "Solar System"
tags                  text[]        -- auto-generated topic tags
```

The `subcategory` column was missing from the original schema and is important for both display and search refinement.

---

# Pipeline Script Entrypoint

The agent should scaffold a script at:

```
scripts/pipeline/ingest.py
```

With CLI interface:
```bash
python scripts/pipeline/ingest.py \
  --source trivia_collection \
  --file data/Trivia_Collection__Categorized__-_questions.csv \
  --reformat-questions false \
  --batch-size 256

python scripts/pipeline/ingest.py \
  --source jeopardy \
  --file data/exampleheader_added_combined_season1-41_-_Sheet1.csv \
  --reformat-questions true \
  --batch-size 64
```

The `--reformat-questions` flag triggers the LLM Jeopardy reformatter. It should default to `false` for non-Jeopardy sources.
