import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import { z } from 'zod';

interface Params {
  params: Promise<{ id: string }>;
}

async function getHostAndTemplate(templateId: string) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, supabase, host: null, template: null };

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) return { error: 'Host not found', status: 404, supabase, host: null, template: null };

  const { data: template } = await db
    .from('game_templates')
    .select('*, round_templates(*)')
    .eq('id', templateId)
    .eq('host_id', hostRecord.id)
    .single();
  if (!template) return { error: 'Template not found', status: 404, supabase, host: hostRecord, template: null };

  return { error: null, status: 200, supabase: db, host: hostRecord, template: template as Database['public']['Tables']['game_templates']['Row'] & { round_templates: Database['public']['Tables']['round_templates']['Row'][] } };
}

// ─── GET /api/templates/:id ──────────────────────────────────
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error, status, template } = await getHostAndTemplate(id);
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json({ template });
}

// ─── PUT /api/templates/:id ──────────────────────────────────
const UpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  default_timer_seconds: z.number().int().min(5).max(300).nullable().optional(),
  auto_advance: z.boolean().optional(),
  allow_confidence_scoring: z.boolean().optional(),
  allow_wager_round: z.boolean().optional(),
  allow_double_round: z.boolean().optional(),
  answer_reveal_mode: z.enum(['per_question', 'end_of_round', 'end_of_game']).optional(),
  leaderboard_frequency: z.enum(['never', 'after_question', 'after_round', 'manual']).optional(),
  display_theme: z.enum(['dark', 'light', 'high_contrast']).optional(),
}).strict();

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const { error, status, supabase, host, template } = await getHostAndTemplate(id);
  if (error || !host || !template) return NextResponse.json({ error }, { status });

  const body = await request.json() as unknown;
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('game_templates')
    .update(parsed.data)
    .eq('id', id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// ─── DELETE /api/templates/:id ───────────────────────────────
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const { error, status, supabase, host, template } = await getHostAndTemplate(id);
  if (error || !host || !template) return NextResponse.json({ error }, { status });

  const { error: deleteError } = await supabase
    .from('game_templates')
    .delete()
    .eq('id', id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
