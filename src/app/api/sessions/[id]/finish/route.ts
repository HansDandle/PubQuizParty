import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  // Mark session finished
  const { data: session, error: sessionError } = await db
    .from('game_sessions')
    .update({ status: 'finished', finished_at: new Date().toISOString() })
    .eq('id', id)
    .eq('host_id', hostId)
    .select()
    .single();

  if (sessionError || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Load all session_teams ordered by score desc to determine ranks
  const { data: sessionTeams } = await db
    .from('session_teams')
    .select('team_id, score, correct_count, total_answered, avatar_emoji, teams(team_name)')
    .eq('game_session_id', id)
    .order('score', { ascending: false });

  if (sessionTeams?.length) {
    const results = (sessionTeams as { team_id: string; score: number }[]).map((st, idx) => ({
      team_id: st.team_id,
      game_session_id: id,
      score: st.score,
      rank: idx + 1,
    }));

    await db.from('team_game_results').upsert(results, { onConflict: 'team_id,game_session_id' });
  }

  return NextResponse.json({ success: true });
}
