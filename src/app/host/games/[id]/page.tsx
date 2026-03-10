import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import GameEditorClient from './GameEditorClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GameEditorPage({ params }: Props) {
  const { id } = await params;
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

  const { data: game } = await supabase
    .from('games')
    .select(`
      *,
      rounds (
        *,
        round_questions (
          *,
          questions (*)
        )
      )
    `)
    .eq('id', id)
    .eq('host_id', hostRecord.id)
    .single();
  const gameRecord = game as { title: string } | null;

  if (!gameRecord || !game) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/host/dashboard"
            className="text-[var(--secondary-foreground)] hover:text-white text-sm"
          >
            ← Dashboard
          </Link>
          <span className="text-xl font-bold gradient-text">{gameRecord.title}</span>
        </div>
        <Link
          href={`/host/games/${id}/session`}
          className="btn-primary px-5 py-2"
        >
          ▶ Start Session
        </Link>
      </header>
      <GameEditorClient game={game} />
    </div>
  );
}
