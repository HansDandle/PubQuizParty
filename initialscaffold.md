# AI Trivia Host Platform

## Project Overview

Build a multi-tenant trivia hosting platform where trivia hosts can quickly create and run trivia games using a large pre-verified question database. The system should allow hosts to generate rounds using natural language and run live games where players join using QR codes or room codes.

The system must prioritize:

- Speed of game creation
- High host customization
- Stable real-time gameplay
- Easy weekly reuse via templates
- AI-assisted round creation

The platform should be designed so a host can create and start a game in **under 60 seconds**.

---

# Core Concept

Hosts create **Game Templates** that define their preferred game style.

Each week they can:

1. Load a template
2. Enter round themes in natural language
3. Automatically generate questions
4. Start a live game session

Players join via QR code or room link.

---

# Tech Stack

## Backend

Supabase

Reasons:
- Postgres database
- authentication
- row level security
- realtime updates
- pgvector support
- generous free tier

## Database

PostgreSQL with pgvector extension

Used for:
- question storage
- embeddings search
- game state

## Frontend

Next.js with React

Requirements:
- mobile responsive
- very fast UI
- minimal page reloads
- host control panel
- player join interface

Deploy on Vercel.

---

# AI System

AI is used for:

1. Natural language round generation
2. Question search using embeddings
3. Difficulty balancing
4. Duplicate detection
5. Question cleanup

Preferred models:

Embeddings
- BGE-small
- all-MiniLM-L6-v2

LLM
- Llama 3 8B
- Phi-3 Mini

LLMs should not generate trivia questions by default. They should **select questions from the database**.

---

# Database Schema

## users


id
email
created_at


---

## hosts


id
user_id
display_name
created_at


---

## questions


id
question_text
answer
category
difficulty
tags
verified
source
created_at


---

## question_embeddings


question_id
embedding vector


---

## game_templates

Defines host play style.


id
host_id
name
round_count
default_timer_seconds
auto_advance
allow_confidence_scoring
allow_wager_round
allow_double_round
answer_reveal_mode
created_at


answer_reveal_mode values:


per_question
end_of_round
end_of_game


---

## round_templates


id
game_template_id
round_number
round_name
question_count
timer_seconds
wager_enabled
double_points
confidence_enabled


---

## games

Saved game instances generated from templates.


id
host_id
template_id
title
created_at


---

## rounds


id
game_id
round_number
round_name


---

## round_questions


id
round_id
question_id
order_index


---

## game_sessions

Active running game.


id
game_id
room_code
status
current_round
current_question
created_at


status values:


waiting
active
finished


---

## teams


id
game_session_id
team_name
score
created_at


---

## answers


id
team_id
question_id
answer_text
confidence_rank
wager_amount
correct
points_awarded
submitted_at


---

# Core Features

## Host Dashboard

Hosts must be able to:

- create templates
- load templates
- generate rounds with AI
- manually edit rounds
- start game sessions

---

# Game Customization Options

Hosts should be able to configure:

### Timing


timer per question
timer per round
no timer


---

### Answer Reveal

Hosts run games differently.

Supported modes:


Reveal after each question
Reveal at end of round
Reveal at end of game


---

### Question Count

Hosts should control:


questions per round
rounds per game


---

### Confidence Scoring

Optional mechanic.

Players rank confidence:


1
2
3


Scoring example:

Correct answer


points * confidence


Wrong answer


points * -confidence


---

### Wager Questions

Players wager points before answering.

Used for:


final question
special round


---

### Double Points

Hosts may enable:


one double round
one double question
manual double toggle


---

# Player Join System

Players join with:

Room code or QR code.

Example:


trivia.app/join/H7K2


Player enters:


team name
optional avatar emoji


---

# Live Game Flow

### Pre Game

Host screen shows:


room code
QR code
team list


---

### During Game

Host controls:


start question
start timer
end timer
reveal answer
award points
next question


---

### Player View

Players see:


question
timer
answer field
submit button
confidence selection (optional)


---

# AI Round Generation

Hosts should be able to type:


Round 1: Cars
Round 2: Names that are colors
Round 3: Science


System should:

1. parse round topics
2. convert topics to embeddings
3. search question database
4. return best matching questions

Example SQL


SELECT *
FROM questions
ORDER BY embedding <-> query_embedding
LIMIT 12


Then select best 8.

Avoid duplicate topics.

---

# AI Round Builder UX

Host enters:


Cars


System returns:


8 suggested questions


Host can:


accept
swap question
regenerate


---

# Duplicate Detection

