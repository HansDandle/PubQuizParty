'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 4) {
      toast.error('Room code must be 4 characters');
      return;
    }
    setLoading(true);

    const res = await fetch(`/api/join/${code}`);
    if (!res.ok) {
      toast.error('Room not found. Check the code and try again.');
      setLoading(false);
      return;
    }

    router.push(`/join/${code}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="text-2xl font-bold gradient-text">
          PubQuizParty
        </Link>

        <h1 className="text-3xl font-bold mt-6 mb-2">Join a Game</h1>
        <p className="text-[var(--secondary-foreground)] mb-8">
          Enter the room code shown on screen
        </p>

        <form onSubmit={handleJoin} className="space-y-4">
          <input
            type="text"
            className="input-field text-center text-3xl font-mono tracking-[0.5em] uppercase h-16"
            placeholder="XXXX"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            autoFocus
            autoCapitalize="characters"
          />
          <button
            type="submit"
            disabled={loading || roomCode.length !== 4}
            className="btn-primary w-full py-4 text-lg"
          >
            {loading ? 'Finding game…' : 'Join Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
