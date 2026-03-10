import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a random 4-character uppercase room code. */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

/** Format a duration in seconds to mm:ss. */
export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Difficulty label from integer 1-5. */
export function difficultyLabel(difficulty: number | null): string {
  if (!difficulty) return 'Unknown';
  const labels: Record<number, string> = {
    1: 'Easy',
    2: 'Medium-Easy',
    3: 'Medium',
    4: 'Hard',
    5: 'Expert',
  };
  return labels[difficulty] ?? 'Unknown';
}

/** Truncate text to a max length with ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/** Calculate points for a correct answer given confidence rank. */
export function calculatePoints(
  basePoints: number,
  confidenceRank: number | null,
  isCorrect: boolean,
  isDouble: boolean
): number {
  const multiplier = isDouble ? 2 : 1;
  if (!isCorrect) {
    if (confidenceRank) return -(basePoints * confidenceRank * multiplier);
    return 0;
  }
  if (confidenceRank) return basePoints * confidenceRank * multiplier;
  return basePoints * multiplier;
}

/** Avatar emoji options for teams. */
export const AVATAR_EMOJIS = [
  '🎯', '🧠', '🏆', '⭐', '🦊', '🐙', '🦁', '🐯',
  '🦋', '🐉', '🦄', '🎸', '🚀', '⚡', '🌟', '🎩',
];
