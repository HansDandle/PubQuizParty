import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import { z } from 'zod';

interface Params {
  params: Promise<{ id: string }>;
}

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

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  // Verify game ownership
  const { data: game } = await supabase
    .from('games')
    .select('id')
    .eq('id', id)
    .eq('host_id', hostRecord.id)
    .single();
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const body = await req.json();
  const parsed = z.array(RoundSchema).safeParse(body);
  if (!parsed.success) {
    // Extract first error message for user-friendly display
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  const rounds = parsed.data;

  // Fetch existing round ids
  const { data: existingRounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', id);

  if (existingRounds?.length) {
    const roundIds = (existingRounds as { id: string }[]).map((r) => r.id);
    await supabase.from('round_questions').delete().in('round_id', roundIds);
    await supabase.from('rounds').delete().eq('game_id', id);
  }

  for (const round of rounds) {
    const { question_ids, ...roundData } = round;
    const roundInsert: Database['public']['Tables']['rounds']['Insert'] = {
      game_id: id,
      ...roundData,
    };

    const { data: roundRow, error: roundError } = await db
      .from('rounds')
      .insert(roundInsert)
      .select()
      .single();

    if (roundError || !roundRow) return NextResponse.json({ error: roundError?.message ?? 'Round update failed' }, { status: 500 });

    if (question_ids.length > 0) {
      await db.from('round_questions').insert(
        question_ids.map((qid, idx): Database['public']['Tables']['round_questions']['Insert'] => ({
          round_id: roundRow.id,
          question_id: qid,
          order_index: idx,
        }))
      );
    }
  }

  return NextResponse.json({ success: true });
}
