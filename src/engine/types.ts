/**
 * Type definitions for Akshar Setu sessions, aligned with the authored JSON
 * schema, plus the normalized types the step runner consumes internally.
 */

export type Skill =
  | "letter_recognition"
  | "sound_pronunciation"
  | "word_mapping"
  | "number_recognition"
  | "counting"
  | "basic_operations";

export type Actor = "system" | "parent" | "child";

export type Phase =
  | "revision"
  | "parent_prep"
  | "teaching_literacy"
  | "teaching_numeracy"
  | "english_mapping"
  | "practice"
  | "adaptive"
  | "complete";

export interface TapStepSpec {
  id: string;
  type: "tap";
  question: string;
  audio: string;
  options: string[];
  answer: string;
  skill?: Skill;
  attempts_allowed?: number;
}

export interface SpeechStepSpec {
  id: string;
  type: "speech";
  prompt: string;
  audio: string;
  expected: string[];
  evaluation?: {
    type: "fuzzy" | "exact_or_keyword" | "phonetic";
    threshold?: number;
  };
  skill?: Skill;
  attempts_allowed?: number;
  actor?: Actor;
}

export interface InstructionStepSpec {
  id: string;
  type: "instruction";
  audio: string;
  text?: string;
  actor?: Actor;
}

export interface ShowStepSpec {
  id: string;
  type: "show";
  content: string;
  ui_hint?: "large_letter" | "large_number" | "image";
  audio?: string;
  text?: string;
  actor?: Actor;
}

export type ModuleStepSpec =
  | InstructionStepSpec
  | ShowStepSpec
  | TapStepSpec
  | SpeechStepSpec;

export interface LiteracyModule {
  type: "literacy";
  concept: string;
  word_example?: string;
  english_mapping?: string;
  steps: ModuleStepSpec[];
}

export interface NumeracyModule {
  type: "numeracy";
  concept: string;
  visual_count?: string;
  english_mapping?: string;
  steps: ModuleStepSpec[];
}

export type SessionModule = LiteracyModule | NumeracyModule;

export interface ParentPrepStepSpec {
  id: string;
  text: string;
  audio: string;
}

export interface ParentPrep {
  audio_instruction: string;
  steps: ParentPrepStepSpec[];
  demo_audio?: string;
}

export interface SessionFeedback {
  correct: { audio: string; setu_reaction: "happy" | "celebrate" };
  incorrect: { audio: string; setu_reaction: "encourage" | "sad" };
}

export interface AdaptiveConfig {
  enabled: boolean;
  trigger_threshold: number;
  max_questions: number;
  injection_point: "post_practice" | "post_teaching";
}

export interface SessionSpec {
  session_id: string;
  level: number;
  session_state?: {
    current_step_index: number;
    completed: boolean;
  };
  meta?: {
    estimated_duration_minutes?: number;
    skills_covered?: Skill[];
  };
  revision?: TapStepSpec[];
  parent_prep: ParentPrep;
  modules: SessionModule[];
  practice?: (TapStepSpec | SpeechStepSpec)[];
  adaptive?: AdaptiveConfig;
  feedback: SessionFeedback;
  progress?: {
    reward: "star" | string;
    unlock_next_session: boolean;
  };
}

/**
 * ------------ Normalized (internal) runnable step types ------------
 *
 * The flow builder flattens a SessionSpec into a linear list of FlowItems.
 * Each FlowItem has a phase and one RunnableStep. The engine only ever
 * operates on FlowItems, never on the raw JSON.
 */

export interface BaseRunnable {
  uid: string; // unique within the flow
  sourceId?: string; // original id from JSON (may repeat across phases)
  phase: Phase;
  skill?: Skill;
  attemptsAllowed: number;
}

export interface InstructionRunnable extends BaseRunnable {
  kind: "instruction";
  audio: string;
  text?: string;
  content?: string;
  uiHint?: "large_letter" | "large_number";
  /** Sound for the displayed glyph (instruction auto-plays audio first, then this). */
  characterAudio?: string;
  actor: Actor;
}

export interface ShowRunnable extends BaseRunnable {
  kind: "show";
  content: string;
  uiHint: "large_letter" | "large_number" | "image";
  audio?: string;
  text?: string;
  actor: Actor;
}

export interface TapRunnable extends BaseRunnable {
  kind: "tap";
  question: string;
  audio: string;
  options: string[];
  answer: string;
}

export interface SpeechRunnable extends BaseRunnable {
  kind: "speech";
  prompt: string;
  audio: string;
  expected: string[];
  evaluation: { type: "fuzzy" | "exact_or_keyword" | "phonetic"; threshold: number };
}

export interface ParentPrepRunnable extends BaseRunnable {
  kind: "parent_prep";
  text: string;
  audio: string;
  isIntro?: boolean;
  isDemo?: boolean;
}

export interface EnglishMappingRunnable extends BaseRunnable {
  kind: "english_mapping";
  hindi: string;
  english: string;
  audio: string;
  wordExample?: string;
}

export interface CompleteRunnable extends BaseRunnable {
  kind: "complete";
  reward: string;
}

export type RunnableStep =
  | InstructionRunnable
  | ShowRunnable
  | TapRunnable
  | SpeechRunnable
  | ParentPrepRunnable
  | EnglishMappingRunnable
  | CompleteRunnable;

export interface FlowItem {
  uid: string;
  phase: Phase;
  step: RunnableStep;
}

/** Result of evaluating a single interactive step. */
export interface StepResult {
  uid: string;
  phase: Phase;
  kind: RunnableStep["kind"];
  skill?: Skill;
  correct: boolean;
  attempts: number;
  response?: string;
  timestampMs: number;
}

/** Reaction set that the Setu character can display. */
export type SetuReaction = "idle" | "happy" | "celebrate" | "encourage" | "sad";