Prevent hosts from repeating questions used recently.

Track:


question history per host


Block questions used within configurable window.

Example:


6 months


---

# Templates

Templates allow hosts to reuse structure weekly.

Example Template


4 rounds
8 questions per round
timer 30 seconds
confidence scoring enabled
answers revealed end of round


Hosts should be able to clone templates.

---

# Performance Requirements

Player answers must appear within:


< 200ms


Realtime communication should use:


Supabase realtime or websockets


---

# Host UX Goals

Hosts should be able to:

Create a full game in under **60 seconds**.

Workflow:


Load template
Enter round topics
Generate questions
Start game


---

# Future Features

Not required for MVP.

### League tracking


season standings
team rankings


---

### Host analytics


most missed questions
average scores
difficulty distribution


---

### Slide generation

Auto-generate slides for:


question
answer
leaderboard


Export options:


PowerPoint
Google Slides


---

# MVP Milestones

## Phase 1

Authentication

Host dashboard

Question database

Manual round creation

---

## Phase 2

Player join system

QR code

Live answer submission

---

## Phase 3

AI round generation

Embedding search

---

## Phase 4

Templates

Advanced scoring modes

Game customization

---

# Design Principles

The platform must prioritize:


speed
simplicity
customization
reliability


Hosts should never feel forced into a rigid trivia format.

Every host should be able to run their preferred style of game.

# Persistent Teams, Analytics, and League Features

## Overview

The platform should optionally support **persistent teams**. This allows teams to keep their name, historical scores, and statistics over time.

This enables:

- seasonal competitions
- team rankings
- analytics on team strengths
- insights for hosts about difficulty and engagement

These features should remain optional so casual teams can still join quickly without creating accounts.

---

# Persistent Teams

Teams should have the option to create a **protected team profile** using a password.

Flow:

1. Team enters team name
2. If name exists, system prompts for password
3. If password correct, team loads previous profile
4. If new team, system offers option to create password

This allows teams to maintain long-term stats.

---

## teams table (updated)


id
team_name
password_hash
created_at
home_host_id (optional)


---

## team_game_results

Tracks team performance per game.


id
team_id
game_session_id
score
rank
created_at


---

# Analytics System

Analytics should run automatically based on game data.

No manual tagging required by hosts.

---

# Core Team Analytics

Each team profile should track:


games_played
average_score
highest_score
wins
top_3_finishes
average_rank


---

## Category Performance

Track team strengths and weaknesses by category.

Example output:


Team: Quiztopher Columbus

Best Categories

Movies

Geography

Music

Worst Categories

Science

Literature


---

## Category stats table


team_category_stats

team_id

category

questions_seen

correct_answers

accuracy_rate


---

# Host Analytics

Hosts should be able to see analytics for their venue.

These insights help hosts improve their trivia quality.

---

## Venue Metrics

Track:


average team score
average game duration
average questions correct
team retention rate


---

## Round Difficulty Analytics

Example output:


Round Type: Science
Average Accuracy: 32%

Round Type: Movies
Average Accuracy: 71%


This helps hosts tune difficulty.

---

# Question Analytics

Each question should track performance.


questions

times_used

correct_rate

average_time_to_answer


This enables:


flagging bad questions
balancing difficulty


---

# Engagement Analytics

Track:


teams per game
repeat teams
average team size
average answer submission rate


This can help identify if questions are too difficult.

---

# Seasonal Competitions

Hosts should be able to create **seasons**.

Example:


Spring Trivia League
Jan 15 – Apr 15


Teams accumulate points over time.

---

## seasons table


id
host_id
name
start_date
end_date


---

## season_scores


season_id
team_id
points
games_played
wins


---

# Season Leaderboard

Display:


Rank
Team Name
Points
Games Played
Wins
Average Score


---

# Season Scoring Options

Hosts should be able to configure scoring method.

Examples:

Option 1


1st place = 10 points
2nd place = 7 points
3rd place = 5 points


Option 2


Points equal game score


Option 3


Top N games count toward season total


---

# Team Dashboard

Teams should be able to view their stats.

Example page:


Team Name: Trivia Newton John

Games Played: 27
Wins: 4
Average Rank: 3.2

Best Categories
Music
Movies
Sports

Worst Categories
Science
History


---

# Host Insights

Provide a simple insights dashboard.

Example:


Hardest Round Category: Science
Easiest Round Category: Movies

Average Score Last 4 Weeks: 41
Average Teams Per Game: 11

Most Consistent Team: The Know-It-Alls


---

# Data Storage Strategy

