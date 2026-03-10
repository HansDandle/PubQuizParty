import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SeasonLeaderboardPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, start_date, end_date')
    .eq('id', id)
    .single();
  const seasonRecord = season as { name: string } | null;

  if (!seasonRecord || !season) notFound();

  const { data: scores } = await supabase
    .from('season_scores')
    .select('id, season_id, team_id, points, games_played, wins, team:teams(id, team_name, avatar_emoji)')
    .eq('season_id', id)
    .order('points', { ascending: false });

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-xl font-bold gradient-text">PubQuizParty</Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-2">{seasonRecord.name}</h1>
        <p className="text-[var(--secondary-foreground)] mb-8">Season Leaderboard</p>

        {!scores || scores.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--secondary-foreground)]">No scores yet this season.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scores.map((entry: any, i: number) => (
              <div
                key={entry.id}
                className={`flex items-center gap-4 p-4 rounded-xl ${
                  i === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' :
                  i === 1 ? 'bg-slate-400/20 border border-slate-400/40' :
                  i === 2 ? 'bg-amber-700/20 border border-amber-700/40' :
                  'card'
                }`}
              >
                <span className="text-xl w-8 text-center font-bold">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span className="flex-1 font-semibold">{entry.team.team_name}</span>
                <div className="text-right">
                  <p className="font-bold font-mono text-lg">{entry.points} pts</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {entry.games_played} games · {entry.wins} wins
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
