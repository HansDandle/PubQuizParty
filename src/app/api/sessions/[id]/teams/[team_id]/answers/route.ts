import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string; team_id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id, team_id } = await params;
  const db = createServiceClient() as any;

  // Fetch answers for this team in this session
  const { data: answers, error } = await db
    .from('answers')
    .select('id, question_id, answer_text, confidence_rank, submitted_at, correct')
    .eq('game_session_id', id)
    .eq('team_id', team_id)
    .order('submitted_at', { ascending: true });

  if (error) {
    console.error('[Get Team Answers] Query failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answers: answers || [] });
}
