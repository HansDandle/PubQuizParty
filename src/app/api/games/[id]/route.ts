import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const { data: game, error } = await supabase
    .from('games')
    .select(`
      *,
      rounds (
        *,
        round_questions (
          *,
          questions (*)
        )
      )
    `)
    .eq('id', id)
    .eq('host_id', hostRecord.id)
    .order('round_number', { referencedTable: 'rounds' })
    .single();

  if (error || !game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  return NextResponse.json(game);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) return NextResponse.json({ error: 'Host not found' }, { status: 404 });

  const { error } = await supabase
    .from('games')
    .delete()
    .eq('id', id)
    .eq('host_id', hostRecord.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
