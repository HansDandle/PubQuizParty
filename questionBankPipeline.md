# Question Bank Pipeline

## Overview

The platform will ingest large trivia datasets (500k+ questions) and convert them into a clean, searchable question bank.

The pipeline performs the following steps:


raw datasets
↓
normalize fields
↓
remove duplicates
↓
auto-tag questions
↓
generate embeddings
↓
store in database


The result is a high-quality master trivia database.

---

# Supported Data Sources

Example source formats include:


CSV
TSV
JSON


Typical fields include:


question
answer
category
subcategory
difficulty
source
year


All sources must be normalized into a consistent schema.

---

# Normalized Question Schema

The final question record should include:


id
question_text
answer
category
subcategory
tags
difficulty
source
year
embedding
times_used
correct_rate
created_at


---

# Duplicate Detection

Large datasets contain many duplicate or near-duplicate questions.

Duplicate removal should occur in two stages.

---

## Exact Duplicate Removal

Normalize question text by:


lowercasing
removing punctuation
removing extra whitespace


Then compute a hash of the normalized question.

Questions with identical hashes are considered duplicates.

---

## Semantic Duplicate Detection

Some duplicates differ slightly in wording.

Example:


What year did World War II end?
When did World War 2 end?


To detect these:

1. Generate embeddings for each question.
2. Compare cosine similarity.
3. If similarity exceeds a threshold (e.g. 0.92), mark as duplicates.

Only one version should remain in the database.

---

# Automatic Tagging

Questions should automatically receive descriptive tags.

Example tags:


animals
space
science
cars
music
movies
sports
geography
history
food
brands
literature


Tags allow hosts to generate rounds using natural language topics.

Example:


Round topic: Aquatic Life


System should retrieve questions tagged with:


ocean
fish
marine biology
sea animals


---

# Category Hierarchy

Categories should follow a structured hierarchy.

Example:


Science
Astronomy
Biology
Chemistry

Entertainment
Movies
Music
Television

Sports
Baseball
Football
Olympics


Questions may belong to multiple tags but only one primary category.

---

# Question Embeddings

Each question should include a semantic embedding vector.

Embeddings enable natural language search.

Example workflow:

Host enters:


Round topic: Cars


System converts the topic to an embedding vector and retrieves similar questions.

Embeddings should be stored using a vector database extension.

Example:


Postgres + pgvector


---

# Difficulty Estimation

Questions should include a difficulty estimate.

Initial difficulty can be derived from:


original dataset difficulty
question length
rarity of vocabulary


Difficulty should later be refined using gameplay analytics.

Example metrics:


correct_rate
average_time_to_answer
confidence_scores


---

# Question Usage Tracking

The system must track when questions are used.

Table example:


question_usage

question_id

host_id

game_session_id

used_at


Hosts should be able to filter out recently used questions.

Example rule:


exclude questions used within the last 180 days


---

# Question Quality Metrics

The system should track question performance.

Metrics include:


times_used
correct_rate
host_rating


Poor performing questions may be automatically flagged.

---

# Question Variants

Some questions may have multiple acceptable phrasings.

Example:


Which planet has the most moons?
Which planet in our solar system has the most moons?


These should be stored as variants of the same question.

Example structure:


question_variants

question_id

variant_text


Variants reduce repetition during gameplay.

---

# Expected Database Size

After cleaning and deduplication:


raw dataset: ~500k questions
final database: ~300k–400k questions


This provides sufficient depth to avoid repetition across many games.

---

# Future Improvements

Possible enhancements include:


AI-generated question variants
automatic difficulty calibration
topic clustering
question recommendation for hosts


These features are not required for the initial version but should be supported by the data model.