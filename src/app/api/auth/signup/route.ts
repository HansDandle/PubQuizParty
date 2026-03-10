import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { z } from 'zod';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(1).max(60),
});

export async function POST(request: Request) {
  const body = await request.json() as unknown;
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { email, password, display_name } = parsed.data;

  const supabase = await createClient();
  const { data: authData, error: signupError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signupError || !authData.user) {
    return NextResponse.json(
      { error: signupError?.message ?? 'Signup failed' },
      { status: 400 }
    );
  }

  // Use service role client to bypass RLS for initial host creation
  const serviceClient = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hostInsert: Database['public']['Tables']['hosts']['Insert'] = {
    user_id: authData.user.id,
    display_name,
  };

  const { error: hostError } = await serviceClient.from('hosts').insert(hostInsert);

  if (hostError) {
    console.error('Host creation error:', hostError);
    return NextResponse.json({ error: 'Failed to create host profile' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
