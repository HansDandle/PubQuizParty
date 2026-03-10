import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateHost, isErrorResponse } from '@/lib/api/auth';
import type { Database } from '@/lib/supabase/types';
import { z } from 'zod';

// ─── GET /api/templates ─────────────────────────────────────
export async function GET() {
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) return authResult;
  const [hostId, supabase, serviceClient] = authResult;
  const db = supabase as any;

  const { data: templates, error } = await db
    .from('game_templates')
    .select('*')
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates });
}

// ─── POST /api/templates ─────────────────────────────────────
const RoundTemplateSchema = z.object({
  round_number: z.number().int().min(1),
  round_name: z.string().min(1).max(100),
  question_count: z.number().int().min(1).max(30).default(8),
  timer_seconds: z.number().int().min(5).max(300).nullable().default(null),
  wager_enabled: z.boolean().default(false),
  double_points: z.boolean().default(false),
  confidence_enabled: z.boolean().default(false),
  points_per_question: z.number().int().min(1).default(1),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  round_count: z.number().int().min(1).max(10).default(4),
  default_timer_seconds: z.number().int().min(5).max(300).nullable().default(null),
  auto_advance: z.boolean().default(false),
  allow_confidence_scoring: z.boolean().default(false),
  allow_wager_round: z.boolean().default(false),
  allow_double_round: z.boolean().default(false),
  answer_reveal_mode: z.enum(['per_question', 'end_of_round', 'end_of_game']).default('end_of_round'),
  leaderboard_frequency: z.enum(['never', 'after_question', 'after_round', 'manual']).default('after_round'),
  display_theme: z.enum(['dark', 'light', 'high_contrast']).default('dark'),
  round_templates: z.array(RoundTemplateSchema).optional(),
});

export async function POST(request: Request) {
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

  const body = await request.json() as unknown;
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { round_templates, ...templateData } = parsed.data;
  const templateInsert: Database['public']['Tables']['game_templates']['Insert'] = {
    ...templateData,
    host_id: hostRecord.id,
  };

  const { data: template, error: templateError } = await db
    .from('game_templates')
    .insert(templateInsert)
    .select()
    .single();

  if (templateError || !template) {
    return NextResponse.json({ error: templateError?.message ?? 'Insert failed' }, { status: 500 });
  }

  if (round_templates?.length) {
    const { error: rtError } = await db.from('round_templates').insert(
      round_templates.map((rt): Database['public']['Tables']['round_templates']['Insert'] => ({ ...rt, game_template_id: template.id }))
    );
    if (rtError) {
      return NextResponse.json({ error: rtError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: template.id, template }, { status: 201 });
}
