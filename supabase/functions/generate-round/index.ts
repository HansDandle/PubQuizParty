import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  topics: string[];
  question_count: number;
  exclude_question_ids?: string[];
  host_id: string;
}

async function getEmbedding(text: string, apiUrl: string, apiKey: string): Promise<number[]> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text }),
  });
  if (!response.ok) throw new Error(`Embedding API error: ${response.statusText}`);
  const data = await response.json() as number[][];
  return data[0];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { topics, question_count, exclude_question_ids = [], host_id }: GenerateRequest = await req.json();

    if (!topics?.length || !host_id) {
      return new Response(JSON.stringify({ error: 'topics and host_id required' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const embeddingApiUrl = Deno.env.get('EMBEDDING_API_URL') ?? '';
    const embeddingApiKey = Deno.env.get('EMBEDDING_API_KEY') ?? '';

    // Get recently used question ids for this host (past 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: recentHistory } = await supabase
      .from('question_history')
      .select('question_id')
      .eq('host_id', host_id)
      .gte('used_at', sixMonthsAgo.toISOString());

    const excludeSet = new Set([
      ...exclude_question_ids,
      ...(recentHistory?.map((h: { question_id: string }) => h.question_id) ?? []),
    ]);

    const candidateMap = new Map<string, Record<string, unknown>>();

    for (const topic of topics) {
      if (!embeddingApiUrl) break;

      const embedding = await getEmbedding(topic, embeddingApiUrl, embeddingApiKey);

      const { data: similar } = await supabase.rpc('match_questions', {
        query_embedding: embedding,
        match_count: question_count * 3,
      });

      for (const q of similar ?? []) {
        if (!excludeSet.has(q.id)) candidateMap.set(q.id, q);
      }
    }

    // Fallback: fetch random questions if not enough candidates
    if (candidateMap.size < question_count) {
      const { data: extras } = await supabase
        .from('questions')
        .select('id, question_text, answer, category, subcategory, difficulty, tags, source, source_year')
        .not('id', 'in', `(${[...excludeSet].join(',') || 'null'})`)
        .limit(question_count * 2);

      for (const q of extras ?? []) {
        if (!excludeSet.has(q.id)) candidateMap.set(q.id, q);
        if (candidateMap.size >= question_count) break;
      }
    }

    const questions = Array.from(candidateMap.values()).slice(0, question_count);

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
