/**
 * Evaluators for child responses.
 *
 * - Tap: exact option match.
 * - Speech:
 *   - "fuzzy" — normalized Levenshtein similarity against any expected string.
 *   - "exact_or_keyword" — full match or substring match.
 *   - "phonetic" — lenient phonetic matching for elongated character
 *     pronunciation (e.g. child says "kaaaa" for "क"). Strips repetitions,
 *     elongation markers, and compares core consonant/vowel.
 */

import type { SpeechRunnable, TapRunnable } from "./types";

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[।.,!?;:"'`]/g, "")
    .replace(/\s+/g, " ");

/**
 * Strip elongation: remove repeated vowels, ऽ (virama lengthener),
 * repeated 'a' chars, and trailing matra sounds the STT may produce.
 */
const stripElongation = (s: string): string =>
  s
    .replace(/ऽ+/g, "")
    .replace(/a{2,}/gi, "a")
    .replace(/(.)\1{2,}/g, "$1$1")
    .trim();

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
};

export const similarity = (a: string, b: string): number => {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
};

export const evaluateTap = (
  step: TapRunnable,
  selected: string,
): boolean => normalize(step.answer) === normalize(selected);

export interface SpeechEvalResult {
  correct: boolean;
  bestMatch: string;
  score: number;
}

export const evaluateSpeech = (
  step: SpeechRunnable,
  transcript: string,
): SpeechEvalResult => {
  const normTranscript = normalize(transcript);
  let bestMatch = "";
  let score = 0;

  if (step.evaluation.type === "phonetic") {
    const stripped = stripElongation(normTranscript);
    for (const expected of step.expected) {
      const normExpected = normalize(expected);
      const strippedExpected = stripElongation(normExpected);
      if (!normExpected) continue;
      if (stripped === strippedExpected || normTranscript === normExpected) {
        return { correct: true, bestMatch: expected, score: 1 };
      }
      if (
        stripped.includes(strippedExpected) ||
        strippedExpected.includes(stripped)
      ) {
        return { correct: true, bestMatch: expected, score: 0.9 };
      }
      const sim = Math.max(
        similarity(stripped, strippedExpected),
        similarity(normTranscript, normExpected),
      );
      if (sim > score) {
        score = sim;
        bestMatch = expected;
      }
    }
    return {
      correct: score >= (step.evaluation.threshold ?? 0.55),
      bestMatch,
      score,
    };
  }

  if (step.evaluation.type === "exact_or_keyword") {
    for (const expected of step.expected) {
      const normExpected = normalize(expected);
      if (!normExpected) continue;
      if (normTranscript === normExpected) {
        return { correct: true, bestMatch: expected, score: 1 };
      }
      if (
        normTranscript.includes(normExpected) ||
        normExpected.includes(normTranscript)
      ) {
        return { correct: true, bestMatch: expected, score: 0.9 };
      }
      const sim = similarity(transcript, expected);
      if (sim > score) {
        score = sim;
        bestMatch = expected;
      }
    }
    return { correct: false, bestMatch, score };
  }

  for (const expected of step.expected) {
    const sim = similarity(transcript, expected);
    if (sim > score) {
      score = sim;
      bestMatch = expected;
    }
  }
  return {
    correct: score >= step.evaluation.threshold,
    bestMatch,
    score,
  };
};
