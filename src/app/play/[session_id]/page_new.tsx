'use client';

import { useState, useEffect, use } from 'react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import type { GameEvent } from '@/lib/supabase/types';

interface Props {
  params: Promise<{ session_id: string }>;
}

interface CalledQuestion {
  round_question_id: string;
  question_id: string;
  question_text: string;
  question_number: number;
}

export default function PlayPage({ params }: Props) {
  const { session_id } = use(params);
  const supabase = createClient();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🎯');
  const [calledQuestions, setCalledQuestions] = useState<CalledQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, { text: string; submitted: boolean }>>(new Map());
  const [confidenceRanks, setConfidenceRanks] = useState<Map<string, 1 | 2 | 3>>(new Map());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [standings, setStandings] = useState<Array<{ rank: number; team_name: string; score: number; avatar_emoji: string }>>([]);
  const [gameFinished, setGameFinished] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem('team_id');
    const name = localStorage.getItem('team_name');
    const emoji = localStorage.getItem('avatar_emoji');
    setTeamId(id);
    setTeamName(name ?? '');
    setAvatarEmoji(emoji ?? '🎯');
  }, []);

  // Subscribe to game events
  useEffect(() => {
    const channel = supabase.channel(`game:session:${session_id}`);

    channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
      const gameEvent = { type: event, payload } as GameEvent;
      handleGameEvent(gameEvent);
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGameEvent(event: GameEvent) {
    switch (event.type) {
      case 'round_start':
        // New round - clear all questions and answers
        setCalledQuestions([]);
        setAnswers(new Map());
        setConfidenceRanks(new Map());
        setShowLeaderboard(false);
        toast.success(`Round ${event.payload.round_number}: ${event.payload.round_name}`);
        break;
      case 'question_call':
        // Add newly called question to the list
        const newQuestion: CalledQuestion = {
          round_question_id: event.payload.round_question_id,
          question_id: event.payload.question_id,
          question_text: event.payload.question_text,
          question_number: event.payload.question_number,
        };
        setCalledQuestions((prev) => [...prev, newQuestion]);
        // Initialize answer and confidence for this question
        setAnswers((prev) => new Map(prev).set(event.payload.question_id, { text: '', submitted: false }));
        setConfidenceRanks((prev) => new Map(prev).set(event.payload.question_id, 2));
        toast.success(`Question ${event.payload.question_number} called!`);
        break;
      case 'leaderboard_show':
        setStandings(event.payload.standings);
        setShowLeaderboard(true);
        break;
      case 'game_finish':
        setGameFinished(true);
        toast.success('Game finished! Thanks for playing!');
        break;
    }
  }

  async function submitAnswer(questionId: string) {
    if (!teamId) return;
    const answer = answers.get(questionId);
    if (!answer || !answer.text.trim() || answer.submitted) return;

    const confidence = confidenceRanks.get(questionId) ?? 2;

    const res = await fetch(`/api/sessions/${session_id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: teamId,
        question_id: questionId,
        answer_text: answer.text.trim(),
        confidence_rank: confidence,
      }),
    });

    if (res.ok) {
      setAnswers((prev) => {
        const updated = new Map(prev);
        updated.set(questionId, { ...answer, submitted: true });
        return updated;
      });
      toast.success('Answer submitted!');
    } else {
      toast.error('Failed to submit answer');
    }
  }

  function updateAnswer(questionId: string, text: string) {
    setAnswers((prev) => {
      const updated = new Map(prev);
      const current = updated.get(questionId) || { text: '', submitted: false };
      updated.set(questionId, { ...current, text });
      return updated;
    });
  }

  function updateConfidence(questionId: string, rank: 1 | 2 | 3) {
    setConfidenceRanks((prev) => new Map(prev).set(questionId, rank));
  }

  if (gameFinished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="card text-center max-w-md">
          <p className="text-6xl mb-4">🏆</p>
          <h1 className="text-3xl font-bold mb-2">Game Over!</h1>
          <p className="text-[var(--secondary-foreground)]">
            Thanks for playing, {teamName}!
          </p>
        </div>
      </div>
    );
  }

  if (showLeaderboard && standings.length > 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <span className="font-bold gradient-text text-sm">PubQuizParty</span>
          {teamName && (
            <span className="text-sm text-[var(--secondary-foreground)]">
              {avatarEmoji} {teamName}
            </span>
          )}
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-3 animate-slide-up">
            <h2 className="text-xl font-bold text-center mb-4">🏆 Standings</h2>
            {standings.map((entry, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  entry.team_name === teamName
                    ? 'bg-violet-600/20 border border-violet-500/40'
                    : 'bg-[var(--secondary)]'
                }`}
              >
                <span className={`text-lg font-bold w-8 text-center ${
                  entry.rank === 1 ? 'text-yellow-400' :
                  entry.rank === 2 ? 'text-slate-300' :
                  entry.rank === 3 ? 'text-amber-600' : 'text-[var(--muted-foreground)]'
                }`}>
                  #{entry.rank}
                </span>
                <span className="text-xl">{entry.avatar_emoji}</span>
                <span className="flex-1 font-medium">{entry.team_name}</span>
                <span className="text-lg font-bold text-violet-400">{entry.score}</span>
              </div>
            ))}
            <button
              onClick={() => setShowLeaderboard(false)}
              className="btn-secondary w-full mt-4"
            >
              Back to Questions
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <span className="font-bold gradient-text text-sm">PubQuizParty</span>
        {teamName && (
          <span className="text-sm text-[var(--secondary-foreground)]">
            {avatarEmoji} {teamName}
          </span>
        )}
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {calledQuestions.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4 animate-pulse">⏳</p>
              <p className="text-xl font-semibold">Waiting for questions…</p>
              <p className="text-[var(--secondary-foreground)] mt-2">
                Your host will call questions shortly
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="mb-6">
              <p className="text-sm text-[var(--muted-foreground)]">
                {calledQuestions.length} {calledQuestions.length === 1 ? 'question' : 'questions'} active
              </p>
            </div>

            {calledQuestions.map((q) => {
              const answer = answers.get(q.question_id) || { text: '', submitted: false };
              const confidence = confidenceRanks.get(q.question_id) ?? 2;

              return (
                <div
                  key={q.question_id}
                  className={`card ${answer.submitted ? 'opacity-75 border border-green-500/30' : ''}`}
                >
                  <div className="mb-4">
                    <span className="text-xs font-mono text-[var(--muted-foreground)]">
                      Q{q.question_number}
                    </span>
                    {answer.submitted && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        ✓ Submitted
                      </span>
                    )}
                    <p className="text-lg font-semibold mt-2">{q.question_text}</p>
                  </div>

                  {!answer.submitted ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitAnswer(q.question_id);
                      }}
                      className="space-y-3"
                    >
                      <div>
                        <input
                          type="text"
                          className="input-field w-full"
                          placeholder="Your answer…"
                          value={answer.text}
                          onChange={(e) => updateAnswer(q.question_id, e.target.value)}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--muted-foreground)]">Confidence:</span>
                        <div className="flex gap-1">
                          {([1, 2, 3] as const).map((rank) => (
                            <button
                              key={rank}
                              type="button"
                              onClick={() => updateConfidence(q.question_id, rank)}
                              className={`px-3 py-1 text-xs rounded transition ${
                                confidence === rank
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-[var(--secondary)] hover:bg-[var(--secondary)]/80'
                              }`}
                            >
                              {rank}
                            </button>
                          ))}
                        </div>
                        <button
                          type="submit"
                          className="ml-auto btn-primary text-sm px-4 py-1"
                          disabled={!answer.text.trim()}
                        >
                          Submit
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-sm text-green-400">
                      Your answer: <span className="font-mono">{answer.text}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
