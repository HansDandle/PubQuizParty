import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import { z } from 'zod';
import { createHash } from 'crypto';

const CreateQuestionSchema = z.object({
  question_text: z.string().min(5).max(500),
  answer: z.string().min(1).max(200),
  category: z.string().min(1).max(100).default('Other'),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: Request) {
  console.log('[Create Question] Starting request');
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    console.log('[Create Question] Unauthorized - no user');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Create Question] User authenticated:', user.id);

  // Get host record
  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) {
    console.log('[Create Question] Host not found for user:', user.id);
    return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  }

  console.log('[Create Question] Host found:', hostRecord.id);

  const body = await req.json();
  console.log('[Create Question] Request body:', body);
  
  const parsed = CreateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[Create Question] Validation failed:', parsed.error.flatten());
    // Extract first error message for user-friendly display
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  const { question_text, answer, category, difficulty } = parsed.data;

  // Compute normalized hash for deduplication
  const normalizedText = question_text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const normalizedAnswer = answer.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const normalized_hash = createHash('sha256')
    .update(`${normalizedText}|${normalizedAnswer}`)
    .digest('hex');

  console.log('[Create Question] Normalized hash:', normalized_hash);

  // Check for duplicates
  const { data: existing } = await supabase
    .from('questions')
    .select('id')
    .eq('normalized_hash', normalized_hash)
    .single();

  if (existing) {
    console.log('[Create Question] Duplicate found:', existing);
    return NextResponse.json({ 
      error: 'A very similar question already exists',
      existing_id: (existing as { id: string }).id 
    }, { status: 409 });
  }

  // Insert the question
  const questionInsert: Database['public']['Tables']['questions']['Insert'] = {
    question_text,
    answer,
    category,
    difficulty: difficulty ?? null,
    source: 'host_generated',
    created_by_host_id: hostRecord.id,
    normalized_hash,
    verified: false,
  };

  console.log('[Create Question] Inserting question');

  const { data: created, error: insertError } = await supabase
    .from('questions')
    .insert(questionInsert as any)
    .select()
    .single();

  if (insertError) {
    console.error('[Create Question] Insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 });
  }

  console.log('[Create Question] Success - created question:', (created as any)?.id);

  return NextResponse.json({ question: created }, { status: 201 });
}
