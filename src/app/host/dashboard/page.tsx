import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Game, GameSession, GameTemplate } from '@/lib/supabase/types';

export default async function HostDashboard() {
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

  const [{ data: templates }, { data: recentGames }, { data: activeSessions }] =
    await Promise.all([
      supabase
        .from('game_templates')
        .select('id, name, round_count, default_timer_seconds, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('games')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('game_sessions')
        .select('id, game_id, room_code, status, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
    ]);

  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold gradient-text">PubQuizParty</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--secondary-foreground)]">
            {hostRecord.display_name}
          </span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="btn-secondary text-sm">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-[var(--secondary-foreground)] mt-1">
              Welcome back, {hostRecord.display_name}
            </p>
          </div>
          <Link href="/host/games/new" className="btn-primary px-6 py-3 text-base">
            ⚡ New Game
          </Link>
        </div>

        {/* Active sessions */}
        {activeSessions && activeSessions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
              Live Sessions
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {activeSessions.map((session: GameSession) => (
                <Link
                  key={session.id}
                  href={`/host/games/${session.game_id}/session`}
                  className="card hover:border-violet-500/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-lg font-mono tracking-widest text-violet-400">
                        {session.room_code}
                      </p>
                      <p className="text-sm text-[var(--secondary-foreground)] mt-1">
                        Active session
                      </p>
                    </div>
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Templates */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Templates</h2>
              <Link
                href="/host/templates/new"
                className="text-sm text-violet-400 hover:text-violet-300"
              >
                + New template
              </Link>
            </div>

            {!templates || templates.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-[var(--secondary-foreground)] mb-4">
                  No templates yet. Create one to speed up game setup.
                </p>
                <Link href="/host/templates/new" className="btn-primary">
                  Create Template
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template: GameTemplate) => (
                  <Link
                    key={template.id}
                    href={`/host/templates/${template.id}`}
                    className="card flex items-center justify-between hover:border-violet-500/50 transition-colors group"
                  >
                    <div>
                      <p className="font-semibold">{template.name}</p>
                      <p className="text-sm text-[var(--secondary-foreground)] mt-0.5">
                        {template.round_count} rounds ·{' '}
                        {template.default_timer_seconds
                          ? `${template.default_timer_seconds}s timer`
                          : 'No timer'}
                      </p>
                    </div>
                    <span className="text-[var(--muted-foreground)] group-hover:text-violet-400 transition-colors">
                      ✏️
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent Games */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Games</h2>
              <Link
                href="/host/games/new"
                className="text-sm text-violet-400 hover:text-violet-300"
              >
                + New game
              </Link>
            </div>

            {!recentGames || recentGames.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-[var(--secondary-foreground)] mb-4">
                  No games yet. Create your first game!
                </p>
                <Link href="/host/games/new" className="btn-primary">
                  Create Game
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentGames.map((game: Game) => (
                  <Link
                    key={game.id}
                    href={`/host/games/${game.id}`}
                    className="card flex items-center justify-between hover:border-violet-500/50 transition-colors group"
                  >
                    <div>
                      <p className="font-semibold">{game.title}</p>
                      <p className="text-sm text-[var(--secondary-foreground)] mt-0.5">
                        {new Date(game.created_at ?? new Date()).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-[var(--muted-foreground)] group-hover:text-green-400 transition-colors">
                      ▶
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Quick links */}
        <section className="mt-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { href: '/host/seasons', label: '🏆 Seasons', desc: 'Track league standings' },
              { href: '/host/insights', label: '📊 Insights', desc: 'Venue analytics' },
              { href: '/join', label: '📱 Player Join', desc: 'Share with players' },
              { href: '/host/templates/new', label: '📋 Templates', desc: 'Save game styles' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card text-center hover:border-violet-500/50 transition-colors"
              >
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-xs text-[var(--secondary-foreground)] mt-1">
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
