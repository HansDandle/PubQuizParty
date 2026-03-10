import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: host } = await supabase
    .from('hosts')
    .select('id, display_name')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string; display_name: string } | null;
  if (!hostRecord) redirect('/login');

  const [{ count: gamesTotal }, { count: sessionsTotal }, { count: teamsTotal }] =
    await Promise.all([
      supabase
        .from('games')
        .select('*', { count: 'exact', head: true })
        .eq('host_id', hostRecord.id),
      supabase
        .from('game_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('host_id', hostRecord.id),
      supabase
        .from('session_teams')
        .select('team_id', { count: 'exact', head: true })
        .in(
          'game_session_id',
          (
            await supabase
              .from('game_sessions')
              .select('id')
              .eq('host_id', hostRecord.id)
          ).data?.map((s: { id: string }) => s.id) ?? []
        ),
    ]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link href="/host/dashboard" className="text-[var(--secondary-foreground)] hover:text-white text-sm">
          ← Dashboard
        </Link>
        <span className="text-xl font-bold gradient-text">Insights</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-8">Venue Analytics</h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-10">
          {[
            { label: 'Total Games', value: gamesTotal ?? 0, icon: '🎮' },
            { label: 'Total Sessions', value: sessionsTotal ?? 0, icon: '📡' },
            { label: 'Team Plays', value: teamsTotal ?? 0, icon: '👥' },
          ].map((stat) => (
            <div key={stat.label} className="card text-center">
              <p className="text-3xl mb-2">{stat.icon}</p>
              <p className="text-4xl font-bold text-violet-400">{stat.value}</p>
              <p className="text-sm text-[var(--secondary-foreground)] mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Coming Soon</h2>
          <ul className="space-y-2 text-[var(--secondary-foreground)] text-sm">
            <li>• Most missed questions by category</li>
            <li>• Average scores per game</li>
            <li>• Difficulty distribution of chosen questions</li>
            <li>• Returning team frequency</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
