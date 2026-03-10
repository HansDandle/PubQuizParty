import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, start_date, end_date')
    .eq('id', id)
    .single();

  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 });

  const { data: scores, error } = await db
    .from('season_scores')
    .select('points, games_played, wins, teams(id, team_name, avatar_emoji)')
    .eq('season_id', id)
    .order('points', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const standings = ((scores as { points: number | null; games_played: number | null; wins: number | null; teams: { id: string; team_name: string; avatar_emoji: string | null } | null }[] | null) ?? []).map((s, idx) => {
    const team = s.teams as { id: string; team_name: string; avatar_emoji: string } | null;
    return {
      rank: idx + 1,
      team_id: team?.id ?? null,
      team_name: team?.team_name ?? 'Unknown',
      avatar_emoji: team?.avatar_emoji ?? '❓',
      total_points: s.points ?? 0,
      games_played: s.games_played ?? 0,
      best_rank: null,
      wins: s.wins ?? 0,
    };
  });

  return NextResponse.json({ season, standings });
}
