'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AVATAR_EMOJIS } from '@/lib/utils';

interface Props {
  params: Promise<{ room_code: string }>;
}

export default function JoinRoomPage({ params }: Props) {
  const { room_code } = use(params);
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [avatar, setAvatar] = useState(AVATAR_EMOJIS[0]);
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) {
      toast.error('Enter a team name');
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/join/${room_code}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: teamName.trim(), avatar_emoji: avatar }),
    });

    const data = await res.json() as {
      team_id?: string;
      session_id?: string;
      error?: string;
    };

    if (!res.ok) {
      toast.error(data.error ?? 'Failed to join');
      setLoading(false);
      return;
    }

    // Store team identity in localStorage
    localStorage.setItem('team_id', data.team_id!);
    localStorage.setItem('team_name', teamName.trim());
    localStorage.setItem('avatar_emoji', avatar);

    router.push(`/play/${data.session_id}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold gradient-text">
            PubQuizParty
          </Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-sm text-green-300">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Room {room_code}
          </div>
          <h1 className="text-2xl font-bold mt-4">Join the game</h1>
          <p className="text-[var(--secondary-foreground)] mt-1">
            Pick your team name and avatar
          </p>
        </div>

        <form onSubmit={handleJoin} className="card space-y-6">
          {/* Avatar picker */}
          <div>
            <label className="label">Team Avatar</label>
            <div className="grid grid-cols-8 gap-2">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`text-2xl p-1.5 rounded-lg transition-all ${
                    avatar === emoji
                      ? 'bg-violet-600 scale-110'
                      : 'hover:bg-[var(--secondary)]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="teamName" className="label">Team Name</label>
            <input
              id="teamName"
              type="text"
              className="input-field text-lg"
              placeholder="e.g. The Quiz Wizards"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              maxLength={40}
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading || !teamName.trim()}
            className="btn-primary w-full py-4 text-lg"
          >
            {loading ? 'Joining…' : `${avatar} Join as "${teamName || 'Team'}"`}
          </button>
        </form>
      </div>
    </div>
  );
}
