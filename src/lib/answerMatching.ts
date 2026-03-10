// Fuzzy string matching utility for answer checking
// Returns similarity score between 0-1

export function similarityScore(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Remove common articles and punctuation
  const clean = (s: string) => s
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[.,!?;:'"]/g, '')
    .trim();
  
  const c1 = clean(s1);
  const c2 = clean(s2);
  
  if (c1 === c2) return 0.95;
  
  // Levenshtein distance
  const distance = levenshteinDistance(c1, c2);
  const maxLen = Math.max(c1.length, c2.length);
  const similarity = 1 - (distance / maxLen);
  
  return similarity;
}

export function isAnswerClose(userAnswer: string, correctAnswer: string, threshold = 0.85): boolean {
  return similarityScore(userAnswer, correctAnswer) >= threshold;
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}
