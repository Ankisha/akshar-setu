/**
 * API client for talking to the Akshar Setu Mac server.
 * Provides typed wrappers for placement, level determination, and session
 * generation endpoints.
 */

import {
  DETERMINE_LEVEL_URL,
  GENERATE_SESSION_URL,
  STT_HEALTH_URL,
} from "@/config";
import { abortSignalAfter } from "@/utils/abortSignal";

const BASE_URL = STT_HEALTH_URL.replace("/health", "");

export interface PlacementQuestion {
  id: string;
  type: "tap";
  question: string;
  show: string;
  options: string[];
  answer: string;
  skill: string;
  difficulty: number;
}

export interface PlacementAnswer {
  question_id: string;
  question: string;
  correct_answer: string;
  user_answer: string;
  correct: boolean;
}

export interface LevelResult {
  level: number;
  literacy_level: number;
  numeracy_level: number;
  analysis: string;
  parent_guidance: string;
  strengths: string[];
  weaknesses: string[];
}

export interface GenerateSessionParams {
  level: number;
  literacy_level: number;
  numeracy_level: number;
  child_age: number;
  weaknesses: string[];
  previous_concepts: string[];
}

export const fetchPlacementQuestions = async (): Promise<PlacementQuestion[]> => {
  const resp = await fetch(`${BASE_URL}/placement-questions`, {
    signal: abortSignalAfter(10_000),
  });
  if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
  const data = await resp.json();
  return data.questions;
};

/** Must stay above server Gemma timeouts (often 120s) so we do not AbortError early. */
const DETERMINE_LEVEL_TIMEOUT_MS = 140_000;

function numField(v: unknown, name: string): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Math.round(Number(v));
  }
  throw new Error(`determine-level: invalid ${name}`);
}

function clamp10(n: number): number {
  return Math.min(10, Math.max(1, n));
}

/** Parse /determine-level JSON (handles missing arrays / Gemini quirks). */
export function parseLevelResult(data: unknown): LevelResult {
  if (!data || typeof data !== "object") {
    throw new Error("determine-level: response is not a JSON object");
  }
  const o = data as Record<string, unknown>;

  if (typeof o.error === "string" && !("level" in o)) {
    throw new Error(`determine-level: ${o.error}`);
  }

  const strengthsRaw = o.strengths;
  const weaknessesRaw = o.weaknesses;
  const strengths = Array.isArray(strengthsRaw)
    ? strengthsRaw.map(String)
    : [];
  const weaknesses = Array.isArray(weaknessesRaw)
    ? weaknessesRaw.map(String)
    : [];

  const analysis =
    typeof o.analysis === "string"
      ? o.analysis
      : o.analysis !== undefined && o.analysis !== null
        ? String(o.analysis)
        : "";
  const parent_guidance =
    typeof o.parent_guidance === "string"
      ? o.parent_guidance
      : o.parent_guidance !== undefined && o.parent_guidance !== null
        ? String(o.parent_guidance)
        : "";

  return {
    level: clamp10(numField(o.level, "level")),
    literacy_level: clamp10(numField(o.literacy_level, "literacy_level")),
    numeracy_level: clamp10(numField(o.numeracy_level, "numeracy_level")),
    analysis,
    parent_guidance,
    strengths,
    weaknesses,
  };
}

export const determineLevel = async (
  answers: PlacementAnswer[],
  childAge: number,
): Promise<LevelResult> => {
  const resp = await fetch(DETERMINE_LEVEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, child_age: childAge }),
    signal: abortSignalAfter(DETERMINE_LEVEL_TIMEOUT_MS),
  });
  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(`determine-level HTTP ${resp.status}: ${raw.slice(0, 240)}`);
  }
  try {
    return parseLevelResult(JSON.parse(raw));
  } catch (e) {
    const preview = raw.slice(0, 280);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${msg}; preview=${preview}`);
  }
};

export const generateSession = async (
  params: GenerateSessionParams,
): Promise<Record<string, unknown>> => {
  const resp = await fetch(GENERATE_SESSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: abortSignalAfter(120_000),
  });
  const raw = await resp.text();
  if (!resp.ok) {
    throw new Error(`generate-session HTTP ${resp.status}: ${raw.slice(0, 240)}`);
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Session response was not valid JSON (${raw.length} chars): ${msg}`,
    );
  }
};
