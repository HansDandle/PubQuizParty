import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import EditTemplateClient from './EditTemplateClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: host } = await supabase
    .from('hosts')
    .select('id')
    .eq('user_id', user.id)
    .single();
  const hostRecord = host as { id: string } | null;
  if (!hostRecord) redirect('/login');

  const { data: template } = await supabase
    .from('game_templates')
    .select('*, round_templates(*)')
    .eq('id', id)
    .eq('host_id', hostRecord.id)
    .single();

  if (!template) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link
          href="/host/dashboard"
          className="text-[var(--secondary-foreground)] hover:text-white text-sm"
        >
          ← Dashboard
        </Link>
        <span className="text-xl font-bold gradient-text">Edit Template</span>
      </header>
      <EditTemplateClient template={template} />
    </div>
  );
}
