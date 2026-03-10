import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the requesting user is the host
  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .eq('id', id)
    .single();
  if (!host) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Total questions
  const { count: totalQuestions } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true });

  // Total games hosted
  const { count: totalGames } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('host_id', id);

  // Total sessions
  const { count: totalSessions } = await supabase
    .from('game_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('host_id', id);

  // Total teams seen across all sessions
  const { data: sessions } = await db
    .from('game_sessions')
    .select('id')
    .eq('host_id', id);
  const sessionIds = (sessions as { id: string }[] | null)?.map((s) => s.id) ?? [];

  let totalTeams = 0;
  if (sessionIds.length > 0) {
    const { count } = await supabase
      .from('session_teams')
      .select('*', { count: 'exact', head: true })
      .in('game_session_id', sessionIds);
    totalTeams = count ?? 0;
  }

  // Category breakdown: top 10 most-used categories
  const { data: categoryStats } = await db
    .from('question_history')
    .select('questions(category)')
    .eq('host_id', id)
    .limit(500);

  const catCounts: Record<string, number> = {};
  for (const row of (categoryStats as { questions: { category: string } | null }[] | null) ?? []) {
    const cat = (row.questions as { category: string } | null)?.category ?? 'Unknown';
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
  }

  const topCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, count]) => ({ category, count }));

  return NextResponse.json({
    total_questions: totalQuestions ?? 0,
    total_games: totalGames ?? 0,
    total_sessions: totalSessions ?? 0,
    total_teams: totalTeams,
    top_categories: topCategories,
  });
}
