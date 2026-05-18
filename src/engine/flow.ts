/**
 * Flow builder: converts a SessionSpec (authoring JSON) into a flat, ordered
 * list of runnable steps that the engine advances through one at a time.
 *
 * Order follows the product spec:
 *   1. Revision
 *   2. Parent Prep
 *   3. Teaching (literacy then numeracy, or preserves modules order)
 *   4. English Mapping (from each module)
 *   5. Practice
 *   6. Adaptive  (injected at runtime, not here)
 *   7. Completion
 */

import type {
  FlowItem,
  ParentPrep,
  Phase,
  RunnableStep,
  SessionModule,
  SessionSpec,
  SpeechStepSpec,
  TapStepSpec,
  InstructionStepSpec,
  ShowStepSpec,
  ModuleStepSpec,
} from "./types";
import { englishLessonLabelToDevanagari } from "@/i18n/englishInDevanagari";

const DEFAULT_FUZZY_THRESHOLD = 0.7;
const DEFAULT_ATTEMPTS = 2;

let uidCounter = 0;
const makeUid = (phase: Phase, kind: string, hint?: string): string => {
  uidCounter += 1;
  return `${phase}:${kind}:${hint ?? ""}:${uidCounter}`;
};

export const resetUidCounterForTests = (): void => {
  uidCounter = 0;
};

const toTapRunnable = (
  spec: TapStepSpec,
  phase: Phase,
): RunnableStep => ({
  kind: "tap",
  uid: makeUid(phase, "tap", spec.id),
  sourceId: spec.id,
  phase,
  skill: spec.skill,
  attemptsAllowed: spec.attempts_allowed ?? DEFAULT_ATTEMPTS,
  question: spec.question,
  audio: spec.audio,
  options: spec.options,
  answer: spec.answer,
});

const toSpeechRunnable = (
  spec: SpeechStepSpec,
  phase: Phase,
): RunnableStep => ({
  kind: "speech",
  uid: makeUid(phase, "speech", spec.id),
  sourceId: spec.id,
  phase,
  skill: spec.skill,
  attemptsAllowed: spec.attempts_allowed ?? DEFAULT_ATTEMPTS,
  prompt: spec.prompt,
  audio: spec.audio,
  expected: spec.expected,
  evaluation: {
    type: spec.evaluation?.type ?? "fuzzy",
    threshold: spec.evaluation?.threshold ?? DEFAULT_FUZZY_THRESHOLD,
  },
});

const toInstructionRunnable = (
  spec: InstructionStepSpec,
  phase: Phase,
): RunnableStep => ({
  kind: "instruction",
  uid: makeUid(phase, "instruction", spec.id),
  sourceId: spec.id,
  phase,
  attemptsAllowed: 1,
  audio: spec.audio,
  text: spec.text,
  actor: spec.actor ?? "system",
});

const toShowRunnable = (
  spec: ShowStepSpec,
  phase: Phase,
): RunnableStep => ({
  kind: "show",
  uid: makeUid(phase, "show", spec.id),
  sourceId: spec.id,
  phase,
  attemptsAllowed: 1,
  content: spec.content,
  uiHint: spec.ui_hint ?? "large_letter",
  audio: spec.audio,
  text: spec.text,
  actor: spec.actor ?? "system",
});

