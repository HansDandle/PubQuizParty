import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getEmbedding } from '@/lib/ai/embeddings';
import type { Database, Question } from '@/lib/supabase/types';
import { z } from 'zod';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.LLM_API_KEY,
});

type MatchQuestionResult = Database['public']['Functions']['match_questions']['Returns'][number];

const GenerateSchema = z.object({
  topics: z.array(z.string().min(1)).min(1),
  question_count: z.number().int().min(1).max(30).default(10),
  exclude_question_ids: z.array(z.string().uuid()).default([]),
  timer_seconds: z.number().int().min(10).nullable().default(null),
  confidence_enabled: z.boolean().default(false),
  wager_enabled: z.boolean().default(false),
});

// Map common topic queries to database category names
async function getCategoryVariations(topic: string): Promise<string[]> {
  const topicLower = topic.toLowerCase();
  const variations: string[] = [topic]; // Always include original
  
  // Static map for common queries
  const categoryMap: Record<string, string[]> = {
    'movie': ['Entertainment', 'Movies & TV'],
    'movies': ['Entertainment', 'Movies & TV'],
    'film': ['Entertainment', 'Movies & TV'],
    'tv': ['Entertainment', 'Movies & TV'],
    'television': ['Entertainment', 'Movies & TV'],
    'music': ['Music'],
    'song': ['Music'],
    'band': ['Music'],
    'book': ['Arts & Literature'],
    'books': ['Arts & Literature'],
    'literature': ['Arts & Literature'],
    'author': ['Arts & Literature'],
    'science': ['Science & Nature'],
    'biology': ['Science & Nature'],
    'chemistry': ['Science & Nature'],
    'physics': ['Science & Nature'],
    'history': ['History'],
    'geography': ['Geography'],
    'sport': ['Sports & Leisure'],
    'sports': ['Sports & Leisure'],
    'food': ['Food & Drink'],
    'cooking': ['Food & Drink'],
    'math': ['Mathematics & Logic'],
    'logic': ['Mathematics & Logic'],
    'religion': ['Religion & Mythology'],
    'mythology': ['Religion & Mythology'],
    'business': ['Business & Economics'],
    'technology': ['Technology & Gaming'],
    'tech': ['Technology & Gaming'],
    'gaming': ['Technology & Gaming'],
    'games': ['Technology & Gaming'],
    'car': ['Transportation'],
    'cars': ['Transportation'],
    'vehicle': ['Transportation'],
    'automobile': ['Transportation'],
    'train': ['Transportation'],
    'plane': ['Transportation'],
    'aircraft': ['Transportation'],
    'ship': ['Transportation'],
    'ships': ['Transportation'],
    'boat': ['Transportation'],
    'boats': ['Transportation'],
    'sailing': ['Transportation'],
    'naval': ['Transportation'],
    'maritime': ['Transportation'],
  };
  
  // Find matching categories in static map
  for (const [key, cats] of Object.entries(categoryMap)) {
    if (topicLower.includes(key) || key.includes(topicLower)) {
      variations.push(...cats);
      return [...new Set(variations)]; // Found match, return early
    }
  }
  
  // If no static match and Groq is configured, use LLM to classify
  if (process.env.LLM_API_KEY) {
    try {
      console.log('[Category Classification] Using Groq to classify:', topic);
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a category classifier for trivia questions. Given a topic, return ONLY the most relevant category names from this list:
- Arts & Literature
- Business & Economics
- Entertainment
- Food & Drink
- Geography
- History
- Mathematics & Logic
- Movies & TV
- Music
- Religion & Mythology
- Science & Nature
- Sports & Leisure
- Technology & Gaming
- Transportation

Return 1-3 categories as a comma-separated list. No explanations.`
          },
          {
            role: 'user',
            content: topic
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 100,
      });
      
      const categories = completion.choices[0]?.message?.content?.trim();
      if (categories) {
        const parsedCategories = categories.split(',').map((c: string) => c.trim()).filter(Boolean);
        console.log('[Category Classification] ✅ Groq classified:', topic, '→', parsedCategories);
        variations.push(...parsedCategories);
      }
    } catch (err) {
      console.error('[Category Classification] ❌ Groq classification failed for:', topic);
      console.error('[Category Classification] Error:', err);
      // Continue with just the original topic
    }
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

export async function POST(req: Request) {
  console.log('[Round Generate] Starting request');
  
  const authResult = await authenticateHost();
  if (isErrorResponse(authResult)) {
    console.log('[Round Generate] Unauthorized - authentication failed');
    return authResult;
  }
  const [hostId, supabase, serviceClient] = authResult;

  console.log('[Round Generate] Host authenticated:', hostId);

  const body = await req.json();
  console.log('[Round Generate] Request body:', body);
  
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[Round Generate] Validation failed:', parsed.error.flatten());
    // Extract first error message for user-friendly display
    const firstError = parsed.error.errors[0];
    const errorMessage = firstError 
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  const { topics, question_count, exclude_question_ids, timer_seconds, confidence_enabled, wager_enabled } = parsed.data;
  console.log('[Round Generate] Validated params:', { topics, question_count, exclude_count: exclude_question_ids.length });
  
  const serviceClient = createServiceClient();

  // Get questions recently used by this host (past 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: recentHistory } = await serviceClient
    .from('question_history')
    .select('question_id')
    .eq('host_id', hostId)
    .gte('used_at', sixMonthsAgo.toISOString());

  const recentlyUsedIds = new Set([
    ...exclude_question_ids,
    ...((recentHistory as { question_id: string }[] | null)?.map((h) => h.question_id) ?? []),
  ]);

  console.log('[Round Generate] Excluding', recentlyUsedIds.size, 'recently used questions');

  // Gather candidate questions via embedding similarity for each topic
  const candidateMap = new Map<string, Question | MatchQuestionResult>();

  for (const topic of topics) {
    console.log('[Round Generate] Processing topic:', topic);
    
    // Skip embedding if API not configured - go straight to fallback
    if (!process.env.EMBEDDING_API_URL) {
      console.log('[Round Generate] No embedding API configured, using category search');
      
      // Try multiple category matches based on common mappings
      const categoryVariations = await getCategoryVariations(topic);
      console.log('[Round Generate] Trying categories:', categoryVariations);
      
      const { data: fallback, error: fallbackError } = await serviceClient
        .from('questions')
        .select('*')
        .or(categoryVariations.map(cat => `category.ilike.%${cat}%`).join(','))
        .order('id', { ascending: false })  // Get newer questions first
        .limit(question_count * 10);  // Get more candidates for variety
      
      if (fallbackError) {
        console.error('[Round Generate] Category search error:', fallbackError);
      } else {
        console.log('[Round Generate] Category search found', fallback?.length || 0, 'questions');
        for (const q of (fallback as Question[] | null) ?? []) {
          if (!recentlyUsedIds.has(q.id)) {
            candidateMap.set(q.id, q);
            console.log('[Round Generate] Added question:', q.question_text.substring(0, 60), '... (category:', q.category, ')');
          }
        }
      }
      continue;
    }
    
    let embedding: number[];
    try {
      console.log('[Round Generate] Getting embedding for topic:', topic);
      embedding = await getEmbedding(topic);
      console.log('[Round Generate] Embedding received, length:', embedding.length);
    } catch (err) {
      console.error('[Round Generate] Embedding failed for topic:', topic, err);
      // Fallback: category search with variations
      console.log('[Round Generate] Using category fallback search');
      
      const categoryVariations = await getCategoryVariations(topic);
      console.log('[Round Generate] Trying categories:', categoryVariations);
      
      const { data: fallback, error: fallbackError } = await serviceClient
        .from('questions')
        .select('*')
        .or(categoryVariations.map(cat => `category.ilike.%${cat}%`).join(','))
        .order('id', { ascending: false })  // Get newer questions first
        .limit(question_count * 10);  // Get more candidates for variety
      
      if (fallbackError) {
        console.error('[Round Generate] Category fallback error:', fallbackError);
      } else {
        console.log('[Round Generate] Category fallback found', fallback?.length || 0, 'questions');
        for (const q of (fallback as Question[] | null) ?? []) {
          if (!recentlyUsedIds.has(q.id)) {
            candidateMap.set(q.id, q);
            console.log('[Round Generate] Added question:', q.question_text.substring(0, 60), '... (category:', q.category, ')');
          }
        }
      }
      continue;
    }

    // pgvector similarity search via RPC
    console.log('[Round Generate] Calling match_questions RPC');
    const { data: similar, error: rpcError } = await serviceClient.rpc('match_questions', {
      query_embedding: embedding,
      match_count: question_count * 3,
    });

    if (rpcError) {
      console.error('[Round Generate] RPC error:', rpcError);
      // Try fallback search instead
      console.log('[Round Generate] Using tags fallback search');
      const { data: fallback, error: fallbackError } = await serviceClient
        .from('questions')
        .select('*')
        .or(`category.ilike.%${topic}%,tags.cs.{${topic}}`)
        .limit(question_count * 2);
      
      if (fallbackError) {
        console.error('[Round Generate] Tags fallback error:', fallbackError);
      } else {
        console.log('[Round Generate] Tags fallback found', fallback?.length || 0, 'questions');
        for (const q of (fallback as Question[] | null) ?? []) {
          if (!recentlyUsedIds.has(q.id)) candidateMap.set(q.id, q);
        }
      }
    } else {
      console.log('[Round Generate] RPC returned', similar?.length || 0, 'similar questions');
      for (const q of (similar as MatchQuestionResult[] | null) ?? []) {
        if (!recentlyUsedIds.has(q.id)) candidateMap.set(q.id, q);
      }
    }
  }

  const candidates = Array.from(candidateMap.values());
  console.log('[Round Generate] Total candidates before padding:', candidates.length);

  // If RPC not available or candidates are scarce, fall back to random selection from questions
  if (candidates.length < question_count) {
    console.warn('[Round Generate] ⚠️ Only found', candidates.length, 'matching questions for topics:', topics.join(', '));
    console.warn('[Round Generate] ⚠️ Falling back to random questions to reach', question_count, 'total');
    const { data: extra, error: extraError } = await serviceClient
      .from('questions')
      .select('*')
      .order('id', { ascending: false })  // Get newer questions
      .limit(question_count * 10);

    if (extraError) {
      console.error('[Round Generate] Random fetch error:', extraError);
    } else {
      console.log('[Round Generate] Random fetch returned', extra?.length || 0, 'questions');
      for (const q of (extra as Question[] | null) ?? []) {
        if (!recentlyUsedIds.has(q.id)) candidateMap.set(q.id, q);
        if (candidateMap.size >= question_count * 2) break;
      }
    }
  }

  // Shuffle again after adding extras and take final selection
  const allCandidates = Array.from(candidateMap.values());
  const shuffledFinal = allCandidates.sort(() => Math.random() - 0.5);
  const selected = shuffledFinal.slice(0, question_count);
  console.log('[Round Generate] Final selection:', selected.length, 'questions');

  if (selected.length === 0) {
    console.error('[Round Generate] No questions found!');
    return NextResponse.json({ error: 'No questions found matching criteria' }, { status: 404 });
  }

  console.log('[Round Generate] Success - returning', selected.length, 'questions');
  
  // Format response to match client expectations
  return NextResponse.json({
    rounds: [{
      questions: selected,
      round_config: {
        timer_seconds,
        confidence_enabled,
        wager_enabled,
        double_points: false,
      },
    }],
  });
}
