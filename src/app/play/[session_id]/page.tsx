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

interface QuestionResult {
  question_id: string;
  question_text: string;
  correct_answer: string;
  percent_correct: number;
  total_answers: number;
}

interface RoundResults {
  round_name: string;
  question_stats: QuestionResult[];
}

export default function PlayPage({ params }: Props) {
  const { session_id } = use(params);
  const supabase = createClient();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🎯');
  const [calledQuestions, setCalledQuestions] = useState<CalledQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, { text: string; answerId?: string }>>(new Map());
  const [confidenceRanks, setConfidenceRanks] = useState<Map<string, number>>(new Map());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [standings, setStandings] = useState<Array<{ rank: number; team_name: string; score: number; avatar_emoji: string }>>([]);
  const [gameFinished, setGameFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null);
  const [myAnswerResults, setMyAnswerResults] = useState<Map<string, boolean>>(new Map());
  const [roundLocked, setRoundLocked] = useState(false);
  const [confidenceEnabled, setConfidenceEnabled] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem('team_id');
    const name = localStorage.getItem('team_name');
    const emoji = localStorage.getItem('avatar_emoji');
    setTeamId(id);
    setTeamName(name ?? '');
    setAvatarEmoji(emoji ?? '🎯');
  }, []);

  // Load existing called questions on mount
  useEffect(() => {
    console.log('[PlayPage] useEffect triggered - loading called questions for session:', session_id);
    async function loadCalledQuestions() {
      try {
        // Fetch session with called_question_ids
        const { data: session } = await supabase
          .from('game_sessions')
          .select('called_question_ids, current_round_id, status')
          .eq('id', session_id)
          .single();

        if (!session) {
          setLoading(false);
          return;
        }

        const sessionData = session as any;

        // Check if game is finished
        if (sessionData.status === 'finished') {
          setGameFinished(true);
          setLoading(false);
          return;
        }

        // Load the current round's settings including confidence_enabled
        if (sessionData.current_round_id) {
          const { data: round } = await supabase
            .from('rounds')
            .select('confidence_enabled')
            .eq('id', sessionData.current_round_id)
            .single();

          if (round) {
            console.log('[PlayPage] Loaded round settings - confidence_enabled:', round.confidence_enabled);
            setConfidenceEnabled(round.confidence_enabled ?? false);
          }
        }

        const calledIds = sessionData.called_question_ids || [];
        if (calledIds.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch the round questions that have been called
        const { data: roundQuestions } = await supabase
          .from('round_questions')
          .select('id, order_index, question_id, questions(id, question_text)')
          .in('id', calledIds)
          .eq('round_id', sessionData.current_round_id);

        if (roundQuestions) {
          const questions: CalledQuestion[] = roundQuestions
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((rq: any, index: number) => ({
              round_question_id: rq.id,
              question_id: rq.questions.id,
              question_text: rq.questions.question_text,
              question_number: index + 1,
            }));

          setCalledQuestions(questions);
          
          // Initialize answers and confidence for existing questions
          const newAnswers = new Map<string, { text: string; answerId?: string }>();
          const newConfidence = new Map<string, number>();
          
          // Load existing submitted answers for this team (if teamId is available)
          const storedTeamId = localStorage.getItem('team_id');
          console.log('[PlayPage] Loading answers - storedTeamId:', storedTeamId, 'questions:', questions.length);
          
          if (storedTeamId) {
            // Fetch answers through API endpoint (bypasses RLS for unauthenticated players)
            const res = await fetch(`/api/sessions/${session_id}/teams/${storedTeamId}/answers`);
            const data = await res.json();
            const existingAnswers = data.answers || [];

            console.log('[PlayPage] Existing answers API result:', existingAnswers.length, 'answers');

            const submittedMap = new Map(existingAnswers.map((a: any) => [a.question_id, a]));
            
            questions.forEach((q) => {
              const existing = submittedMap.get(q.question_id);
              if (existing) {
                newAnswers.set(q.question_id, { text: existing.answer_text, answerId: existing.id });
                newConfidence.set(q.question_id, existing.confidence_rank);
                console.log('[PlayPage] Loaded answer for question:', q.question_id.substring(0, 8), 'text:', existing.answer_text);
              } else {
                newAnswers.set(q.question_id, { text: '' });
              }
            });
          } else {
            console.log('[PlayPage] No storedTeamId - skipping answer load');
            questions.forEach((q) => {
              newAnswers.set(q.question_id, { text: '' });
            });
          }

          setAnswers(newAnswers);
          setConfidenceRanks(newConfidence);

          console.log('[PlayPage] Loaded', questions.length, 'previously called questions, set', newAnswers.size, 'answers in state');
        }
      } catch (error) {
        console.error('[PlayPage] Error loading called questions:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCalledQuestions();
  }, [session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to game events
  useEffect(() => {
    console.log('[PlayPage] Setting up realtime subscription for session:', session_id);
    const channel = supabase.channel(`game:session:${session_id}`);

    channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
      console.log('[PlayPage] Received broadcast event:', event, payload);
      const gameEvent = { type: event, payload } as GameEvent;
      handleGameEvent(gameEvent);
    }).subscribe();

    return () => { 
      console.log('[PlayPage] Cleaning up realtime subscription');
      supabase.removeChannel(channel); 
    };
  }, [session_id, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGameEvent(event: GameEvent) {
    switch (event.type) {
      case 'round_start':
        // New round - clear all questions and answers
        console.log('[PlayPage] ROUND_START event - clearing all answers and questions');
        setCalledQuestions([]);
        setAnswers(new Map());
        setConfidenceRanks(new Map());
        setShowLeaderboard(false);
        setRoundResults(null);
        setRoundLocked(false);
        setConfidenceEnabled(event.payload.confidence_enabled ?? false);
        toast.success(`Round ${event.payload.round_number}: ${event.payload.round_name}`);
        break;
      case 'question_call':
        // Add newly called question to the list (avoid duplicates)
        setCalledQuestions((prev) => {
          // Check if already exists
          if (prev.some(q => q.round_question_id === event.payload.round_question_id)) {
            console.log('[PlayPage] Question already in list, skipping:', event.payload.question_id.substring(0,8));
            return prev;
          }
          const newQuestion: CalledQuestion = {
            round_question_id: event.payload.round_question_id,
            question_id: event.payload.question_id,
            question_text: event.payload.question_text,
            question_number: event.payload.question_number,
          };
          console.log('[PlayPage] Adding new question to list:', event.payload.question_id.substring(0,8));
          return [...prev, newQuestion];
        });
        // Initialize answer for this question (if not already set)
        setAnswers((prev) => {
          if (prev.has(event.payload.question_id)) {
            const existing = prev.get(event.payload.question_id);
            console.log('[PlayPage] Question already has answer, keeping it:', existing?.text);
            return prev;
          }
          console.log('[PlayPage] Initializing empty answer for new question');
          return new Map(prev).set(event.payload.question_id, { text: '' });
        });
        toast.success(`Question ${event.payload.question_number} called!`);
        break;
      case 'round_end':
        // Lock the round - no more edits
        setRoundLocked(true);
        
        // Display round results with answers
        setRoundResults({
          round_name: event.payload.round_name,
          question_stats: event.payload.question_stats,
        });
        
        // Fetch this team's answers to show correctness
        if (teamId) {
          // Use API endpoint to bypass RLS
          const res = await fetch(`/api/sessions/${session_id}/teams/${teamId}/answers`);
          const data = await res.json();
          const teamAnswers = data.answers || [];
          
          if (teamAnswers.length > 0) {
            const resultsMap = new Map(teamAnswers.map((a: any) => [a.question_id, a.correct === true]));
            setMyAnswerResults(resultsMap);
          }
        }
        toast.success('Round complete! View your results');
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
    if (!teamId || roundLocked) return;
    const answer = answers.get(questionId);
    if (!answer || !answer.text.trim()) return;

    const confidence = confidenceRanks.get(questionId);
    
    // Only require confidence rank if confidence is enabled for this round
    if (confidenceEnabled && !confidence) {
      toast.error('Please assign a rank to this question');
      return;
    }

    const isUpdate = !!answer.answerId;
    console.log('[PlayPage] Submitting answer:', {
      questionId: questionId.substring(0, 8),
      teamId: teamId.substring(0, 8),
      answer: answer.text,
      confidence,
      confidenceEnabled,
      isUpdate
    });
    
    const res = await fetch(`/api/sessions/${session_id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: teamId,
        question_id: questionId,
        answer_text: answer.text.trim(),
        confidence_rank: confidence ?? 1, // Default to 1 if confidence not enabled
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[PlayPage] Answer submitted successfully:', data.answer?.id.substring(0,8));
      if (data.answer) {
        // Store the answer ID for tracking
        setAnswers((prev) => {
          const updated = new Map(prev);
          updated.set(questionId, { text: answer.text, answerId: data.answer.id });
          return updated;
        });
      }
      toast.success(isUpdate ? 'Answer updated!' : 'Answer saved!');
    } else {
      console.error('[PlayPage] Failed to submit answer:', res.status, await res.text());
      toast.error('Failed to save answer');
    }
  }

  function updateAnswer(questionId: string, text: string) {
    if (roundLocked) return;
    setAnswers((prev) => {
      const updated = new Map(prev);
      const current = updated.get(questionId) || { text: '' };
      updated.set(questionId, { ...current, text });
      return updated;
    });
  }

  function updateConfidence(questionId: string, rank: number) {
    if (roundLocked) return;
    
    // Check if this rank is already used by another question
    const usedByOther = Array.from(confidenceRanks.entries()).find(
      ([qId, r]) => qId !== questionId && r === rank
    );
    
    if (usedByOther) {
      toast.error(`Rank ${rank} is already assigned to another question`);
      return;
    }
    
    setConfidenceRanks((prev) => new Map(prev).set(questionId, rank));
  }
  
  function getAvailableRanks(currentQuestionId: string): number[] {
    const totalQuestions = calledQuestions.length;
    const allRanks = Array.from({ length: totalQuestions }, (_, i) => totalQuestions - i);
    const currentRank = confidenceRanks.get(currentQuestionId);
    
    return allRanks.filter(rank => {
      // Available if: it's the current question's rank, or not used by any question
      if (rank === currentRank) return true;
      return !Array.from(confidenceRanks.values()).includes(rank);
    });
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

  if (roundResults) {
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
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">📊 Round Complete: {roundResults.round_name}</h2>
              <p className="text-[var(--secondary-foreground)]">Here are the answers and how everyone did</p>
            </div>

            {roundResults.question_stats.map((stat, idx) => {
              const myAnswer = answers.get(stat.question_id);
              const gotCorrect = myAnswerResults.get(stat.question_id) === true;
              const gotWrong = myAnswerResults.get(stat.question_id) === false;

              return (
                <div
                  key={stat.question_id}
                  className={`card ${
                    gotCorrect
                      ? 'border border-green-500/30 bg-green-500/5'
                      : gotWrong
                      ? 'border border-red-500/30 bg-red-500/5'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">
                      {gotCorrect ? '✅' : gotWrong ? '❌' : '⚪'}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs font-mono text-[var(--muted-foreground)] mb-1">
                        Question {idx + 1}
                      </p>
                      <p className="font-semibold text-lg mb-2">{stat.question_text}</p>
                      
                      {myAnswer && myAnswer.submitted && (
                        <div className="mb-2 text-sm">
                          <span className="text-[var(--muted-foreground)]">Your answer: </span>
                          <span className={`font-mono ${
                            gotCorrect ? 'text-green-400' : gotWrong ? 'text-red-400' : ''
                          }`}>
                            {myAnswer.text}
                          </span>
                        </div>
                      )}

                      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="text-sm text-[var(--muted-foreground)]">Correct answer:</p>
                        <p className="font-mono text-lg text-blue-400">{stat.correct_answer}</p>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <div className="flex-1 bg-[var(--secondary)] rounded-full h-6 overflow-hidden">
                          <div
                            className="bg-violet-600 h-full flex items-center justify-center text-xs font-bold transition-all"
                            style={{ width: `${stat.percent_correct}%` }}
                          >
                            {stat.percent_correct > 15 && `${stat.percent_correct}%`}
                          </div>
                        </div>
                        <span className="text-[var(--muted-foreground)] text-xs whitespace-nowrap">
                          {stat.percent_correct}% got it right ({stat.total_answers} teams)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => setRoundResults(null)}
              className="btn-primary w-full py-3 text-lg"
            >
              Continue
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
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4 animate-pulse">⏳</p>
              <p className="text-xl font-semibold">Loading...</p>
            </div>
          </div>
        ) : calledQuestions.length === 0 ? (
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
              {confidenceEnabled && calledQuestions.length > 1 && !roundLocked && (
                <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-xs text-blue-400">
                    💡 <strong>Ranking System:</strong> Assign points {calledQuestions.length} through 1 to questions based on your confidence. 
                    Higher points = higher confidence. Each number can only be used once!
                  </p>
                </div>
              )}
            </div>

            {calledQuestions.map((q) => {
              const answer = answers.get(q.question_id) || { text: '' };
              const confidence = confidenceRanks.get(q.question_id);
              const availableRanks = getAvailableRanks(q.question_id);
              const hasAnswer = answer.text.trim().length > 0;

              return (
                <div
                  key={q.question_id}
                  className={`card ${hasAnswer && confidence ? 'border border-violet-500/30' : ''} ${roundLocked ? 'opacity-60' : ''}`}
                >
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-[var(--muted-foreground)]">
                        Q{q.question_number}
                      </span>
                      {confidenceEnabled && confidence && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-600 text-white font-bold">
                          {confidence} pts
                        </span>
                      )}
                      {answer.answerId && !roundLocked && (
                        <span className="ml-auto text-xs text-green-400">
                          ✓ Saved
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-semibold">{q.question_text}</p>
                  </div>

                  {!roundLocked ? (
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

                      <div className="flex items-center gap-2 flex-wrap">
                        {confidenceEnabled && (
                          <>
                            <span className="text-xs text-[var(--muted-foreground)]">Points:</span>
                            <div className="flex gap-1 flex-wrap">
                              {availableRanks.map((rank) => (
                                <button
                                  key={rank}
                                  type="button"
                                  onClick={() => updateConfidence(q.question_id, rank)}
                                  className={`px-3 py-1 text-xs rounded transition font-medium ${
                                    confidence === rank
                                      ? 'bg-violet-600 text-white'
                                      : 'bg-[var(--secondary)] hover:bg-[var(--secondary)]/80'
                                  }`}
                                >
                                  {rank}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <button
                          type="submit"
                          className="ml-auto btn-primary text-sm px-4 py-1"
                          disabled={!answer.text.trim() || (confidenceEnabled && !confidence)}
                        >
                          {hasAnswer && answer.answerId ? 'Update' : 'Save'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-sm">
                      <span className="text-[var(--muted-foreground)]">Your answer: </span>
                      <span className="font-mono text-white">{answer.text || '(not answered)'}</span>
                      {confidence && (
                        <span className="ml-2 text-violet-400">({confidence} pts)</span>
                      )}
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
