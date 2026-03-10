import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * Authenticate and get host record for API routes
 * Returns [hostId, supabase, serviceClient] on success, or NextResponse error
 */
export async function authenticateHost(): Promise<
  [string, Awaited<ReturnType<typeof createClient>>, ReturnType<typeof createServiceClient>] | NextResponse
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!host) {
    return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  }

  const serviceClient = createServiceClient();
  return [host.id, supabase, serviceClient];
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(
  result: [string, any, any] | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
