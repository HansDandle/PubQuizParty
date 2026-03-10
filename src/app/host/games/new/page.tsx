'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { Question, GameTemplate, RoundTemplate } from '@/lib/supabase/types';
import { truncate } from '@/lib/utils';

interface GeneratedRound {
  topic: string;
  questions: Question[];
}

interface RoundEntry {
  topic: string;
  questions: Question[];
  loading: boolean;
  generated: boolean;
  keptQuestions: Set<string>; // Track question IDs to keep
}

function NewGameForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');

  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<(GameTemplate & { round_templates: RoundTemplate[] }) | null>(null);
  const [templates, setTemplates] = useState<GameTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateId ?? '');
  const [rounds, setRounds] = useState<RoundEntry[]>([
    { topic: '', questions: [], loading: false, generated: false, keptQuestions: new Set() },
    { topic: '', questions: [], loading: false, generated: false, keptQuestions: new Set() },
    { topic: '', questions: [], loading: false, generated: false, keptQuestions: new Set() },
    { topic: '', questions: [], loading: false, generated: false, keptQuestions: new Set() },
  ]);
  const [saving, setSaving] = useState(false);
  const [showCustomQuestionForm, setShowCustomQuestionForm] = useState<number | null>(null);
  const [customQuestion, setCustomQuestion] = useState({ question_text: '', answer: '', category: 'Other' });

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data: { templates?: GameTemplate[] }) => {
        setTemplates(data.templates ?? []);
      })
      .catch(() => {/* non-fatal */});
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplate(null);
      return;
    }
    fetch(`/api/templates/${selectedTemplateId}`)
      .then((r) => r.json())
      .then((data: { template?: GameTemplate & { round_templates: RoundTemplate[] } }) => {
        if (data.template) {
          setTemplate(data.template);
          setRounds(
            data.template.round_templates
              .sort((a, b) => a.round_number - b.round_number)
              .map((rt) => ({
                topic: rt.round_name,
                questions: [],
                loading: false,
                generated: false,
                keptQuestions: new Set(),
              }))
          );
        }
      })
      .catch(() => {/* non-fatal */});
  }, [selectedTemplateId]);

  async function generateRound(index: number) {
    const topic = rounds[index].topic.trim();
    if (!topic) {
      toast.error('Enter a topic first');
      return;
    }
    
    const currentRound = rounds[index];
    const keptQuestions = currentRound.questions.filter(q => currentRound.keptQuestions.has(q.id));
    const targetCount = template?.round_templates[index]?.question_count ?? 8;
    const neededCount = Math.max(0, targetCount - keptQuestions.length);
    
    if (neededCount === 0) {
      toast.success('All questions already kept!');
      return;
    }
    
    setRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, loading: true } : r))
    );

    const res = await fetch('/api/rounds/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topics: [topic],
        question_count: neededCount,
        exclude_question_ids: [
          ...rounds.flatMap((r) => r.questions.map((q) => q.id)),
        ],
      }),
    });

    const data = await res.json() as { rounds?: GeneratedRound[]; error?: string };

    if (!res.ok || !data.rounds?.[0]) {
      toast.error(data.error ?? 'Generation failed');
      setRounds((prev) =>
        prev.map((r, i) => (i === index ? { ...r, loading: false } : r))
      );
      return;
    }

    // Merge kept questions with new questions
    const newQuestions = [...keptQuestions, ...data.rounds![0].questions];
    
    setRounds((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, loading: false, generated: true, questions: newQuestions }
          : r
      )
    );
  }

  async function generateAll() {
    const promises = rounds.map((_, i) => generateRound(i));
    await Promise.allSettled(promises);
  }

  function toggleKeepQuestion(roundIndex: number, questionId: string) {
    setRounds((prev) =>
      prev.map((r, i) => {
        if (i !== roundIndex) return r;
        const newKept = new Set(r.keptQuestions);
        if (newKept.has(questionId)) {
          newKept.delete(questionId);
        } else {
          newKept.add(questionId);
        }
        return { ...r, keptQuestions: newKept };
      })
    );
  }

  async function createCustomQuestion(roundIndex: number) {
    if (!customQuestion.question_text.trim() || !customQuestion.answer.trim()) {
      toast.error('Question and answer are required');
      return;
    }

    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customQuestion),
    });

    const data = await res.json() as { question?: Question; error?: string };

    if (!res.ok || !data.question) {
      toast.error(data.error ?? 'Failed to create question');
      return;
    }

    toast.success('Custom question created!');
    
    // Add to current round
    setRounds((prev) =>
      prev.map((r, i) =>
        i === roundIndex
          ? { ...r, questions: [...r.questions, data.question!], generated: true }
          : r
      )
    );

    // Reset form
    setCustomQuestion({ question_text: '', answer: '', category: 'Other' });
    setShowCustomQuestionForm(null);
  }

  function swapQuestion(roundIndex: number, questionIndex: number, newQuestion: Question) {
    setRounds((prev) =>
      prev.map((r, ri) =>
        ri === roundIndex
          ? {
              ...r,
              questions: r.questions.map((q, qi) =>
                qi === questionIndex ? newQuestion : q
              ),
            }
          : r
      )
    );
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Give your game a title');
      return;
    }
    const allGenerated = rounds.every((r) => r.generated && r.questions.length > 0);
    if (!allGenerated) {
      toast.error('Generate questions for all rounds first');
      return;
    }
    setSaving(true);

    const body = {
      title: title.trim(),
      template_id: selectedTemplateId || null,
      rounds: rounds.map((r, i) => ({
        round_number: i + 1,
        round_name: r.topic || `Round ${i + 1}`,
        timer_seconds: template?.round_templates[i]?.timer_seconds ?? template?.default_timer_seconds ?? null,
        wager_enabled: template?.round_templates[i]?.wager_enabled ?? false,
        double_points: template?.round_templates[i]?.double_points ?? false,
        confidence_enabled: template?.round_templates[i]?.confidence_enabled ?? false,
        points_per_question: template?.round_templates[i]?.points_per_question ?? 1,
        question_ids: r.questions.map((q) => q.id),
      })),
    };

    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { id?: string; error?: string };
    setSaving(false);

    if (!res.ok) {
      toast.error(data.error ?? 'Failed to save game');
      return;
    }

    toast.success('Game created!');
    router.push(`/host/games/${data.id}`);
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Title + template picker */}
      <section className="card space-y-5">
        <h2 className="text-lg font-semibold">Game Setup</h2>

        <div>
          <label className="label">Game Title</label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. Thursday Trivia #42"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div>
          <label className="label">Template (optional)</label>
          <select
            className="input-field"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            <option value="">— No template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Round topics */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Round Topics</h2>
          <button
            onClick={generateAll}
            className="btn-secondary text-sm"
            disabled={rounds.some((r) => r.loading)}
          >
            ⚡ Generate All Rounds
          </button>
        </div>

        <p className="text-sm text-[var(--secondary-foreground)]">
          Type a topic for each round. The AI will select the best matching questions.
        </p>

        <div className="space-y-6">
          {rounds.map((round, i) => (
            <div key={i} className="border border-[var(--border)] rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--muted-foreground)] w-16 shrink-0">
                  Round {i + 1}
                </span>
                <input
                  type="text"
                  className="input-field flex-1"
                  placeholder="e.g. 90s Movies, World Capitals, Soccer…"
                  value={round.topic}
                  onChange={(e) =>
                    setRounds((prev) =>
                      prev.map((r, ri) =>
                        ri === i ? { ...r, topic: e.target.value, generated: false } : r
                      )
                    )
                  }
                />
                <button
                  onClick={() => generateRound(i)}
                  disabled={round.loading || !round.topic.trim()}
                  className="btn-secondary text-sm shrink-0"
                >
                  {round.loading ? '…' : round.generated ? (round.keptQuestions.size > 0 ? `↺ Regen (${round.keptQuestions.size} kept)` : '↺ Regen') : '⚡ Generate'}
                </button>
              </div>

              {round.questions.length > 0 && (
                <>
                  {round.keptQuestions.size > 0 && (
                    <div className="ml-20 text-xs text-violet-400">
                      💡 {round.keptQuestions.size} question{round.keptQuestions.size !== 1 ? 's' : ''} marked to keep. They'll stay when you regenerate.
                    </div>
                  )}
                  <div className="ml-20 space-y-1.5">
                  {round.questions.map((q, qi) => {
                    const isKept = round.keptQuestions.has(q.id);
                    return (
                      <div
                        key={q.id}
                        className={`flex items-start gap-2 text-sm p-2 rounded group ${
                          isKept 
                            ? 'bg-violet-500/20 border border-violet-500/40' 
                            : 'bg-[var(--secondary)]'
                        }`}
                      >
                        <span className="text-[var(--muted-foreground)] w-5 shrink-0">
                          {qi + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--foreground)]">
                            {truncate(q.question_text, 100)}
                          </p>
                          <p className="text-[var(--muted-foreground)] text-sm mt-1">
                            <span className="font-medium text-[var(--foreground)]">Answer:</span> {truncate(q.answer, 80)}
                          </p>
                          <p className="text-[var(--muted-foreground)] text-xs mt-0.5">
                            {q.category} · {q.difficulty ? `Difficulty ${q.difficulty}` : 'Unknown difficulty'}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleKeepQuestion(i, q.id)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            isKept
                              ? 'bg-violet-500 text-white'
                              : 'bg-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                          }`}
                          title={isKept ? "Will be kept when regenerating" : "Click to keep this question"}
                        >
                          {isKept ? '📌 Keep' : 'Keep?'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                </>
              )}

              {round.loading && (
                <div className="ml-20 text-sm text-violet-400 animate-pulse">
                  Finding best questions…
                </div>
              )}

              {/* Add Custom Question Button & Form */}
              {round.generated && showCustomQuestionForm !== i && (
                <div className="ml-20">
                  <button
                    onClick={() => setShowCustomQuestionForm(i)}
                    className="text-sm text-violet-400 hover:text-violet-300"
                  >
                    + Add Custom Question
                  </button>
                </div>
              )}

              {showCustomQuestionForm === i && (
                <div className="ml-20 p-4 border border-[var(--border)] rounded-lg space-y-3 bg-[var(--card)]">
                  <h4 className="text-sm font-semibold">Create Custom Question</h4>
                  <div className="space-y-2">
                    <input
                      type="text"
                      className="input-field w-full text-sm"
                      placeholder="Question text..."
                      value={customQuestion.question_text}
                      onChange={(e) => setCustomQuestion(prev => ({ ...prev, question_text: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="input-field w-full text-sm"
                      placeholder="Answer..."
                      value={customQuestion.answer}
                      onChange={(e) => setCustomQuestion(prev => ({ ...prev, answer: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="input-field w-full text-sm"
                      placeholder="Category (optional)"
                      value={customQuestion.category}
                      onChange={(e) => setCustomQuestion(prev => ({ ...prev, category: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => createCustomQuestion(i)}
                      className="btn-primary text-sm"
                    >
                      Add Question
                    </button>
                    <button
                      onClick={() => {
                        setShowCustomQuestionForm(null);
                        setCustomQuestion({ question_text: '', answer: '', category: 'Other' });
                      }}
                      className="btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-8 py-3 text-base"
        >
          {saving ? 'Saving…' : 'Save & Preview Game'}
        </button>
        <Link href="/host/dashboard" className="btn-secondary px-8 py-3">
          Cancel
        </Link>
      </div>
    </main>
  );
}

export default function NewGamePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link
          href="/host/dashboard"
          className="text-[var(--secondary-foreground)] hover:text-white text-sm"
        >
          ← Dashboard
        </Link>
        <span className="text-xl font-bold gradient-text">New Game</span>
      </header>
      <Suspense fallback={<div className="p-10 text-center text-[var(--secondary-foreground)]">Loading…</div>}>
        <NewGameForm />
      </Suspense>
    </div>
  );
}
