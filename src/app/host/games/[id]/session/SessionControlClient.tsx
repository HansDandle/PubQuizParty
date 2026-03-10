'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import { isAnswerClose } from '@/lib/answerMatching';
import type {
  GameSession,
  Game,
  Round,
  RoundQuestion,
  Question,
  SessionTeam,
  Team,
  Answer,
  GameEvent,
} from '@/lib/supabase/types';

type RoundWithQuestions = Round & {
  round_questions: (RoundQuestion & { questions: Question })[];
};
type GameWithRounds = Game & { rounds: RoundWithQuestions[] };

interface Props {
  game: GameWithRounds;
  hostId: string;
  existingSession: GameSession | null;
}

export default function SessionControlClient({ game, hostId, existingSession }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [session, setSession] = useState<GameSession | null>(existingSession);
  const [teams, setTeams] = useState<(SessionTeam & { team: Team })[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [starting, setStarting] = useState(false);
  const [calledQuestions, setCalledQuestions] = useState<string[]>(existingSession?.called_question_ids || []);
  // Fix hydration mismatch by setting joinUrl on client only
  const [joinUrl, setJoinUrl] = useState(`/join/${existingSession?.room_code ?? ''}`);
  // Store broadcast channel for reuse
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Update joinUrl on client side to include full origin
  useEffect(() => {
    if (session?.room_code) {
      setJoinUrl(`${window.location.origin}/join/${session.room_code}`);
    }
  }, [session?.room_code]);

  // Update session and called questions when existingSession prop changes
  // Only update if the session ID actually changed to avoid resetting state on re-renders
  useEffect(() => {
    if (existingSession && (!session || existingSession.id !== session.id)) {
      console.log('[SessionControl] Loading NEW session:', existingSession.id, 'Called questions:', existingSession.called_question_ids?.length || 0);
      setSession(existingSession);
      setCalledQuestions(existingSession.called_question_ids || []);
    } else if (existingSession) {
      console.log('[SessionControl] Same session, SKIP reset. Current called questions:', calledQuestions.length, 'DB called questions:', existingSession.called_question_ids?.length || 0);
    }
  }, [existingSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rounds = [...game.rounds].sort((a, b) => a.round_number - b.round_number);
  const currentRound = session?.current_round_id
    ? rounds.find((r) => r.id === session.current_round_id) ?? null
    : null;

  const currentQuestions = currentRound
    ? [...currentRound.round_questions].sort((a, b) => a.order_index - b.order_index)
    : [];

  // Subscribe to realtime updates
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_teams', filter: `game_session_id=eq.${session.id}` },
        () => loadTeams(session.id)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'answers', filter: `game_session_id=eq.${session.id}` },
        async () => {
          await loadAnswers(session.id);
          // Auto-score new answers
          await autoScoreAnswers(session.id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as GameSession;
          const previous = payload.old as GameSession;
          
          // Check if meaningful fields changed by comparing with previous database state
          const hasRoundChanged = updated.current_round_id !== previous?.current_round_id;
          const hasCalledQuestionsChanged = JSON.stringify(updated.called_question_ids || []) !== JSON.stringify(previous?.called_question_ids || []);
          const hasStatusChanged = updated.status !== previous?.status;
          
          if (hasRoundChanged || hasCalledQuestionsChanged || hasStatusChanged) {
            setSession(updated);
            setCalledQuestions(updated.called_question_ids || []);
          }
        }
      )
      .subscribe();

    // Also subscribe to broadcast events for immediate team join notifications
    const broadcastChannel = supabase
      .channel(`game:session:${session.id}`)
      .on('broadcast', { event: 'team_join' }, ({ payload }) => {
        toast.success(`${payload.avatar_emoji} ${payload.team_name} joined!`);
        // Reload teams immediately
        loadTeams(session.id);
      })
      .subscribe();
    
    // Store channel reference for reuse in broadcastEvent
    broadcastChannelRef.current = broadcastChannel;

    loadTeams(session.id);
    if (session.status === 'active') {
      loadAnswers(session.id);
      autoScoreAnswers(session.id);
    }

    return () => { 
      supabase.removeChannel(channel);
      supabase.removeChannel(broadcastChannel);
      broadcastChannelRef.current = null;
    };
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTeams(sessionId: string) {
    const { data } = await supabase
      .from('session_teams')
      .select('*, team:teams(*)')
      .eq('game_session_id', sessionId)
      .order('score', { ascending: false });
    if (data) {
      setTeams(data as (SessionTeam & { team: Team })[]);
    }
  }

  async function loadAnswers(sessionId: string) {
    const { data } = await supabase
      .from('answers')
      .select('*')
      .eq('game_session_id', sessionId);
    if (data) setAnswers(data);
  }

  async function autoScoreAnswers(sessionId: string) {
    if (!currentRound) return;
    
    // Get all pending answers (correct === null)
    const { data: pendingAnswers } = await supabase
      .from('answers')
      .select('id, question_id, answer_text, confidence_rank, team_id')
      .eq('game_session_id', sessionId)
      .is('correct', null);

    if (!pendingAnswers || pendingAnswers.length === 0) {
      return;
    }

    // Get correct answers for these questions
    const questionIds = [...new Set(pendingAnswers.map((a: any) => a.question_id))];
    const { data: questions } = await supabase
      .from('questions')
      .select('id, answer')
      .in('id', questionIds);

    if (!questions) return;

    const questionMap = new Map(questions.map((q: any) => [q.id, q.answer]));

    // Batch all scoring requests into parallel promises
    const scoringPromises = [];
    for (const ans of pendingAnswers as any[]) {
      const correctAnswer = questionMap.get(ans.question_id);
      if (!correctAnswer) continue;

      const isClose = isAnswerClose(ans.answer_text, correctAnswer);
      
      if (isClose) {
        // Award points based on round settings
        let points: number;
        if (currentRound.confidence_enabled) {
          points = ans.confidence_rank ?? 1;
        } else {
          points = currentRound.points_per_question ?? 1;
        }
        
        scoringPromises.push(
          fetch(`/api/answers/${ans.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correct: true, points_awarded: points }),
          })
        );
      }
    }

    // Execute all scoring requests in parallel
    if (scoringPromises.length > 0) {
      const results = await Promise.all(scoringPromises);
      const scoredCount = results.filter(res => res.ok).length;
      
      // Reload answers to show updated scores
      await loadAnswers(sessionId);
      
      // Reload teams to show updated scores
      if (scoredCount > 0) {
        await loadTeams(sessionId);
      }
    }
  }

  async function createSession() {
    setStarting(true);
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: game.id }),
    });
    const data = await res.json() as { session?: GameSession; error?: string };
    setStarting(false);
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to create session');
      return;
    }
    setSession(data.session!);
    setCalledQuestions(data.session!.called_question_ids || []);
    toast.success(`Session created! Room code: ${data.session!.room_code}`);
    router.refresh();
  }

  async function endSession() {
    if (!session) return;
    if (!confirm('Are you sure you want to end this session? This cannot be undone.')) return;
    
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'finished' }),
    });
    
    if (res.ok) {
      setSession(null);
      setCalledQuestions([]);
      toast.success('Session ended');
      router.refresh();
    } else {
      toast.error('Failed to end session');
    }
  }

  async function createNewSession() {
    if (!confirm('This will abandon the current session and create a new one. Continue?')) return;
    
    // End current session first
    if (session) {
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'finished' }),
      });
    }
    
    // Create new session
    await createSession();
  }

  async function broadcastEvent(event: GameEvent) {
    if (!session || !broadcastChannelRef.current) return;
    await broadcastChannelRef.current.send({
      type: 'broadcast',
      event: event.type,
      payload: event.payload,
    });
  }

  async function startGame() {
    if (!session || rounds.length === 0) return;
    const firstRound = rounds[0];
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'active',
        current_round_id: firstRound.id,
        started_at: new Date().toISOString(),
        called_question_ids: [], // Explicitly clear called questions when starting
      }),
    });
    if (res.ok) {
      const updated = await res.json() as { session: GameSession };
      setSession(updated.session);
      setCalledQuestions(updated.session.called_question_ids || []);
      await broadcastEvent({
        type: 'round_start',
        payload: {
          round_id: firstRound.id,
          round_number: firstRound.round_number,
          round_name: firstRound.round_name,
          question_count: firstRound.round_questions.length,
          confidence_enabled: firstRound.confidence_enabled,
        },
      });
      toast.success('Game started!');
    } else {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      toast.error(`Failed to start game: ${errorData.error || res.statusText}`);
    }
  }

  async function callQuestion(rq: RoundQuestion & { questions: Question }) {
    if (!session) return;
    const questionNumber = currentQuestions.findIndex((q) => q.id === rq.id) + 1;
    
    const res = await fetch(`/api/sessions/${session.id}/call-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        round_question_id: rq.id,
        question_id: rq.questions.id,
        question_text: rq.questions.question_text,
        question_number: questionNumber,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.session) {
        // Update session and called questions from server response
        setSession(data.session);
        setCalledQuestions(data.session.called_question_ids || []);
      } else {
        // Fallback: update local state immediately
        setCalledQuestions([...calledQuestions, rq.id]);
      }
      toast.success(`Question ${questionNumber} called!`);
    } else {
      toast.error('Failed to call question');
    }
  }

  async function uncallQuestion(roundQuestionId: string) {
    if (!session) return;
    if (!confirm('Remove this question from live? Players will no longer see it.')) return;

    const updatedCalled = calledQuestions.filter(id => id !== roundQuestionId);
    
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        called_question_ids: updatedCalled,
      }),
    });

    if (res.ok) {
      const data = await res.json() as { session: GameSession };
      setSession(data.session);
      setCalledQuestions(data.session.called_question_ids || []);
      toast.success('Question removed from live');
    } else {
      toast.error('Failed to remove question');
    }
  }

  async function previousRound() {
    if (!session) return;
    const currentIdx = rounds.findIndex((r) => r.id === session.current_round_id);
    if (currentIdx <= 0) {
      toast.error('Already at first round');
      return;
    }
    
    const prevRound = rounds[currentIdx - 1];
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_round_id: prevRound.id,
        called_question_ids: [], // Reset called questions for previous round
      }),
    });
    
    if (res.ok) {
      const updated = await res.json() as { session: GameSession };
      setSession(updated.session);
      setCalledQuestions([]);
      await broadcastEvent({
        type: 'round_start',
        payload: {
          round_id: prevRound.id,
          round_number: prevRound.round_number,
          round_name: prevRound.round_name,
          question_count: prevRound.round_questions.length,
          confidence_enabled: prevRound.confidence_enabled,
        },
      });
      toast.success(`Back to ${prevRound.round_name}`);
    }
  }

  async function endRoundAndShowAnswers() {
    if (!session || !currentRound) return;
    
    // Check for unscored answers before ending
    const { data: pendingAnswers } = await supabase
      .from('answers')
      .select('id, team_id')
      .eq('game_session_id', session.id)
      .is('correct', null);
    
    if (pendingAnswers && pendingAnswers.length > 0) {
      const proceed = confirm(
        `${pendingAnswers.length} answer(s) haven't been scored yet.\n\n` +
        `Auto-scoring will attempt to match them, but you may want to review manually first.\n\n` +
        `Continue ending the round?`
      );
      if (!proceed) return;
    }
    
    // Run auto-scoring one final time to ensure all answers are scored
    await autoScoreAnswers(session.id);
    
    // Reload answers to get final state
    await loadAnswers(session.id);
    
    // Calculate statistics for each question
    const questionStats = currentQuestions.map((rq) => {
      const questionAnswers = answers.filter((a: Answer) => a.question_id === rq.questions.id);
      const correctCount = questionAnswers.filter(a => a.correct === true).length;
      const totalCount = questionAnswers.length;
      const percentCorrect = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      
      return {
        question_id: rq.questions.id,
        question_text: rq.questions.question_text,
        correct_answer: rq.questions.answer,
        percent_correct: percentCorrect,
        total_answers: totalCount,
      };
    });

    // Broadcast answer reveal to all players
    await broadcastEvent({
      type: 'round_end',
      payload: {
        round_id: currentRound.id,
        round_name: currentRound.round_name,
        question_stats: questionStats,
      },
    });

    toast.success('Answers revealed to players!');
    
    // Wait a moment for all database operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reload teams to get latest scores
    await loadTeams(session.id);
  }

  async function markAnswer(answerId: string, correct: boolean, points: number) {
    const res = await fetch(`/api/answers/${answerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correct, points_awarded: correct ? points : 0 }),
    });
    if (res.ok) {
      await loadAnswers(session!.id);
      await loadTeams(session!.id);
    }
  }

  async function showLeaderboard() {
    // Reload teams first to ensure we have the latest scores
    await loadTeams(session!.id);
    
    const res = await fetch(`/api/sessions/${session!.id}/leaderboard`);
    const data = await res.json() as { standings: { rank: number; team_name: string; score: number; avatar_emoji: string }[] };
    await broadcastEvent({ type: 'leaderboard_show', payload: { standings: data.standings ?? [] } });
  }

  async function nextRound() {
    if (!session) return;
    const currentIdx = rounds.findIndex((r) => r.id === session.current_round_id);
    if (currentIdx < 0 || currentIdx >= rounds.length - 1) {
      await finishGame();
      return;
    }
    const nextRound = rounds[currentIdx + 1];
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_round_id: nextRound.id,
        called_question_ids: [], // Reset called questions for new round
      }),
    });
    if (res.ok) {
      const updated = await res.json() as { session: GameSession };
      setSession(updated.session);
      setCalledQuestions([]);
      await broadcastEvent({
        type: 'round_start',
        payload: {
          round_id: nextRound.id,
          confidence_enabled: nextRound.confidence_enabled,
          round_number: nextRound.round_number,
          round_name: nextRound.round_name,
          question_count: nextRound.round_questions.length,
        },
      });
      toast.success(`Starting ${nextRound.round_name}`);
    }
  }

  async function finishGame() {
    if (!session) return;
    if (!confirm('Finish this game session? Final scores will be saved.')) return;
    
    await fetch(`/api/sessions/${session.id}/finish`, { method: 'POST' });
    setSession((s) => s ? { ...s, status: 'finished' } : s);
    await broadcastEvent({ type: 'game_finish', payload: {} });
    toast.success('Game finished!');
  }

  async function resetToFirstRound() {
    if (!session || rounds.length === 0) return;
    if (!confirm('Reset to first round? This will clear called questions.')) return;
    
    const firstRound = rounds[0];
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_round_id: firstRound.id,
        called_question_ids: [],
      }),
    });
    
    if (res.ok) {
      const updated = await res.json() as { session: GameSession };
      setSession(updated.session);
      setCalledQuestions([]);
      await broadcastEvent({
        type: 'round_start',
        payload: {
          round_id: firstRound.id,
          round_number: firstRound.round_number,
          round_name: firstRound.round_name,
          question_count: firstRound.round_questions.length,
          confidence_enabled: firstRound.confidence_enabled,
        },
      });
      toast.success(`Reset to ${firstRound.round_name}`);
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
          <Link href={`/host/games/${game.id}`} className="text-[var(--secondary-foreground)] hover:text-white text-sm">
            ← Edit Game
          </Link>
          <span className="text-xl font-bold gradient-text">{game.title}</span>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="card text-center max-w-md">
            <h2 className="text-2xl font-bold mb-2">Ready to start?</h2>
            <p className="text-[var(--secondary-foreground)] mb-6">
              Create a live session to generate a room code and start accepting players.
            </p>
            <button
              onClick={createSession}
              disabled={starting}
              className="btn-primary px-8 py-3 text-base w-full"
            >
              {starting ? 'Creating session…' : '▶ Create Live Session'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/host/games/${game.id}`} className="text-[var(--secondary-foreground)] hover:text-white text-sm">
            ← Edit Game
          </Link>
          <span className="text-xl font-bold gradient-text">{game.title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            session.status === 'active' ? 'bg-green-500/20 text-green-400' :
            session.status === 'waiting' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-[var(--secondary)] text-[var(--muted-foreground)]'
          }`}>
            {session.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/display/${session.id}`}
            target="_blank"
            className="btn-secondary text-sm"
          >
            📺 Display Screen
          </Link>
          <button
            onClick={endSession}
            className="btn-secondary text-sm text-red-400 hover:text-red-300"
          >
            End Session
          </button>
          <button
            onClick={createNewSession}
            className="btn-secondary text-sm"
          >
            🔄 New Session
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* Left panel: QR + Teams */}
        <div className="border-r border-[var(--border)] p-6 space-y-6">
          {/* Room code */}
          <div className="card text-center">
            <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-2">Room Code</p>
            <p className="text-5xl font-bold font-mono tracking-widest text-violet-400 mb-4">
              {session.room_code}
            </p>
            {session.status === 'waiting' && (
              <div className="flex justify-center mb-4">
                <QRCodeSVG
                  value={joinUrl}
                  size={140}
                  bgColor="transparent"
                  fgColor="#a78bfa"
                />
              </div>
            )}
            <p className="text-xs text-[var(--muted-foreground)]">{joinUrl}</p>
          </div>

          {/* Teams */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--secondary-foreground)] mb-3">
              Teams ({teams.length})
            </h3>
            <div className="space-y-2">
              {teams.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--secondary)] text-sm"
                >
                  <span>
                    {st.avatar_emoji} {st.team.team_name}
                  </span>
                  <span className="font-mono font-bold text-violet-400">{st.score}</span>
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
                  Waiting for teams to join…
                </p>
              )}
            </div>
          </div>

          {session.status === 'waiting' && (
            <button
              onClick={startGame}
              disabled={teams.length === 0}
              className="btn-primary w-full py-3"
            >
              ▶ Start Game ({teams.length} teams)
            </button>
          )}
        </div>

        {/* Center: Questions */}
        <div className="lg:col-span-2 p-6 space-y-6">
          {session.status === 'waiting' && (
            <div className="card text-center py-16">
              <p className="text-2xl mb-4">⏳</p>
              <p className="text-xl font-semibold">Waiting for teams to join</p>
              <p className="text-[var(--secondary-foreground)] mt-2">
                Share the room code or QR code with players
              </p>
            </div>
          )}

          {session.status === 'active' && currentRound && (
            <>
              {/* Resumed session banner */}
              {rounds.findIndex((r) => r.id === session.current_round_id) > 0 && (
                <div className="card bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400">⚠️</span>
                    <p className="text-sm">
                      <strong>Resumed Session:</strong> This is an existing session on Round {rounds.findIndex((r) => r.id === session.current_round_id) + 1}.
                      Use "Reset to Round 1" below to start fresh, or "New Session" above to create a new session entirely.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Round header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest">
                    {currentRound.round_name}
                  </p>
                  <p className="text-sm text-[var(--secondary-foreground)]">
                    {calledQuestions.length} of {currentQuestions.length} questions called
                  </p>
                </div>
                <div className="flex gap-2">
                  {rounds.findIndex((r) => r.id === session.current_round_id) > 0 && (
                    <>
                      <button onClick={resetToFirstRound} className="btn-secondary text-sm">
                        ↺ Reset to Round 1
                      </button>
                      <button onClick={previousRound} className="btn-secondary text-sm">
                        ← Previous Round
                      </button>
                    </>
                  )}
                  <button onClick={endRoundAndShowAnswers} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition text-sm font-medium">
                    👁 End Round & Display Answers
                  </button>
                  <button onClick={showLeaderboard} className="btn-secondary text-sm">
                    🏆 Leaderboard
                  </button>
                  <button onClick={nextRound} className="btn-secondary text-sm">
                    {rounds.findIndex((r) => r.id === session.current_round_id) < rounds.length - 1
                      ? 'Next Round →'
                      : 'Finish Game'}
                  </button>
                </div>
              </div>

              {/* All questions in round */}
              <div className="space-y-4">
                {currentQuestions.map((rq, idx) => {
                  const isCalled = calledQuestions.includes(rq.id);
                  const questionAnswers = answers.filter((a: Answer) => a.question_id === rq.questions.id);
                  const questionNumber = idx + 1;

                  return (
                    <div
                      key={rq.id}
                      className={`card ${isCalled ? 'border border-violet-500/30' : 'opacity-60'}`}
                    >
                      {/* Question header */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-mono text-[var(--muted-foreground)]">
                              Q{questionNumber}
                            </span>
                            {isCalled && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-medium">
                                LIVE
                              </span>
                            )}
                          </div>
                          <p className="text-lg font-semibold leading-snug">
                            {rq.questions.question_text}
                          </p>
                          <p className="text-xs text-[var(--secondary-foreground)] mt-1">
                            Answer: <span className="font-mono">{rq.questions.answer}</span>
                          </p>
                        </div>
                        {!isCalled ? (
                          <button
                            onClick={() => callQuestion(rq)}
                            className="btn-primary text-sm px-4 py-2"
                          >
                            📢 Call Question
                          </button>
                        ) : (
                          <button
                            onClick={() => uncallQuestion(rq.id)}
                            className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded-lg transition"
                          >
                            ✕ Un-Live
                          </button>
                        )}
                      </div>

                      {/* Answers for this question */}
                      {isCalled && questionAnswers.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
                            Answers ({questionAnswers.length}/{teams.length})
                          </p>
                          {questionAnswers.map((ans) => {
                            const teamEntry = teams.find((t) => t.team_id === ans.team_id);
                            return (
                              <div
                                key={ans.id}
                                className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                                  ans.correct === true
                                    ? 'bg-green-500/10 border border-green-500/30'
                                    : ans.correct === false
                                    ? 'bg-red-500/10 border border-red-500/30'
                                    : 'bg-[var(--secondary)] border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{teamEntry?.avatar_emoji ?? '🎯'}</span>
                                  <span className="font-medium text-xs">
                                    {teamEntry?.team.team_name ?? '…'}
                                  </span>
                                  <span className="text-[var(--muted-foreground)]">→</span>
                                  <span className="font-mono">{ans.answer_text}</span>
                                  {currentRound?.confidence_enabled && ans.confidence_rank && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-600 text-white font-bold ml-1">
                                      {ans.confidence_rank}pts
                                    </span>
                                  )}
                                </div>
                                {ans.correct === null && (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        const points = currentRound?.confidence_enabled ? (ans.confidence_rank ?? 1) : (currentRound?.points_per_question ?? 1);
                                        markAnswer(ans.id, true, points);
                                      }}
                                      className="text-xs bg-green-600 hover:bg-green-500 px-2 py-1 rounded transition"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={() => markAnswer(ans.id, false, 0)}
                                      className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded transition"
                                    >
                                      ✗
                                    </button>
                                  </div>
                                )}
                                {ans.correct === true && (
                                  <span className="text-green-400 text-xs font-bold">✓ Correct ({ans.points_awarded}pts)</span>
                                )}
                                {ans.correct === false && (
                                  <span className="text-red-400 text-xs font-bold">✗ Wrong</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {session.status === 'finished' && (
            <div className="card text-center py-16">
              <p className="text-4xl mb-4">🏆</p>
              <p className="text-2xl font-bold">Game Over!</p>
              <p className="text-[var(--secondary-foreground)] mt-2">
                Final standings have been saved.
              </p>
              <Link href="/host/dashboard" className="btn-primary mt-6 inline-block px-8 py-3">
                Back to Dashboard
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
