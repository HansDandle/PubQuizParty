'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);

    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName }),
    });

    const data = await response.json() as { error?: string };

    if (!response.ok) {
      toast.error(data.error ?? 'Signup failed');
      setLoading(false);
      return;
    }

    toast.success('Account created! Redirecting…');
    router.push('/host/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold gradient-text">
            PubQuizParty
          </Link>
          <h1 className="text-2xl font-bold mt-4">Create your host account</h1>
          <p className="text-[var(--secondary-foreground)] mt-1">
            Free forever. No credit card required.
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label htmlFor="displayName" className="label">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                className="input-field"
                placeholder="The Quiz Master"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={60}
              />
            </div>

            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password <span className="text-[var(--muted-foreground)]">(min 8 characters)</span>
              </label>
              <input
                id="password"
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? 'Creating account…' : 'Create Free Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[var(--secondary-foreground)] mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-violet-400 hover:text-violet-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
