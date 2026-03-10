import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';
import type { Database } from '@/lib/supabase/types';
import { z } from 'zod';

const RoundSchema = z.object({
  round_number: z.number().int().min(1),
  round_name: z.string().min(1),
  timer_seconds: z.number().int().min(10).nullable().default(null),
  wager_enabled: z.boolean().default(false),
  double_points: z.boolean().default(false),
  confidence_enabled: z.boolean().default(false),
  points_per_question: z.number().int().min(1).default(1),
  question_ids: z.array(z.string().uuid()),
});

const CreateGameSchema = z.object({
  title: z.string().min(1),
  template_id: z.string().uuid().optional(),
  rounds: z.array(RoundSchema).min(1),
});

export async function POST(req: Request) {
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  const body = await req.json();
  const parsed = CreateGameSchema.safeParse(body);
  if (!parsed.success) {
    // Extract first error message for user-friendly display
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  const { title, template_id, rounds } = parsed.data;
  const gameInsert: Database['public']['Tables']['games']['Insert'] = {
    host_id: hostId,
    title,
    template_id: template_id ?? null,
    status: 'draft',
  };

  const { data: game, error: gameError } = await db
    .from('games')
    .insert(gameInsert)
    .select()
    .single();

  if (gameError || !game) return NextResponse.json({ error: gameError?.message ?? 'Game creation failed' }, { status: 500 });

  for (const round of rounds) {
    const { question_ids, ...roundData } = round;
    const roundInsert: Database['public']['Tables']['rounds']['Insert'] = {
      game_id: game.id,
      ...roundData,
    };

    const { data: roundRow, error: roundError } = await db
      .from('rounds')
      .insert(roundInsert)
      .select()
      .single();

    if (roundError || !roundRow) {
      await db.from('games').delete().eq('id', game.id);
      return NextResponse.json({ error: roundError?.message ?? 'Round creation failed' }, { status: 500 });
    }

    if (question_ids.length > 0) {
      await db.from('round_questions').insert(
        question_ids.map((qid, idx): Database['public']['Tables']['round_questions']['Insert'] => ({
          round_id: roundRow.id,
          question_id: qid,
          order_index: idx,
        }))
      );

      await db.from('question_history').insert(
        question_ids.map((qid): Database['public']['Tables']['question_history']['Insert'] => ({
          host_id: hostRecord.id,
          question_id: qid,
          game_id: game.id,
          used_at: new Date().toISOString(),
        }))
      );
    }
  }

  return NextResponse.json({ id: game.id }, { status: 201 });
}
