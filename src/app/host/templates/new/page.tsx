'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

const DEFAULT_ROUNDS = [
  { round_number: 1, round_name: 'Round 1', question_count: 8 },
  { round_number: 2, round_name: 'Round 2', question_count: 8 },
  { round_number: 3, round_name: 'Round 3', question_count: 8 },
  { round_number: 4, round_name: 'Round 4', question_count: 8 },
];

interface RoundRow {
  round_number: number;
  round_name: string;
  question_count: number;
  timer_seconds: number | '';
  wager_enabled: boolean;
  double_points: boolean;
  confidence_enabled: boolean;
  points_per_question: number;
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [roundCount, setRoundCount] = useState(4);
  const [defaultTimer, setDefaultTimer] = useState<number | ''>('');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [confidenceScoring, setConfidenceScoring] = useState(false);
  const [wagerRound, setWagerRound] = useState(false);
  const [doubleRound, setDoubleRound] = useState(false);
  const [revealMode, setRevealMode] = useState<'per_question' | 'end_of_round' | 'end_of_game'>('end_of_round');
  const [leaderboardFreq, setLeaderboardFreq] = useState<'never' | 'after_question' | 'after_round' | 'manual'>('after_round');
  const [theme, setTheme] = useState<'dark' | 'light' | 'high_contrast'>('dark');
  const [rounds, setRounds] = useState<RoundRow[]>(
    DEFAULT_ROUNDS.map((r) => ({
      ...r,
      timer_seconds: '',
      wager_enabled: false,
      double_points: false,
      confidence_enabled: false,
      points_per_question: 1,
    }))
  );

  function updateRoundCount(n: number) {
    const clamped = Math.min(Math.max(1, n), 10);
    setRoundCount(clamped);
    setRounds((prev) => {
      const updated = [...prev];
      while (updated.length < clamped) {
        updated.push({
          round_number: updated.length + 1,
          round_name: `Round ${updated.length + 1}`,
          question_count: 8,
          timer_seconds: '',
          wager_enabled: false,
          double_points: false,
          confidence_enabled: false,
          points_per_question: 1,
        });
      }
      return updated.slice(0, clamped);
    });
  }

  function updateRound(index: number, field: keyof RoundRow, value: unknown) {
    setRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    setLoading(true);

    const body = {
      name: name.trim(),
      round_count: roundCount,
      default_timer_seconds: defaultTimer || null,
      auto_advance: autoAdvance,
      allow_confidence_scoring: confidenceScoring,
      allow_wager_round: wagerRound,
      allow_double_round: doubleRound,
      answer_reveal_mode: revealMode,
      leaderboard_frequency: leaderboardFreq,
      display_theme: theme,
      round_templates: rounds.map((r) => ({
        ...r,
        timer_seconds: r.timer_seconds || null,
      })),
    };

    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { id?: string; error?: string };

    if (!res.ok) {
      toast.error(data.error ?? 'Failed to create template');
      setLoading(false);
      return;
    }

    toast.success('Template created!');
    router.push(`/host/templates/${data.id}`);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link href="/host/dashboard" className="text-[var(--secondary-foreground)] hover:text-white text-sm">
          ← Dashboard
        </Link>
        <span className="text-xl font-bold gradient-text">New Template</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic info */}
          <section className="card space-y-5">
            <h2 className="text-lg font-semibold">Template Details</h2>

            <div>
              <label className="label">Template Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Thursday Night Quiz"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Number of Rounds</label>
                <input
                  type="number"
                  className="input-field"
                  min={1}
                  max={10}
                  value={roundCount}
                  onChange={(e) => updateRoundCount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Default Timer (seconds, blank = no timer)</label>
                <input
                  type="number"
                  className="input-field"
                  min={5}
                  max={300}
                  placeholder="30"
                  value={defaultTimer}
                  onChange={(e) =>
                    setDefaultTimer(e.target.value ? Number(e.target.value) : '')
                  }
                />
              </div>
            </div>
          </section>

          {/* Game mechanics */}
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Game Mechanics</h2>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                />
                <span className="text-sm">Auto-advance questions</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={confidenceScoring}
                  onChange={(e) => setConfidenceScoring(e.target.checked)}
                />
                <span className="text-sm">Confidence scoring</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={wagerRound}
                  onChange={(e) => setWagerRound(e.target.checked)}
                />
                <span className="text-sm">Wager round</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={doubleRound}
                  onChange={(e) => setDoubleRound(e.target.checked)}
                />
                <span className="text-sm">Double points round</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              <div>
                <label className="label">Answer Reveal</label>
                <select
                  className="input-field"
                  value={revealMode}
                  onChange={(e) =>
                    setRevealMode(e.target.value as typeof revealMode)
                  }
                >
                  <option value="per_question">After each question</option>
                  <option value="end_of_round">End of round</option>
                  <option value="end_of_game">End of game</option>
                </select>
              </div>

              <div>
                <label className="label">Leaderboard</label>
                <select
                  className="input-field"
                  value={leaderboardFreq}
                  onChange={(e) =>
                    setLeaderboardFreq(e.target.value as typeof leaderboardFreq)
                  }
                >
                  <option value="after_round">After each round</option>
                  <option value="after_question">After each question</option>
                  <option value="manual">Manual only</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <div>
                <label className="label">Display Theme</label>
                <select
                  className="input-field"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="high_contrast">High Contrast</option>
                </select>
              </div>
            </div>
          </section>

          {/* Rounds */}
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Rounds</h2>
            {rounds.map((round, i) => (
              <div
                key={round.round_number}
                className="border border-[var(--border)] rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[var(--muted-foreground)] text-sm w-16 shrink-0">
                    Round {round.round_number}
                  </span>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Round name"
                    value={round.round_name}
                    onChange={(e) => updateRound(i, 'round_name', e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    className="input-field w-24 shrink-0"
                    min={1}
                    max={30}
                    title="Questions"
                    placeholder="Qs"
                    value={round.question_count}
                    onChange={(e) =>
                      updateRound(i, 'question_count', Number(e.target.value))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-4 ml-20 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded"
                      checked={round.wager_enabled}
                      onChange={(e) =>
                        updateRound(i, 'wager_enabled', e.target.checked)
                      }
                    />
                    Wager
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded"
                      checked={round.double_points}
                      onChange={(e) =>
                        updateRound(i, 'double_points', e.target.checked)
                      }
                    />
                    Double points
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded"
                      checked={round.confidence_enabled}
                      onChange={(e) =>
                        updateRound(i, 'confidence_enabled', e.target.checked)
                      }
                    />
                    Confidence
                  </label>
                  {!round.confidence_enabled && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-400">Points:</label>
                      <input
                        type="number"
                        className="input-field w-20 px-2 py-1 text-sm"
                        min="1"
                        max="100"
                        value={round.points_per_question}
                        onChange={(e) =>
                          updateRound(i, 'points_per_question', parseInt(e.target.value) || 1)
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>

          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="btn-primary px-8 py-3">
              {loading ? 'Saving…' : 'Save Template'}
            </button>
            <Link href="/host/dashboard" className="btn-secondary px-8 py-3">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
