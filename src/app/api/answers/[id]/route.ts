import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';
import { z } from 'zod';

interface Params {
  params: Promise<{ id: string }>;
}

const ScoreAnswerSchema = z.object({
  correct: z.boolean(),
  points_awarded: z.number().int().min(0),
});

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  const body = await req.json();
  const parsed = ScoreAnswerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { correct, points_awarded } = parsed.data;

  // Fetch the answer with session info to verify host owns the session
  const { data: answer } = await db
    .from('answers')
    .select('id, team_id, game_session_id, correct, points_awarded')
    .eq('id', id)
    .single();
  const answerRecord = answer as {
    team_id: string;
    game_session_id: string;
    correct: boolean | null;
    points_awarded: number | null;
  } | null;

  if (!answerRecord) return NextResponse.json({ error: 'Answer not found' }, { status: 404 });

  const { data: session } = await supabase
    .from('game_sessions')
    .select('host_id')
    .eq('id', answerRecord.game_session_id)
    .single();
  const sessionRecord = session as { host_id: string } | null;

  if (!sessionRecord || sessionRecord.host_id !== hostId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Update answer record
  const { error: answerError } = await db
    .from('answers')
    .update({ correct, points_awarded })
    .eq('id', id);

  if (answerError) return NextResponse.json({ error: answerError.message }, { status: 500 });

  // Adjust session_team score
  const scoreDelta = points_awarded - (answerRecord.correct ? (answerRecord.points_awarded ?? 0) : 0);
  
  console.log('[DEBUG SCORING]', {
    answerId: id,
    teamId: answerRecord.team_id,
    sessionId: answerRecord.game_session_id,
    oldCorrect: answerRecord.correct,
    newCorrect: correct,
    oldPoints: answerRecord.points_awarded,
    newPoints: points_awarded,
    scoreDelta
  });
  
  if (scoreDelta !== 0) {
    const { error: rpcError } = await serviceClient.rpc('increment_team_score', {
      p_session_id: answerRecord.game_session_id,
      p_team_id: answerRecord.team_id,
      p_delta: scoreDelta,
    });
    if (rpcError) {
      console.error('[PATCH Answer] RPC failed:', rpcError);
      return NextResponse.json({ error: 'Failed to update score: ' + rpcError.message }, { status: 500 });
    }
    console.log('[DEBUG SCORING] RPC succeeded, delta applied:', scoreDelta);
  } else {
    console.log('[DEBUG SCORING] scoreDelta is 0, skipping RPC');
  }

  if (answerRecord.correct !== correct) {
    await serviceClient.rpc('update_team_correct_count', {
      p_session_id: answerRecord.game_session_id,
      p_team_id: answerRecord.team_id,
      p_delta: correct ? 1 : -1,
    });
  }

  return NextResponse.json({ success: true });
}
