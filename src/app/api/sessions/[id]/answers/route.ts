import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ id: string }>;
}

const SubmitAnswerSchema = z.object({
  team_id: z.string().uuid(),
  question_id: z.string().uuid(),
  answer_text: z.string().min(1),
  confidence_rank: z.number().int().min(1).max(100).default(1), // Support ranking systems with many questions
  wager_amount: z.number().int().min(0).nullable().default(null),
});

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: answers, error } = await supabase
    .from('answers')
    .select('*, teams(team_name, avatar_emoji)')
    .eq('game_session_id', id)
    .order('submitted_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ answers: answers ?? [] });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  // Use service client for player operations (bypasses RLS since players aren't authenticated)
  const db = createServiceClient() as any;

  // Validate session exists and is active (no auth required for players)
  const { data: session } = await db
    .from('game_sessions')
    .select('id, status')
    .eq('id', id)
    .single();
  const sessionRecord = session as { id: string; status: string } | null;

  if (!sessionRecord) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (sessionRecord.status !== 'active') return NextResponse.json({ error: 'Session is not active' }, { status: 409 });

  const body = await req.json();
  const parsed = SubmitAnswerSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    console.error('[Submit Answer] Validation failed:', errorMessage, 'Body:', body);
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  const { team_id, question_id, answer_text, confidence_rank, wager_amount } = parsed.data;

  // Verify team is in this session
  const { data: sessionTeam } = await db
    .from('session_teams')
    .select('id')
    .eq('game_session_id', id)
    .eq('team_id', team_id)
    .single();

  if (!sessionTeam) {
    console.error('[Submit Answer] Team not in session:', team_id, 'session:', id);
    return NextResponse.json({ error: 'Team not in session' }, { status: 403 });
  }

  // Check if this is a new answer or an update
  const { data: existingAnswer } = await db
    .from('answers')
    .select('id')
    .eq('game_session_id', id)
    .eq('team_id', team_id)
    .eq('question_id', question_id)
    .single();

  const isNewAnswer = !existingAnswer;
  console.log('[Submit Answer]', isNewAnswer ? 'New answer' : 'Updating existing answer');

  const answerData = {
    game_session_id: id,
    team_id,
    question_id,
    answer_text,
    confidence_rank,
    wager_amount,
    submitted_at: new Date().toISOString(),
    correct: null,
    points_awarded: null,
  };

  console.log('[Submit Answer] Upserting answer:', answerData);

  const { data: answer, error } = await db
    .from('answers')
    .upsert(answerData, { onConflict: 'game_session_id,team_id,question_id' })
    .select()
    .single();

  if (error) {
    console.error('[Submit Answer] Upsert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!answer) {
    console.error('[Submit Answer] No answer returned after upsert');
    return NextResponse.json({ error: 'Failed to submit answer' }, { status: 500 });
  }

  // Only increment total answered count for NEW answers
  if (isNewAnswer) {
    const { error: rpcError } = await db.rpc('increment_team_total_answered', {
      p_session_id: id,
      p_team_id: team_id,
      p_delta: 1,
    });

    if (rpcError) {
      console.error('[Submit Answer] RPC increment failed:', rpcError);
      // Don't fail the request since answer was saved, but this is a problem
    }
  }

  return NextResponse.json({ answer }, { status: 201 });
}
