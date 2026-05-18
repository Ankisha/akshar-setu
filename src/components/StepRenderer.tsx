import React from "react";
import { InstructionStep } from "./steps/InstructionStep";
import { ShowStep } from "./steps/ShowStep";
import { TapStep } from "./steps/TapStep";
import { SpeechStep } from "./steps/SpeechStep";
import { ParentPrepStep } from "./steps/ParentPrepStep";
import { EnglishMappingStep } from "./steps/EnglishMappingStep";
import { CompleteStep } from "./steps/CompleteStep";
import type { EngineFeedback, EngineState } from "@/engine/SessionEngine";

interface Props {
  state: EngineState;
  onAcknowledge: () => void;
  onSubmitTap: (option: string) => void;
  onSubmitSpeech: (transcript: string) => void;
  onSubmitSpeechFallbackTap: (option: string) => void;
  onContinue: () => void;
  onDone: () => void;
  feedback: EngineFeedback | null;
}

export const StepRenderer: React.FC<Props> = ({
  state,
  onAcknowledge,
  onSubmitTap,
  onSubmitSpeech,
  onSubmitSpeechFallbackTap,
  onContinue,
  onDone,
  feedback,
}) => {
  const item = state.current;
  if (!item) return null;
  const step = item.step;

  switch (step.kind) {
    case "instruction":
      return <InstructionStep step={step} onNext={onAcknowledge} />;
    case "show":
      return <ShowStep step={step} onNext={onAcknowledge} />;
    case "parent_prep":
      return <ParentPrepStep step={step} onNext={onAcknowledge} />;
    case "english_mapping":
      return <EnglishMappingStep step={step} onNext={onAcknowledge} />;
    case "tap":
      return (
        <TapStep
          step={step}
          attemptsUsed={state.attemptsUsed}
          feedback={feedback}
          onSubmit={onSubmitTap}
          onContinue={onContinue}
        />
      );
    case "speech":
      return (
        <SpeechStep
          step={step}
          attemptsUsed={state.attemptsUsed}
          feedback={feedback}
          onSubmitSpeech={onSubmitSpeech}
          onSubmitFallbackTap={onSubmitSpeechFallbackTap}
          onContinue={onContinue}
        />
      );
    case "complete": {
      const interactive = state.results.filter(
        (r) => r.kind === "tap" || r.kind === "speech",
      );
      const correct = interactive.filter((r) => r.correct).length;
      return (
        <CompleteStep
          step={step}
          correct={correct}
          total={interactive.length}
          onDone={onDone}
        />
      );
    }
    default: {
      const exhaustive: never = step;
      return null;
    }
  }
};
