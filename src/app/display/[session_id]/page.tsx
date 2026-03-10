'use client';

import { useState, useEffect, use } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import type { GameEvent } from '@/lib/supabase/types';
import { formatTimer } from '@/lib/utils';

interface Props {
  params: Promise<{ session_id: string }>;
}

type DisplayView =
  | { type: 'lobby'; roomCode: string; teamCount: number }
  | { type: 'round_start'; roundNumber: number; roundName: string; questionCount: number }
  | { type: 'question'; questionText: string; questionNumber: number; totalQuestions: number; timerSeconds: number | null }
  | { type: 'locked'; questionText: string }
  | { type: 'reveal'; questionText: string; correctAnswer: string }
  | { type: 'leaderboard'; standings: { rank: number; team_name: string; score: number; avatar_emoji: string }[] }
  | { type: 'finished' };

export default function DisplayPage({ params }: Props) {
  const { session_id } = use(params);
  const supabase = createClient();

  const [view, setView] = useState<DisplayView | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [timer, setTimer] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(8);

  // Load initial session state
  useEffect(() => {
    fetch(`/api/sessions/${session_id}`)
      .then((r) => r.json())
      .then((data: { session?: { room_code: string; status: string } }) => {
        if (data.session) {
          setRoomCode(data.session.room_code);
          setView({ type: 'lobby', roomCode: data.session.room_code, teamCount: 0 });
        }
      })
      .catch(() => {/* non-fatal */});

    // Subscribe to game events
    const channel = supabase.channel(`game:session:${session_id}`);
    channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
      handleGameEvent({ type: event, payload } as GameEvent);
    }).subscribe();

    // Subscribe to team count changes
    const teamsChannel = supabase
      .channel(`display:teams:${session_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_teams', filter: `game_session_id=eq.${session_id}` },
        async () => {
          const { count } = await supabase
            .from('session_teams')
            .select('*', { count: 'exact', head: true })
            .eq('game_session_id', session_id);
          if (count !== null) {
            setView((prev) => prev?.type === 'lobby' ? { ...prev, teamCount: count } : prev);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(teamsChannel);
    };
  }, [session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleGameEvent(event: GameEvent) {
    switch (event.type) {
      case 'round_start':
        setTimer(null);
        setTotalQuestions(event.payload.question_count);
        setView({
          type: 'round_start',
          roundNumber: event.payload.round_number,
          roundName: event.payload.round_name,
          questionCount: event.payload.question_count,
        });
        break;
      case 'question_start':
        setTimer(event.payload.timer_seconds);
        setView({
          type: 'question',
          questionText: event.payload.question_text,
          questionNumber: event.payload.question_number,
          totalQuestions,
          timerSeconds: event.payload.timer_seconds,
        });
        break;
      case 'timer_update':
        setTimer(event.payload.seconds_remaining);
        break;
      case 'answer_lock':
        setView((prev) =>
          prev?.type === 'question'
            ? { type: 'locked', questionText: prev.questionText }
            : prev
        );
        break;
      case 'answer_reveal':
        setView((prev) =>
          prev?.type === 'locked' || prev?.type === 'question'
            ? { type: 'reveal', questionText: (prev as { questionText: string }).questionText ?? '', correctAnswer: event.payload.correct_answer }
            : prev
        );
        break;
      case 'leaderboard_show':
        setView({ type: 'leaderboard', standings: event.payload.standings });
        break;
      case 'game_finish':
        setView({ type: 'finished' });
        break;
    }
  }

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${roomCode}`
    : `/join/${roomCode}`;

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--secondary-foreground)]">Loading display…</p>
      </div>
    );
  }

  return (
    <div className="display-mode bg-[var(--background)] overflow-hidden">
      {/* Lobby */}
      {view.type === 'lobby' && (
        <div className="text-center space-y-8 animate-fade-in">
          <p className="text-xl text-[var(--secondary-foreground)]">Join at</p>
          <p className="text-2xl font-mono text-violet-300">
            pubquizparty.app/join
          </p>
          <div className="flex justify-center">
            <QRCodeSVG
              value={joinUrl}
              size={200}
              bgColor="transparent"
              fgColor="#a78bfa"
            />
          </div>
          <p className="text-9xl font-bold font-mono tracking-widest gradient-text">
            {view.roomCode}
          </p>
          <p className="text-2xl text-[var(--secondary-foreground)]">
            {view.teamCount > 0
              ? `${view.teamCount} team${view.teamCount !== 1 ? 's' : ''} joined`
              : 'Waiting for teams…'}
          </p>
        </div>
      )}

      {/* Round start */}
      {view.type === 'round_start' && (
        <div className="text-center space-y-6 animate-slide-up">
          <p className="text-2xl text-violet-400 uppercase tracking-widest">
            Round {view.roundNumber}
          </p>
          <h1 className="text-7xl font-bold">{view.roundName}</h1>
          <p className="text-xl text-[var(--secondary-foreground)]">
            {view.questionCount} questions
          </p>
        </div>
      )}

      {/* Question */}
      {(view.type === 'question' || view.type === 'locked') && (
        <div className="w-full max-w-4xl px-6 text-center space-y-8 animate-slide-up">
          {view.type === 'question' && timer !== null && (
            <div className={`text-7xl font-bold font-mono ${timer <= 5 ? 'timer-critical' : ''}`}>
              {formatTimer(timer)}
            </div>
          )}
          {view.type === 'locked' && (
            <p className="text-2xl text-[var(--muted-foreground)]">🔒 Answers locked</p>
          )}
          <p className="text-4xl sm:text-5xl font-bold leading-tight">
            {view.type === 'question' ? view.questionText : view.questionText}
          </p>
        </div>
      )}

      {/* Reveal */}
      {view.type === 'reveal' && (
        <div className="w-full max-w-4xl px-6 text-center space-y-8 animate-slide-up">
          <p className="text-3xl font-bold text-[var(--muted-foreground)]">
            {view.questionText}
          </p>
          <div className="w-24 h-1 mx-auto bg-violet-500 rounded" />
          <p className="text-6xl font-bold text-green-400">{view.correctAnswer}</p>
        </div>
      )}

      {/* Leaderboard */}
      {view.type === 'leaderboard' && (
        <div className="w-full max-w-2xl px-6 space-y-4 animate-slide-up">
          <h2 className="text-4xl font-bold text-center mb-8">🏆 Standings</h2>
          {view.standings.slice(0, 10).map((entry) => (
            <div
              key={entry.rank}
              className={`flex items-center gap-4 p-4 rounded-xl text-xl ${
                entry.rank === 1
                  ? 'bg-yellow-500/20 border border-yellow-500/40'
                  : entry.rank === 2
                  ? 'bg-slate-400/20 border border-slate-400/40'
                  : entry.rank === 3
                  ? 'bg-amber-700/20 border border-amber-700/40'
                  : 'bg-[var(--secondary)]'
              }`}
            >
              <span className="text-2xl w-10 text-center">
                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
              </span>
              <span className="flex-1 font-semibold">
                {entry.avatar_emoji} {entry.team_name}
              </span>
              <span className="font-bold font-mono text-2xl">{entry.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Finished */}
      {view.type === 'finished' && (
        <div className="text-center space-y-6 animate-slide-up">
          <p className="text-8xl">🎉</p>
          <h1 className="text-6xl font-bold gradient-text">Game Over!</h1>
          <p className="text-2xl text-[var(--secondary-foreground)]">
            Thanks for playing!
          </p>
        </div>
      )}
    </div>
  );
}