Analytics should be calculated using:


answers
round_questions
team_game_results


Heavy analytics queries should be run as:


nightly background jobs


Results stored in summary tables.

---

# Optional Future Analytics

These features can be added later.

---

## Player Skill Rating

Implement Elo-style ratings for teams.

Benefits:


fair league rankings
skill-based insights


---

## Question Difficulty Calibration

Difficulty score automatically updated based on:


correct_rate
time_to_answer
confidence_scores


---

## Predictive Insights

AI could eventually suggest:


This round may be too difficult


or


Teams at this venue struggle with science


---

# Design Principles

Analytics should always be:


automatic
useful
simple


Hosts should get insights without doing extra work.

One more idea that could seriously differentiate this platform from every other trivia system:

A “Venue Intelligence” dashboard

After ~10 games the system could tell the host things like:

“Your crowd performs 30% better on music than average venues.”

“Questions about geography are consistently too difficult for this venue.”

“Average optimal round difficulty for this venue is 55–65% correct rate.”

That would make the system feel smart instead of just automated, which is exactly where the AI angle becomes valuable.

# Display Screen (Presentation Mode)

## Overview

The platform must support a **display screen mode** intended for TVs, projectors, or large monitors in trivia venues.

The host typically connects their laptop to the venue display or casts a browser tab.

The host should open:

- one tab for **Host Control Panel**
- one tab for **Display Screen**

The display screen shows the game to the audience while the host controls the game privately.

---

# Display Architecture

Host browser example:

Tab 1


/host/game/{session_id}


Host control interface.

Tab 2


/display/{session_id}


Public display screen.

Both tabs subscribe to the same **game session state**.

State updates propagate through realtime events.

---

# Display Screen Goals

The display should be:


clear
minimal
high contrast
easy to read from distance


Large typography is required.

The display must work well on:


projectors
large TVs
bar screens


---

# Display States

The display changes based on the current game state.

---

## Waiting for Teams

Display shows:


Game title
Room code
QR code
Teams joined


Example:


Welcome to Trivia Night!

Join at:
trivia.app/join

Room Code: H7K2

[ QR CODE ]

Teams Joined:
Quiztopher Columbus
Trivia Newton John
The Smartinis


---

## Round Intro

Before each round the display shows:


Round number
Round name
Number of questions


Example:


Round 2

Science and Nature

8 Questions


---

## Question Screen

Display shows:


Question text
Optional timer
Question number


Example:


Question 3 of 8

Which planet has the most moons?

Time Remaining: 30s


Optional elements:


progress bar timer
round name


---

## Answer Reveal

Display shows:


Correct answer
Optional explanation


Example:


Answer:

Saturn

It currently has the highest confirmed moon count in the solar system.


---

## Leaderboard

After scoring the display can show standings.

Example:


Leaderboard

1 Trivia Newton John 42
2 Quiztopher Columbus 39
3 The Smartinis 33


Hosts should be able to choose when leaderboard appears.

Options:


after every question
after every round
manual only


---

# Display Configuration Options

Hosts must be able to configure:

---

## Reveal Timing


Show answers immediately
Show answers end of round
Show answers end of game


---

## Leaderboard Frequency


never
after question
after round
manual


---

## Timer Visibility


visible to players
hidden


---

## Display Theme

Hosts should be able to choose:


dark mode
light mode
high contrast mode


Future support for:


custom branding
venue logo


---

# Display Layout Requirements

Typography should scale automatically.

Minimum recommended sizes:


question text: very large
answers: large
leaderboard: medium


Display should work at:


1080p
4k
projector resolutions


---

# Display Synchronization

Display screen should subscribe to realtime updates from the game session.

Example events:


round_start
question_start
timer_update
answer_reveal
leaderboard_update


Display updates immediately when the host triggers an action.

---

# Host Workflow Example

Typical host setup:

1. Open host dashboard


/host/game/123


2. Open display screen


/display/123


3. Move display tab to projector or second monitor

4. Run game from host tab

---

# Optional Future Feature

## Remote Display Link

Hosts could send a display link to a dedicated screen device.

Example:


/display/venue123


Useful for venues with permanent trivia screens.

---

# Optional Future Feature

## Animated Transitions

Display can include smooth transitions for:


question reveal
answer reveal
leaderboard


This improves presentation quality.

---

# Design Principle

The display should behave like **presentation software**.

The host controls the flow.

The audience sees a clean and readable presentation.

The host interface and display interface must remain **fully separated** so the host can manage the game without exposing controls to the audience.