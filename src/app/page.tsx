import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold gradient-text">PubQuizParty</span>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="btn-secondary text-sm">
            Sign In
          </Link>
          <Link href="/signup" className="btn-primary text-sm">
            Get Started Free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="max-w-4xl mx-auto animate-slide-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300 mb-8">
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
            AI-Powered Trivia Hosting
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold mb-6">
            Run a pub quiz{' '}
            <span className="gradient-text">in under 60 seconds</span>
          </h1>

          <p className="text-xl text-[var(--secondary-foreground)] max-w-2xl mx-auto mb-10">
            Type your round topics. AI picks the best questions from 26,000+
            verified questions. Players join instantly with a QR code. No
            PowerPoints, no spreadsheets.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/signup" className="btn-primary px-8 py-3 text-lg">
              Start Hosting Free
            </Link>
            <Link href="/join" className="btn-secondary px-8 py-3 text-lg">
              Join a Game
            </Link>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              {
                icon: '⚡',
                title: 'AI Round Generation',
                description:
                  'Type "90s Movies" and get 8 perfectly matched questions in seconds.',
              },
              {
                icon: '📱',
                title: 'Instant Player Join',
                description:
                  'Teams join via QR code or room code. No app download needed.',
              },
              {
                icon: '🏆',
                title: 'Live Leaderboards',
                description:
                  'Real-time scoring with confidence mechanics, wager rounds, and season tracking.',
              },
            ].map((f) => (
              <div key={f.title} className="card">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-[var(--secondary-foreground)] text-sm">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-6 py-8 text-center text-sm text-[var(--muted-foreground)]">
        <p>© 2026 PubQuizParty. Built for trivia hosts who value their time.</p>
      </footer>
    </div>
  );
}
