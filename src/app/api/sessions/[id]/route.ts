import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';
import { z } from 'zod';

interface Params {
  params: Promise<{ id: string }>;
}

const PatchSessionSchema = z.object({
  status: z.enum(['waiting', 'active', 'finished']).optional(),
  current_round_id: z.string().uuid().nullable().optional(),
  current_question_index: z.number().int().min(0).optional(),
  started_at: z.string().datetime().nullable().optional(),
  finished_at: z.string().datetime().nullable().optional(),
  called_question_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;

  const { data: session, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  const body = await req.json();
  const parsed = PatchSessionSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  const { data: session, error } = await db
    .from('game_sessions')
    .update(parsed.data)
    .eq('id', id)
    .eq('host_id', hostId)
    .select()
    .single();

  if (error || !session) return NextResponse.json({ error: error?.message ?? 'Session not found' }, { status: 404 });
  return NextResponse.json({ session });
}
