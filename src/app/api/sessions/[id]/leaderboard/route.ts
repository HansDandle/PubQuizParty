import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;

  const { data: sessionTeams, error } = await db
    .from('session_teams')
    .select('score, correct_count, total_answered, avatar_emoji, team_id, teams(id, team_name)')
    .eq('game_session_id', id)
    .order('score', { ascending: false });

  if (error) {
    console.error('[Leaderboard API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const standings = ((sessionTeams as { score: number | null; correct_count: number | null; total_answered: number | null; avatar_emoji: string | null; team_id: string; teams: { id: string; team_name: string } | null }[] | null) ?? []).map((st, idx) => {
    const team = st.teams as { id: string; team_name: string } | null;
    return {
      rank: idx + 1,
      team_id: st.team_id,
      team_name: team?.team_name ?? 'Unknown',
      avatar_emoji: st.avatar_emoji ?? '❓',
      score: st.score ?? 0,
      correct_count: st.correct_count ?? 0,
      total_answered: st.total_answered ?? 0,
    };
  });

  return NextResponse.json({ standings });
}
