import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamStatsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from('teams')
    .select('id, team_name')
    .eq('id', id)
    .single();
  const teamRecord = team as { team_name: string } | null;

  if (!teamRecord || !team) notFound();

  const [{ data: stats }, { data: results }] = await Promise.all([
    supabase
      .from('team_category_stats')
      .select('id, team_id, category, accuracy_rate, questions_seen, correct_answers')
      .eq('team_id', id)
      .order('questions_seen', { ascending: false }),
    supabase
      .from('team_game_results')
      .select('id, team_id, score, rank, created_at')
      .eq('team_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const gamesPlayed = results?.length ?? 0;
  const totalScore = (results as { score: number }[] | null)?.reduce((sum, r) => sum + r.score, 0) ?? 0;
  const avgScore = gamesPlayed > 0 ? Math.round(totalScore / gamesPlayed) : 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <Link href="/" className="text-xl font-bold gradient-text">PubQuizParty</Link>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-1">{teamRecord.team_name}</h1>
        <p className="text-[var(--secondary-foreground)] mb-8">Team Stats</p>

        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: 'Games Played', value: gamesPlayed },
            { label: 'Average Score', value: avgScore },
            { label: 'Total Score', value: totalScore },
          ].map((s) => (
            <div key={s.label} className="card text-center">
              <p className="text-3xl font-bold text-violet-400">{s.value}</p>
              <p className="text-xs text-[var(--secondary-foreground)] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {stats && stats.length > 0 && (
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Category Performance</h2>
            <div className="space-y-3">
              {(stats as { id: string; category: string; accuracy_rate: number | null }[]).map((s) => (
                <div key={s.id} className="flex items-center gap-4">
                  <span className="text-sm w-36 shrink-0">{s.category}</span>
                  <div className="flex-1 h-2 bg-[var(--secondary)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.round((s.accuracy_rate ?? 0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm text-[var(--muted-foreground)] w-12 text-right">
                    {Math.round((s.accuracy_rate ?? 0) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
