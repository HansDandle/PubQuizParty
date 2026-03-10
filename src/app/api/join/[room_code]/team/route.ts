import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ room_code: string }>;
}

const JoinTeamSchema = z.object({
  team_name: z.string().min(1).max(40),
  avatar_emoji: z.string().min(1),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { room_code } = await params;
    const supabase = await createClient();
    const db = supabase as any;

    console.log('[Join Team] Room code:', room_code);

    const { data: session } = await supabase
      .from('game_sessions')
      .select('id, status')
      .eq('room_code', room_code.toUpperCase())
      .in('status', ['waiting', 'active'])
      .single();
    const sessionRecord = session as { id: string; status: string } | null;

    if (!sessionRecord) {
      console.log('[Join Team] Session not found for room code:', room_code);
      return NextResponse.json({ error: 'Session not found or not accepting players' }, { status: 404 });
    }

    console.log('[Join Team] Found session:', sessionRecord.id);

    const body = await req.json();
    console.log('[Join Team] Request body:', body);
    
    const parsed = JoinTeamSchema.safeParse(body);
    if (!parsed.success) {
      console.error('[Join Team] Validation failed:', parsed.error);
      const firstError = parsed.error.errors[0];
      const errorMessage = firstError 
        ? `${firstError.path.join('.')}: ${firstError.message}`
        : 'Validation failed';
      return NextResponse.json({ error: errorMessage }, { status: 422 });
    }

    const { team_name, avatar_emoji } = parsed.data;

    console.log('[Join Team] Creating/finding team:', team_name);

    // Find existing team by name (case-insensitive)
    const { data: existingTeam } = await db
      .from('teams')
      .select('id')
      .ilike('team_name', team_name)
      .single();

    let teamRecord: { id: string } | null = existingTeam as { id: string } | null;

    if (!teamRecord) {
      // Create new team if not exists
      const { data: newTeam, error: teamError } = await db
        .from('teams')
        .insert({ team_name, avatar_emoji })
        .select()
        .single();
      
      if (teamError) {
        console.error('[Join Team] Team creation failed:', teamError);
        return NextResponse.json({ error: teamError.message ?? 'Failed to create team' }, { status: 500 });
      }
      
      teamRecord = newTeam as { id: string } | null;
    } else {
      // Update existing team's avatar
      await db
        .from('teams')
        .update({ avatar_emoji })
        .eq('id', teamRecord.id);
    }

    if (!teamRecord) {
      console.error('[Join Team] Team record is null');
      return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }

    console.log('[Join Team] Team record:', teamRecord.id);

    // Join session_teams (ignore if already joined)
    // NOTE: Don't include score here - upsert would reset it to 0 on rejoin!
    const { error: stError } = await db
      .from('session_teams')
      .upsert(
        { game_session_id: sessionRecord.id, team_id: teamRecord.id, avatar_emoji },
        { onConflict: 'game_session_id,team_id', ignoreDuplicates: false }
      );

    if (stError) {
      console.error('[Join Team] Session team join failed:', stError);
      return NextResponse.json({ error: stError.message }, { status: 500 });
    }

    console.log('[Join Team] Success - team joined session');

    // Broadcast team_join event for real-time updates to host
    // The host listens to postgres_changes which will pick this up automatically
    // But we can also trigger a direct notification for faster UI updates
    try {
      const channel = supabase.channel(`game:session:${sessionRecord.id}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'team_join',
        payload: {
          team_id: teamRecord.id,
          team_name,
          avatar_emoji,
        },
      });
      await supabase.removeChannel(channel);
    } catch (broadcastError) {
      // Don't fail the join if broadcast fails
      console.error('[Join Team] Broadcast failed (non-fatal):', broadcastError);
    }

    return NextResponse.json({ team_id: teamRecord.id, session_id: sessionRecord.id }, { status: 201 });
  } catch (error) {
    console.error('[Join Team] Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' }, 
      { status: 500 }
    );
  }
}
