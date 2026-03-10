'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { GameTemplate, RoundTemplate } from '@/lib/supabase/types';

interface TemplateWithRounds extends GameTemplate {
  round_templates: RoundTemplate[];
}

interface Props {
  template: TemplateWithRounds;
}

export default function EditTemplateClient({ template }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(template.name);
  const [defaultTimer, setDefaultTimer] = useState<number | ''>(
    template.default_timer_seconds ?? ''
  );
  const [autoAdvance, setAutoAdvance] = useState(template.auto_advance);
  const [confidenceScoring, setConfidenceScoring] = useState(
    template.allow_confidence_scoring
  );
  const [revealMode, setRevealMode] = useState(template.answer_reveal_mode);
  const [leaderboardFreq, setLeaderboardFreq] = useState(template.leaderboard_frequency);
  const [theme, setTheme] = useState(template.display_theme);

  async function handleSave() {
    setLoading(true);
    const res = await fetch(`/api/templates/${template.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        default_timer_seconds: defaultTimer || null,
        auto_advance: autoAdvance,
        allow_confidence_scoring: confidenceScoring,
        answer_reveal_mode: revealMode,
        leaderboard_frequency: leaderboardFreq,
        display_theme: theme,
      }),
    });
    setLoading(false);
    if (res.ok) toast.success('Template saved');
    else toast.error('Failed to save');
  }

  async function handleClone() {
    setCloning(true);
    const res = await fetch(`/api/templates/${template.id}/clone`, {
      method: 'POST',
    });
    const data = await res.json() as { id?: string; error?: string };
    setCloning(false);
    if (res.ok && data.id) {
      toast.success('Template cloned');
      router.push(`/host/templates/${data.id}`);
    } else {
      toast.error(data.error ?? 'Clone failed');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/templates/${template.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Template deleted');
      router.push('/host/dashboard');
    } else {
      toast.error('Delete failed');
      setDeleting(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <section className="card space-y-5">
        <h2 className="text-lg font-semibold">Template Details</h2>

        <div>
          <label className="label">Template Name</label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default Timer (seconds)</label>
            <input
              type="number"
              className="input-field"
              min={5}
              max={300}
              placeholder="No timer"
              value={defaultTimer}
              onChange={(e) =>
                setDefaultTimer(e.target.value ? Number(e.target.value) : '')
              }
            />
          </div>
          <div>
            <label className="label">Display Theme</label>
            <select
              className="input-field"
              value={theme}
              onChange={(e) =>
                setTheme(e.target.value as typeof theme)
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="high_contrast">High Contrast</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" className="h-4 w-4 rounded" checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)} />
            Auto-advance
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" className="h-4 w-4 rounded" checked={confidenceScoring}
              onChange={(e) => setConfidenceScoring(e.target.checked)} />
            Confidence scoring
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Answer Reveal</label>
            <select className="input-field" value={revealMode}
              onChange={(e) => setRevealMode(e.target.value as typeof revealMode)}>
              <option value="per_question">After each question</option>
              <option value="end_of_round">End of round</option>
              <option value="end_of_game">End of game</option>
            </select>
          </div>
          <div>
            <label className="label">Leaderboard</label>
            <select className="input-field" value={leaderboardFreq}
              onChange={(e) => setLeaderboardFreq(e.target.value as typeof leaderboardFreq)}>
              <option value="after_round">After each round</option>
              <option value="after_question">After each question</option>
              <option value="manual">Manual only</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
      </section>

      {/* Rounds list */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">
          Rounds ({template.round_templates.length})
        </h2>
        {template.round_templates
          .sort((a, b) => a.round_number - b.round_number)
          .map((rt) => (
            <div
              key={rt.id}
              className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0"
            >
              <span className="text-[var(--muted-foreground)] text-sm w-16">
                Round {rt.round_number}
              </span>
              <span className="font-medium flex-1">{rt.round_name}</span>
              <span className="text-sm text-[var(--secondary-foreground)]">
                {rt.question_count} questions
              </span>
            </div>
          ))}
      </section>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button onClick={handleSave} disabled={loading} className="btn-primary px-6 py-2.5">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={handleClone} disabled={cloning} className="btn-secondary px-6 py-2.5">
          {cloning ? 'Cloning…' : 'Clone Template'}
        </button>
        <Link
          href={`/host/games/new?template=${template.id}`}
          className="btn-secondary px-6 py-2.5"
        >
          ⚡ Create Game from Template
        </Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="btn-danger px-6 py-2.5 ml-auto"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </main>
  );
}
