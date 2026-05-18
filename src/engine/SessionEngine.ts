/**
 * SessionEngine
 * -------------
 * A deterministic, UI-agnostic state machine that drives a SessionSpec to
 * completion one step at a time. It is the "step runner" at the heart of
 * Akshar Setu.
 *
 * Responsibilities:
 *  - Maintain an ordered flow of runnable steps (built from session JSON).
 *  - Track attempts, results, and skill-level weaknesses.
 *  - Advance through phases: revision, parent_prep, teaching (literacy,
 *    numeracy), english_mapping, practice, adaptive, complete.
 *  - Expose pure, synchronous commands the UI layer can call
 *    (submitTap, submitSpeech, acknowledge, retry, skip) and emit state
 *    snapshots to subscribers.
 *  - Inject adaptive questions once at the configured injection point.
 *
 * The engine holds no React/RN dependencies and can be tested in isolation.
 */

import {
  planAdaptiveItems,
  toFlowItems,
  WeaknessTracker,
} from "./adaptive";
import {
  evaluateSpeech,
  evaluateTap,
  type SpeechEvalResult,
} from "./evaluator";
import {
  buildInitialFlow,
  findAdaptiveInjectionIndex,
} from "./flow";
import type {
  FlowItem,
  Phase,
  RunnableStep,
  SessionSpec,
  SetuReaction,
  Skill,
  StepResult,
} from "./types";

export interface EngineFeedback {
  state: "correct" | "incorrect" | "info";
  audio: string;
  reaction: SetuReaction;
  exhaustedAttempts?: boolean;
  correctAnswer?: string;
}

export interface EngineState {
  sessionId: string;
  level: number;
  status: "idle" | "running" | "completed";
  index: number;
  total: number;
  current: FlowItem | null;
  phase: Phase;
  attemptsUsed: number;
  lastFeedback: EngineFeedback | null;
  reaction: SetuReaction;
  weaknesses: Record<string, number>;
  results: StepResult[];
  adaptiveInjected: boolean;
  canGoBack: boolean;
}

type Listener = (state: EngineState) => void;

export interface SubmitTapResult {
  correct: boolean;
  feedback: EngineFeedback;
  advanced: boolean;
}

export interface SubmitSpeechResult extends SubmitTapResult {
  score: number;
  bestMatch: string;
}

export class SessionEngine {
  private readonly session: SessionSpec;
  private flow: FlowItem[];
  private index = 0;
  private attemptsUsed = 0;
  private readonly results: StepResult[] = [];
  private readonly tracker = new WeaknessTracker();
  private adaptiveInjected = false;
  private lastFeedback: EngineFeedback | null = null;
  private reaction: SetuReaction = "idle";
  private status: EngineState["status"] = "idle";
  private readonly listeners = new Set<Listener>();

  constructor(session: SessionSpec, startAtIndex?: number) {
    this.session = session;
    this.flow = buildInitialFlow(session);
    if (startAtIndex !== undefined && startAtIndex > 0 && startAtIndex < this.flow.length) {
      this.index = startAtIndex;
    }
  }

  /* ------------------------------- lifecycle ------------------------------ */

  start(): void {
    this.status = "running";
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): EngineState {
    const current = this.flow[this.index] ?? null;
    return {
      sessionId: this.session.session_id,
      level: this.session.level,
      status: this.status,
      index: this.index,
      total: this.flow.length,
      current,
      phase: current?.phase ?? "complete",
      attemptsUsed: this.attemptsUsed,
      lastFeedback: this.lastFeedback,
      reaction: this.reaction,
      weaknesses: this.tracker.snapshot(),
      results: [...this.results],
      adaptiveInjected: this.adaptiveInjected,
      canGoBack: this.index > 0,
    };
  }

  /* -------------------------------- commands ------------------------------ */

  /** Acknowledge a non-interactive step (instruction, show, prep, mapping). */
  acknowledge(): void {
    const item = this.flow[this.index];
    if (!item) return;
    const { step } = item;

    switch (step.kind) {
      case "instruction":
      case "show":
      case "parent_prep":
      case "english_mapping":
        this.advance();
        return;
      case "complete":
        this.status = "completed";
        this.emit();
        return;
      default:
        return;
    }
  }

  submitTap(option: string): SubmitTapResult {
    const item = this.flow[this.index];
    if (!item || item.step.kind !== "tap") {
      throw new Error("submitTap called on non-tap step");
    }
    const step = item.step;
    this.attemptsUsed += 1;
    const correct = evaluateTap(step, option);

    if (correct) {
      return this.finishInteractive(step, correct, option);
    }

    const exhausted = this.attemptsUsed >= step.attemptsAllowed;
    if (exhausted) {
      this.tracker.recordMistake(step.skill);
      return this.finishInteractive(step, false, option, {
        correctAnswer: step.answer,
      });
    }
    return this.notYetAnswered(option);
  }

  submitSpeech(transcript: string): SubmitSpeechResult {
    const item = this.flow[this.index];
    if (!item || item.step.kind !== "speech") {
      throw new Error("submitSpeech called on non-speech step");
    }
    const step = item.step;
    this.attemptsUsed += 1;
    const evalResult: SpeechEvalResult = evaluateSpeech(step, transcript);

    if (evalResult.correct) {
      const base = this.finishInteractive(step, true, transcript);
      return { ...base, score: evalResult.score, bestMatch: evalResult.bestMatch };
    }

    const exhausted = this.attemptsUsed >= step.attemptsAllowed;
    if (exhausted) {
      this.tracker.recordMistake(step.skill);
      const base = this.finishInteractive(step, false, transcript);
      return { ...base, score: evalResult.score, bestMatch: evalResult.bestMatch };
    }
    const base = this.notYetAnswered(transcript);
    return { ...base, score: evalResult.score, bestMatch: evalResult.bestMatch };
  }

