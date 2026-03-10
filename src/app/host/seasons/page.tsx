import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Season } from '@/lib/supabase/types';

export default async function SeasonsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) redirect('/login');

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, start_date, end_date, host_id')
    .eq('host_id', hostRecord.id)
    .order('start_date', { ascending: false });

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link href="/host/dashboard" className="text-[var(--secondary-foreground)] hover:text-white text-sm">
          ← Dashboard
        </Link>
        <span className="text-xl font-bold gradient-text">Seasons</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Your Seasons</h1>
          <button className="btn-primary">+ New Season</button>
        </div>

        {!seasons || seasons.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-4xl mb-4">🏆</p>
            <p className="text-xl font-semibold mb-2">No seasons yet</p>
            <p className="text-[var(--secondary-foreground)]">
              Create a season to track team standings across multiple games.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {seasons.map((season: Season) => (
              <Link
                key={season.id}
                href={`/season/${season.id}/leaderboard`}
                className="card flex items-center justify-between hover:border-violet-500/50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-lg">{season.name}</p>
                  <p className="text-sm text-[var(--secondary-foreground)] mt-1">
                    {new Date(season.start_date).toLocaleDateString()}
                    {season.end_date && ` → ${new Date(season.end_date).toLocaleDateString()}`}
                    {' · '}
                    {season.scoring_method.replace('_', ' ')}
                  </p>
                </div>
                <span className="text-violet-400">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
