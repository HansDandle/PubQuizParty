import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;

  const { data: team } = await supabase
    .from('teams')
    .select('id, team_name')
    .eq('id', id)
    .single();

  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  // Overall game results
  const { data: results } = await db
    .from('team_game_results')
    .select('score, rank, created_at')
    .eq('team_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Category accuracy
  const { data: categoryStats } = await db
    .from('team_category_stats')
    .select('category, correct_answers, questions_seen, accuracy_rate')
    .eq('team_id', id)
    .order('questions_seen', { ascending: false });

  const totalGames = results?.length ?? 0;
  const totalCorrect = (categoryStats as { correct_answers: number | null }[] | null)?.reduce((sum, row) => sum + (row.correct_answers ?? 0), 0) ?? 0;
  const totalAnswered = (categoryStats as { questions_seen: number | null }[] | null)?.reduce((sum, row) => sum + (row.questions_seen ?? 0), 0) ?? 0;
  const bestRank = (results as { rank: number | null }[] | null)?.reduce((best, r) => Math.min(best, r.rank ?? 999), 999) ?? null;
  const avgScore = totalGames > 0
    ? Math.round((((results as { score: number | null }[] | null)?.reduce((sum, r) => sum + (r.score ?? 0), 0)) ?? 0) / totalGames)
    : 0;

  return NextResponse.json({
    team,
    stats: {
      total_games: totalGames,
      total_correct: totalCorrect,
      total_answered: totalAnswered,
      accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      avg_score: avgScore,
      best_rank: bestRank,
    },
    recent_games: results ?? [],
    category_stats: categoryStats ?? [],
  });
}
