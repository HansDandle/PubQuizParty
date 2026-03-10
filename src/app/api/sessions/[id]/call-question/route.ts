import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';
import { z } from 'zod';

interface Params {
  params: Promise<{ id: string }>;
}

const CallQuestionSchema = z.object({
  round_question_id: z.string().uuid(),
  question_id: z.string().uuid(),
  question_text: z.string(),
  question_number: z.number().int().min(1),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  const body = await req.json();
  const parsed = CallQuestionSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  // Verify session belongs to host
  const { data: session } = await db
    .from('game_sessions')
    .select('id, called_question_ids, host_id')
    .eq('id', id)
    .single();
    
  if (!session || session.host_id !== hostRecord.id) {
    return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 403 });
  }

  const calledQuestions = session.called_question_ids || [];
  const { round_question_id, question_id, question_text, question_number } = parsed.data;

  // Add to called questions if not already called
  if (!calledQuestions.includes(round_question_id)) {
    const updatedCalled = [...calledQuestions, round_question_id];
    
    const { data: updatedSession, error } = await db
      .from('game_sessions')
      .update({ called_question_ids: updatedCalled })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Broadcast to all clients
    await db.channel(`game:session:${id}`)
      .send({
        type: 'broadcast',
        event: 'question_call',
        payload: {
          round_question_id,
          question_id,
          question_text,
          question_number,
        },
      });

    return NextResponse.json({ session: updatedSession });
  }

  return NextResponse.json({ success: true });
}