const convertModuleStep = (
  step: ModuleStepSpec,
  phase: Phase,
): RunnableStep => {
  switch (step.type) {
    case "instruction":
      return toInstructionRunnable(step, phase);
    case "show":
      return toShowRunnable(step, phase);
    case "tap":
      return toTapRunnable(step, phase);
    case "speech":
      return toSpeechRunnable(step, phase);
    default: {
      const exhaustive: never = step;
      throw new Error(`Unsupported step: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const wrap = (step: RunnableStep): FlowItem => ({
  uid: step.uid,
  phase: step.phase,
  step,
});

const buildParentPrep = (prep: ParentPrep): FlowItem[] => {
  const items: FlowItem[] = [];
  const phase: Phase = "parent_prep";

  items.push(
    wrap({
      kind: "parent_prep",
      uid: makeUid(phase, "intro"),
      phase,
      attemptsAllowed: 1,
      text: prep.audio_instruction,
      audio: prep.audio_instruction,
      isIntro: true,
    }),
  );

  for (const step of prep.steps) {
    items.push(
      wrap({
        kind: "parent_prep",
        uid: makeUid(phase, "step", step.id),
        sourceId: step.id,
        phase,
        attemptsAllowed: 1,
        text: step.text,
        audio: step.audio,
      }),
    );
  }

  if (prep.demo_audio) {
    items.push(
      wrap({
        kind: "parent_prep",
        uid: makeUid(phase, "demo"),
        phase,
        attemptsAllowed: 1,
        text: prep.demo_audio,
        audio: prep.demo_audio,
        isDemo: true,
      }),
    );
  }

  return items;
};

const phaseForModule = (mod: SessionModule): Phase =>
  mod.type === "literacy" ? "teaching_literacy" : "teaching_numeracy";

const buildModuleItems = (mod: SessionModule): FlowItem[] => {
  const phase = phaseForModule(mod);
  const items: FlowItem[] = [];
  const steps = mod.steps;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const next = steps[i + 1];

    if (
      s.type === "instruction" &&
      next?.type === "show"
    ) {
      items.push(
        wrap({
          kind: "instruction",
          uid: makeUid(phase, "instruction", s.id),
          sourceId: s.id,
          phase,
          attemptsAllowed: 1,
          audio: s.audio,
          text: s.text,
          content: next.content,
          characterAudio: next.audio,
          uiHint: next.ui_hint === "large_number" ? "large_number" : "large_letter",
          actor: s.actor ?? "system",
        }),
      );
      i += 1;
      continue;
    }

    items.push(wrap(convertModuleStep(s, phase)));
  }
  return items;
};

const buildEnglishMapping = (modules: SessionModule[]): FlowItem[] => {
  const phase: Phase = "english_mapping";
  const items: FlowItem[] = [];
  for (const mod of modules) {
    if (mod.type !== "literacy") continue;
    if (!mod.english_mapping || !mod.word_example) continue;
    const enHiLabel = englishLessonLabelToDevanagari(mod.english_mapping);
    const audio = `${mod.concept} से ${mod.word_example}। ${mod.word_example} को अंग्रेज़ी में ${enHiLabel} कहते हैं`;
    items.push(
      wrap({
        kind: "english_mapping",
        uid: makeUid(phase, "map", mod.concept),
        phase,
        attemptsAllowed: 1,
        hindi: mod.word_example,
        english: mod.english_mapping,
        audio,
        wordExample: mod.concept,
      }),
    );
  }
  return items;
};

const buildPractice = (
  practice: (TapStepSpec | SpeechStepSpec)[] | undefined,
): FlowItem[] => {
  if (!practice) return [];
  const phase: Phase = "practice";
  return practice.map((p) =>
    wrap(
      p.type === "tap"
        ? toTapRunnable(p, phase)
        : toSpeechRunnable(p, phase),
    ),
  );
};

const buildRevision = (
  revision: TapStepSpec[] | undefined,
): FlowItem[] => {
  if (!revision || revision.length === 0) return [];
  const phase: Phase = "revision";
  return revision.map((r) => wrap(toTapRunnable(r, phase)));
};

const buildCompletion = (session: SessionSpec): FlowItem[] => {
  const phase: Phase = "complete";
  return [
    wrap({
      kind: "complete",
      uid: makeUid(phase, "done"),
      phase,
      attemptsAllowed: 1,
      reward: session.progress?.reward ?? "star",
    }),
  ];
};

/**
 * Build the initial, static flow. Adaptive steps are injected at runtime
 * by the engine based on tracked weaknesses.
 */
export const buildInitialFlow = (session: SessionSpec): FlowItem[] => {
  uidCounter = 0;
  const flow: FlowItem[] = [];

  flow.push(...buildRevision(session.revision));
  flow.push(...buildParentPrep(session.parent_prep));

  for (const mod of session.modules) {
    flow.push(...buildModuleItems(mod));
  }

  flow.push(...buildEnglishMapping(session.modules));
  flow.push(...buildPractice(session.practice));
  flow.push(...buildCompletion(session));

  return flow;
};

export const findAdaptiveInjectionIndex = (
  flow: FlowItem[],
  injectionPoint: "post_practice" | "post_teaching",
): number => {
  if (injectionPoint === "post_teaching") {
    const lastTeaching = [...flow]
      .reverse()
      .findIndex(
        (f) =>
          f.phase === "teaching_literacy" || f.phase === "teaching_numeracy",
      );
    if (lastTeaching === -1) return flow.length - 1;
    return flow.length - lastTeaching;
  }
  const lastPracticeRev = [...flow]
    .reverse()
    .findIndex((f) => f.phase === "practice");
  if (lastPracticeRev === -1) {
    return flow.findIndex((f) => f.phase === "complete");
  }
  return flow.length - lastPracticeRev;
};