  /**
   * Fallback to tap for a speech step when STT is unavailable / failing.
   * Replaces the current speech step's evaluation path with a tap.
   * The step remains as-is in the flow; the UI can render a fallback chooser
   * whose choice is validated against `expected`.
   */
  submitSpeechFallbackTap(option: string): SubmitSpeechResult {
    const item = this.flow[this.index];
    if (!item || item.step.kind !== "speech") {
      throw new Error("submitSpeechFallbackTap called on non-speech step");
    }
    const step = item.step;
    this.attemptsUsed += 1;
    const correct = step.expected.some(
      (e) => e.toLowerCase().trim() === option.toLowerCase().trim(),
    );
    if (correct) {
      const base = this.finishInteractive(step, true, option);
      return { ...base, score: 1, bestMatch: option };
    }
    const exhausted = this.attemptsUsed >= step.attemptsAllowed;
    if (exhausted) {
      this.tracker.recordMistake(step.skill);
      const base = this.finishInteractive(step, false, option);
      return { ...base, score: 0, bestMatch: "" };
    }
    const base = this.notYetAnswered(option);
    return { ...base, score: 0, bestMatch: "" };
  }

  /** Let the parent retry the same step (no-op if attempts exhausted). */
  retry(): void {
    // Attempts counter is already advanced by submit*; UI just re-renders.
    this.lastFeedback = null;
    this.emit();
  }

  /** Skip a non-interactive step or bail on a stuck interactive one. */
  skip(): void {
    const item = this.flow[this.index];
    if (!item) return;
    if (
      item.step.kind === "tap" ||
      item.step.kind === "speech"
    ) {
      this.tracker.recordMistake(item.step.skill);
      this.recordResult(item.step, false, undefined);
    }
    this.advance();
  }

  goBack(): void {
    if (this.index <= 0) return;
    this.index -= 1;
    this.attemptsUsed = 0;
    this.lastFeedback = null;
    this.reaction = "idle";
    this.emit();
  }

  canGoBack(): boolean {
    return this.index > 0;
  }

  /* -------------------------------- internals ----------------------------- */

  private finishInteractive(
    step: RunnableStep,
    correct: boolean,
    response: string,
    extra?: { correctAnswer?: string },
  ): SubmitTapResult {
    this.recordResult(step, correct, response);
    const feedback = this.buildFeedback(correct, extra?.correctAnswer);
    this.lastFeedback = feedback;
    this.reaction = feedback.reaction;
    this.emit();
    // Defer advance so UI can show feedback; caller calls `continue()` to move on.
    return { correct, feedback, advanced: false };
  }

  private notYetAnswered(response: string): SubmitTapResult {
    const feedback = this.buildFeedback(false);
    this.lastFeedback = feedback;
    this.reaction = feedback.reaction;
    this.emit();
    return { correct: false, feedback, advanced: false };
  }

  /** Called by the UI after feedback has been shown to move to the next step. */
  continue(): void {
    const item = this.flow[this.index];
    if (!item) return;
    const step = item.step;

    if (step.kind === "tap" || step.kind === "speech") {
      const exhausted = this.attemptsUsed >= step.attemptsAllowed;
      const lastCorrect = this.lastFeedback?.state === "correct";
      if (lastCorrect || exhausted) {
        this.advance();
      } else {
        this.lastFeedback = null;
        this.reaction = "idle";
        this.emit();
      }
      return;
    }
    this.advance();
  }

  private advance(): void {
    this.attemptsUsed = 0;
    this.lastFeedback = null;
    this.reaction = "idle";

    this.maybeInjectAdaptive();

    this.index += 1;
    if (this.index >= this.flow.length) {
      this.status = "completed";
    }
    this.emit();
  }

  private maybeInjectAdaptive(): void {
    if (this.adaptiveInjected) return;
    const config = this.session.adaptive;
    if (!config || !config.enabled) return;

    const nextIndex = this.index + 1;
    const injectionIndex = findAdaptiveInjectionIndex(
      this.flow,
      config.injection_point,
    );
    if (nextIndex !== injectionIndex) return;

    const weak = this.tracker.weakSkills(config.trigger_threshold);
    if (weak.length === 0) {
      this.adaptiveInjected = true;
      return;
    }

    const steps = planAdaptiveItems(weak, this.session.modules, config);
    if (steps.length === 0) {
      this.adaptiveInjected = true;
      return;
    }
    const items = toFlowItems(steps);
    this.flow = [
      ...this.flow.slice(0, injectionIndex),
      ...items,
      ...this.flow.slice(injectionIndex),
    ];
    this.adaptiveInjected = true;
  }

  private buildFeedback(
    correct: boolean,
    correctAnswer?: string,
  ): EngineFeedback {
    const fb = this.session.feedback;
    if (correct) {
      return {
        state: "correct",
        audio: fb.correct.audio,
        reaction: fb.correct.setu_reaction,
      };
    }
    return {
      state: "incorrect",
      audio: fb.incorrect.audio,
      reaction: fb.incorrect.setu_reaction,
      exhaustedAttempts: correctAnswer !== undefined,
      correctAnswer,
    };
  }

  private recordResult(
    step: RunnableStep,
    correct: boolean,
    response: string | undefined,
  ): void {
    const skill: Skill | undefined =
      "skill" in step ? (step.skill as Skill | undefined) : undefined;
    this.results.push({
      uid: step.uid,
      phase: step.phase,
      kind: step.kind,
      skill,
      correct,
      attempts: this.attemptsUsed,
      response,
      timestampMs: Date.now(),
    });
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const l of this.listeners) l(snapshot);
  }
}
