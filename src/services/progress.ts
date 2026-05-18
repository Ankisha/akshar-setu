/**
 * Lightweight progress persistence using AsyncStorage.
 * Tracks the highest completed session and a per-session summary.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StepResult } from "@/engine/types";

const KEY_PROGRESS = "aksharsetu:progress:v1";

export interface SessionSummary {
  sessionId: string;
  level: number;
  label: string;
  completedAt: number;
  correctCount: number;
  totalInteractive: number;
  weakSkills: string[];
  reward: string;
  literacyConcept: string;
  numeracyConcept: string;
}

export interface PlacementResult {
  level: number;
  literacy_level: number;
  numeracy_level: number;
  weaknesses: string[];
  strengths: string[];
  analysis: string;
  parent_guidance: string;
  completedAt: number;
  child_age: number;
}

export interface ProgressState {
  placement: PlacementResult | null;
  highestLevelUnlocked: number;
  sessions: Record<string, SessionSummary>;
  stars: number;
}

const DEFAULT: ProgressState = {
  placement: null,
  highestLevelUnlocked: 1,
  sessions: {},
  stars: 0,
};

export const loadProgress = async (): Promise<ProgressState> => {
  try {
    const raw = await AsyncStorage.getItem(KEY_PROGRESS);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as ProgressState;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
};

export const saveProgress = async (state: ProgressState): Promise<void> => {
  await AsyncStorage.setItem(KEY_PROGRESS, JSON.stringify(state));
};

export interface SummarizeInput {
  sessionId: string;
  level: number;
  label: string;
  results: StepResult[];
  weaknesses: Record<string, number>;
  reward: string;
  literacyConcept: string;
  numeracyConcept: string;
}

export const summarize = (input: SummarizeInput): SessionSummary => {
  const interactive = input.results.filter(
    (r) => r.kind === "tap" || r.kind === "speech",
  );
  const correctCount = interactive.filter((r) => r.correct).length;
  const weakSkills = Object.entries(input.weaknesses)
    .filter(([, n]) => n >= 2)
    .map(([s]) => s);
  return {
    sessionId: input.sessionId,
    level: input.level,
    label: input.label,
    completedAt: Date.now(),
    correctCount,
    totalInteractive: interactive.length,
    weakSkills,
    reward: input.reward,
    literacyConcept: input.literacyConcept,
    numeracyConcept: input.numeracyConcept,
  };
};

export const recordCompletion = async (
  summary: SessionSummary,
): Promise<ProgressState> => {
  const current = await loadProgress();
  const next: ProgressState = {
    ...current,
    sessions: { ...current.sessions, [summary.sessionId]: summary },
    stars: current.stars + (summary.reward === "star" ? 1 : 0),
    highestLevelUnlocked: Math.max(current.highestLevelUnlocked, summary.level + 1),
  };
  await saveProgress(next);
  return next;
};

export const recordPlacement = async (
  result: Omit<PlacementResult, "completedAt">,
): Promise<ProgressState> => {
  const current = await loadProgress();
  const placement: PlacementResult = {
    ...result,
    completedAt: Date.now(),
  };
  const next: ProgressState = {
    ...current,
    placement,
    /** Placement दोबारा लेने पर पुराने अनलॉक स्तर न घटें */
    highestLevelUnlocked: Math.max(current.highestLevelUnlocked ?? 1, result.level),
  };
  await saveProgress(next);
  return next;
};

export const hasCompletedPlacement = async (): Promise<boolean> => {
  const p = await loadProgress();
  return p.placement !== null;
};

// ─── In-progress session persistence ──────────────────────────────

const KEY_IN_PROGRESS = "aksharsetu:inprogress:v1";

export interface InProgressSession {
  session: unknown;
  stepIndex: number;
  savedAt: number;
}

export const saveInProgressSession = async (
  session: unknown,
  stepIndex: number,
): Promise<void> => {
  const data: InProgressSession = { session, stepIndex, savedAt: Date.now() };
  await AsyncStorage.setItem(KEY_IN_PROGRESS, JSON.stringify(data));
};

export const loadInProgressSession = async (): Promise<InProgressSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(KEY_IN_PROGRESS);
    if (!raw) return null;
    return JSON.parse(raw) as InProgressSession;
  } catch {
    return null;
  }
};

export const clearInProgressSession = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEY_IN_PROGRESS);
};
