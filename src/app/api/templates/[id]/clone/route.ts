import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Params) {
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

  // Load original template with rounds
  const { data: original } = await db
    .from('game_templates')
    .select('*, round_templates(*)')
    .eq('id', id)
    .eq('host_id', hostRecord.id)
    .single();
  const templateRecord = original as (Database['public']['Tables']['game_templates']['Row'] & {
    round_templates: Database['public']['Tables']['round_templates']['Row'][];
  }) | null;
  if (!templateRecord) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const { id: _id, created_at: _ca, round_templates, ...templateData } = templateRecord;

  const { data: cloned, error } = await db
    .from('game_templates')
    .insert({ ...templateData, name: `${templateData.name} (Copy)`, host_id: hostRecord.id })
    .select()
    .single();

  if (error || !cloned) return NextResponse.json({ error: error?.message ?? 'Clone failed' }, { status: 500 });

  if (round_templates?.length) {
    await db.from('round_templates').insert(
      round_templates.map(({ id: _rid, game_template_id: _gtid, ...rt }: { id: string; game_template_id: string; [key: string]: unknown }) => ({
        ...rt,
        game_template_id: cloned.id,
      }))
    );
  }

  return NextResponse.json({ id: cloned.id }, { status: 201 });
}
