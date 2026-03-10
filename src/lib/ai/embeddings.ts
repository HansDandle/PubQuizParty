/**
 * Generates a text embedding vector using the configured embedding API.
 * Supports HuggingFace Inference API or a self-hosted endpoint
 * that accepts { inputs: string } and returns number[].
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const url = process.env.EMBEDDING_API_URL;
  const key = process.env.EMBEDDING_API_KEY;

  if (!url) {
    throw new Error('EMBEDDING_API_URL is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as number[] | number[][];

  // HuggingFace returns nested arrays for batch inputs; flatten single item
  if (Array.isArray(data[0])) {
    return (data as number[][])[0];
  }
  return data as number[];
}

/**
 * Calls the LLM API to parse a freeform round topic into a structured category query.
 * Returns the best matching top-level category name.
 */
export async function classifyTopic(topic: string): Promise<string> {
  const url = process.env.LLM_API_URL;
  const key = process.env.LLM_API_KEY;

  const CATEGORIES = [
    'Arts & Literature', 'Business & Economics', 'Entertainment',
    'Food & Drink', 'Geography', 'History', 'Holidays & Traditions',
    'Language & Words', 'Mathematics & Logic', 'Music', 'People & Places',
    'Religion & Mythology', 'Science & Nature', 'Sports & Leisure',
    'Technology & Gaming', 'Transportation', 'Other',
  ];

  if (!url) {
    // Fallback: return 'Other' if no LLM configured
    return 'Other';
  }

  const prompt = `Given this trivia round topic: "${topic}"
Map it to exactly one of these categories:
[${CATEGORIES.join(', ')}]
Return only the category name, nothing else.`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    return 'Other';
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  return CATEGORIES.includes(content) ? content : 'Other';
}
