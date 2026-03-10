import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'PubQuizParty — AI-Powered Trivia Hosting',
  description:
    'Create and run live trivia games in under 60 seconds. AI-powered round generation, real-time gameplay, and seamless player join.',
  keywords: ['trivia', 'pub quiz', 'quiz hosting', 'live game', 'team trivia'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1a24',
              color: '#f0f0f5',
              border: '1px solid #2d2d3d',
            },
            success: {
              iconTheme: { primary: '#22c55e', secondary: '#1a1a24' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#1a1a24' },
            },
          }}
        />
      </body>
    </html>
  );
}
