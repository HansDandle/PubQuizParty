'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import type { Game, Round, RoundQuestion, Question } from '@/lib/supabase/types';
import { difficultyLabel } from '@/lib/utils';

type RoundWithQuestions = Round & {
  round_questions: (RoundQuestion & { questions: Question })[];
};

type GameWithRounds = Game & { rounds: RoundWithQuestions[] };

interface Props {
  game: GameWithRounds;
}

export default function GameEditorClient({ game }: Props) {
  const [rounds, setRounds] = useState<RoundWithQuestions[]>(
    [...game.rounds].sort((a, b) => a.round_number - b.round_number)
  );
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ roundId: string; rqId: string } | null>(null);

  function reorderQuestions(roundId: string, fromIndex: number, toIndex: number) {
    setRounds((prev) =>
      prev.map((r) => {
        if (r.id !== roundId) return r;
        
        const sorted = [...r.round_questions].sort((a, b) => a.order_index - b.order_index);
        const [moved] = sorted.splice(fromIndex, 1);
        sorted.splice(toIndex, 0, moved);
        
        // Update order_index for all questions in the round
        const reordered = sorted.map((rq, idx) => ({
          ...rq,
          order_index: idx,
        }));
        
        return { ...r, round_questions: reordered };
      })
    );
  }

  function removeQuestion(roundId: string, rqId: string) {
    setRounds((prev) =>
      prev.map((r) =>
        r.id === roundId
          ? { ...r, round_questions: r.round_questions.filter((rq) => rq.id !== rqId) }
          : r
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    const body = rounds.map((r) => ({
      round_number: r.round_number,
      round_name: r.round_name,
      timer_seconds: r.timer_seconds ?? 30,
      wager_enabled: r.wager_enabled,
      double_points: r.double_points,
      confidence_enabled: r.confidence_enabled,
      points_per_question: r.points_per_question ?? 1,
      question_ids: r.round_questions
        .sort((a, b) => a.order_index - b.order_index)
        .map((rq) => rq.question_id),
    }));

    const res = await fetch(`/api/games/${game.id}/rounds`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { error?: string };
    setSaving(false);
    if (res.ok) toast.success('Game saved');
    else toast.error(data.error ?? 'Failed to save');
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {rounds.map((round) => (
        <section key={round.id} className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest">
                Round {round.round_number}
              </span>
              <h3 className="text-lg font-semibold mt-0.5">{round.round_name}</h3>
            </div>
            <div className="flex items-center gap-3 text-sm text-[var(--secondary-foreground)]">
              {round.timer_seconds && <span>⏱ {round.timer_seconds}s</span>}
              {round.double_points && <span className="text-yellow-400">2× pts</span>}
              {round.wager_enabled && <span className="text-orange-400">Wager</span>}
              {round.confidence_enabled && <span className="text-blue-400">Confidence</span>}
            </div>
          </div>

          <div className="space-y-2">
            {round.round_questions
              .sort((a, b) => a.order_index - b.order_index)
              .map((rq, qi) => {
                const isDragging = draggedItem?.rqId === rq.id;
                return (
                  <div
                    key={rq.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedItem({ roundId: round.id, rqId: rq.id });
                      e.dataTransfer.effectAllowed = 'move';
                      e.currentTarget.style.opacity = '0.5';
                    }}
                    onDragEnd={(e) => {
                      setDraggedItem(null);
                      e.currentTarget.style.opacity = '1';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!draggedItem || draggedItem.roundId !== round.id) return;
                      
                      const sortedQuestions = [...round.round_questions].sort((a, b) => a.order_index - b.order_index);
                      const fromIndex = sortedQuestions.findIndex(q => q.id === draggedItem.rqId);
                      const toIndex = qi;
                      
                      if (fromIndex !== toIndex) {
                        reorderQuestions(round.id, fromIndex, toIndex);
                      }
                    }}
                    className={`flex items-start gap-3 p-3 rounded-lg bg-[var(--secondary)] group cursor-move transition-opacity ${
                      isDragging ? 'opacity-50' : ''
                    }`}
                  >
                    <span className="text-[var(--muted-foreground)] text-sm shrink-0 mt-0.5 select-none">
                      ⋮⋮
                    </span>
                    <span className="text-[var(--muted-foreground)] text-sm w-5 shrink-0 mt-0.5">
                      {qi + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{rq.questions.question_text}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        Answer: <span className="text-green-400">{rq.questions.answer}</span>
                        {' · '}
                        {rq.questions.category}
                        {' · '}
                        {difficultyLabel(rq.questions.difficulty)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeQuestion(round.id, rq.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs transition-opacity shrink-0"
                      title="Remove question"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            {round.round_questions.length} questions
          </p>
        </section>
      ))}

      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-8 py-3"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </main>
  );
}
