/**
 * Adaptive tracking and (stubbed) generator.
 *
 * The engine reports mistakes to the tracker. When a skill crosses the
 * configured threshold, the generator produces extra practice items to be
 * injected into the flow at the session's injection point.
 *
 * NOTE: In the real product these questions would come from Gemma at
 * runtime. For the MVP we provide a deterministic template-based stub so
 * the flow is exercised end-to-end; swap `generateAdaptiveForSkill` with
 * an async LLM call when ready.
 */

import type {
  AdaptiveConfig,
  FlowItem,
  RunnableStep,
  SessionModule,
  Skill,
  TapRunnable,
} from "./types";

export class WeaknessTracker {
  private readonly mistakes = new Map<Skill, number>();

  recordMistake(skill?: Skill): void {
    if (!skill) return;
    this.mistakes.set(skill, (this.mistakes.get(skill) ?? 0) + 1);
  }

  count(skill: Skill): number {
    return this.mistakes.get(skill) ?? 0;
  }

  weakSkills(threshold: number): Skill[] {
    const weak: Skill[] = [];
    for (const [skill, count] of this.mistakes.entries()) {
      if (count >= threshold) weak.push(skill);
    }
    return weak;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.mistakes.entries());
  }

  reset(): void {
    this.mistakes.clear();
  }
}

let adaptiveUid = 0;
const nextUid = (): string => {
  adaptiveUid += 1;
  return `adaptive:gen:${adaptiveUid}`;
};

const pickConcepts = (
  modules: SessionModule[],
  skill: Skill,
): { primary: string; distractors: string[] } => {
  const isNumber = (s: string): boolean => /^\d+$/.test(s);

  if (
    skill === "number_recognition" ||
    skill === "counting" ||
    skill === "basic_operations"
  ) {
    const num = modules.find((m) => m.type === "numeracy");
    const primary = num?.concept ?? "1";
    const n = parseInt(primary, 10);
    const distractors = [n + 1, n + 2].map((x) => String(x));
    return { primary, distractors };
  }

  const lit = modules.find((m) => m.type === "literacy");
  const primary = lit?.concept ?? "क";
  // Cheap distractor set: neighbours in Devanagari block.
  const base = primary.charCodeAt(0);
  const distractors = [
    String.fromCharCode(base + 1),
    String.fromCharCode(base + 2),
  ].filter((c) => c !== primary && !isNumber(c));
  return { primary, distractors };
};

const buildAdaptiveTap = (
  skill: Skill,
  primary: string,
  distractors: string[],
): TapRunnable => {
  const options = shuffle([primary, ...distractors]);
  const question =
    skill === "sound_pronunciation" || skill === "letter_recognition"
      ? `Kaun sa '${primary}' hai?`
      : `Kitne hain? (${primary})`;
  return {
    kind: "tap",
    uid: nextUid(),
    phase: "adaptive",
    skill,
    attemptsAllowed: 2,
    question,
    audio: question,
    options,
    answer: primary,
  };
};

const shuffle = <T>(arr: T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Generate adaptive runnable steps for a weak skill.
 * Replace this with an async LLM call (Gemma) in production.
 */
export const generateAdaptiveForSkill = (
  skill: Skill,
  modules: SessionModule[],
  count: number,
): RunnableStep[] => {
  const { primary, distractors } = pickConcepts(modules, skill);
  const out: RunnableStep[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(buildAdaptiveTap(skill, primary, distractors));
  }
  return out;
};

export const toFlowItems = (steps: RunnableStep[]): FlowItem[] =>
  steps.map((step) => ({ uid: step.uid, phase: step.phase, step }));

/**
 * Returns the total number of adaptive items to inject across all weak
 * skills, capped by `max_questions`. Distribution is round-robin per skill.
 */
export const planAdaptiveItems = (
  weakSkills: Skill[],
  modules: SessionModule[],
  config: AdaptiveConfig,
): RunnableStep[] => {
  if (!config.enabled || weakSkills.length === 0) return [];
  const cap = Math.max(0, config.max_questions);
  if (cap === 0) return [];

  const perSkill = Math.max(1, Math.floor(cap / weakSkills.length));
  let generated: RunnableStep[] = [];
  for (const skill of weakSkills) {
    generated = generated.concat(
      generateAdaptiveForSkill(skill, modules, perSkill),
    );
  }

  let remaining = cap - generated.length;
  let idx = 0;
  while (remaining > 0 && weakSkills.length > 0) {
    const skill = weakSkills[idx % weakSkills.length];
    generated = generated.concat(
      generateAdaptiveForSkill(skill, modules, 1),
    );
    remaining -= 1;
    idx += 1;
  }

  return generated.slice(0, cap);
};
