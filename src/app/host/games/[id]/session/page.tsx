import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SessionControlClient from './SessionControlClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: Props) {
  const { id: gameId } = await params;
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

  // Load game with rounds, questions, and template
  const { data: game } = await supabase
    .from('games')
    .select(`
      *,
      game_templates (*),
      rounds (
        *,
        round_questions (
          *,
          questions (*)
        )
      )
    `)
    .eq('id', gameId)
    .eq('host_id', hostRecord.id)
    .single();

  if (!game) notFound();

  // Check for an existing active/waiting session for this game
  const { data: existingSession, error: sessionError } = await supabase
    .from('game_sessions')
    .select('id, game_id, room_code, status, current_round_index, current_question_index, created_at, host_id')
    .eq('game_id', gameId)
    .in('status', ['waiting', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    console.error('[Session Page] Error loading session:', sessionError);
  } else if (existingSession) {
    console.log('[Session Page] Existing session:', (existingSession as any).id);
  } else {
    console.log('[Session Page] No existing session found');
  }

  return (
    <SessionControlClient
      game={game}
      hostId={hostRecord.id}
      existingSession={existingSession ?? null}
    />
  );
}
