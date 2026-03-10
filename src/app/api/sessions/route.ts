import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';
import { generateRoomCode } from '@/lib/utils';
import { z } from 'zod';

const CreateSessionSchema = z.object({
  game_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  const body = await req.json();
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { game_id } = parsed.data;

  // Verify game ownership
  const { data: game } = await db
    .from('games')
    .select('id, template_id')
    .eq('id', game_id)
    .eq('host_id', hostId)
    .single();
  const gameRecord = game as { id: string; template_id: string | null } | null;
  if (!gameRecord) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  // Load display settings from template if available
  let sessionDefaults: {
    answer_reveal_mode: string;
    leaderboard_frequency: number;
    display_theme: string;
  } = {
    answer_reveal_mode: 'after_question',
    leaderboard_frequency: 3,
    display_theme: 'dark',
  };

  if (gameRecord.template_id) {
    const { data: template } = await supabase
      .from('game_templates')
      .select('answer_reveal_mode, leaderboard_frequency, display_theme')
      .eq('id', gameRecord.template_id)
      .single();
    if (template) sessionDefaults = template as typeof sessionDefaults;
  }

  // Generate unique room code (retry up to 5 times on collision)
  let room_code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data: existing } = await supabase
      .from('game_sessions')
      .select('id')
      .eq('room_code', code)
      .in('status', ['waiting', 'active'])
      .single();
    if (!existing) {
      room_code = code;
      break;
    }
  }
  if (!room_code) return NextResponse.json({ error: 'Could not generate unique room code' }, { status: 500 });

  const { data: session, error } = await db
    .from('game_sessions')
    .insert({
      game_id,
      host_id: hostRecord.id,
      room_code,
      status: 'waiting',
      current_question_index: 0,
      ...sessionDefaults,
    })
    .select()
    .single();

  if (error || !session) return NextResponse.json({ error: error?.message ?? 'Session creation failed' }, { status: 500 });

  return NextResponse.json({ session }, { status: 201 });
}
