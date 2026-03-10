import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ room_code: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { room_code } = await params;
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from('game_sessions')
    .select('id, room_code, status, display_theme')
    .eq('room_code', room_code.toUpperCase())
    .in('status', ['waiting', 'active'])
    .single();

  if (error || !session) return NextResponse.json({ error: 'Session not found or not accepting players' }, { status: 404 });
  return NextResponse.json({ session });
}
