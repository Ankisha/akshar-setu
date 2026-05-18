import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../AudioButton";
import { PrimaryButton } from "../PrimaryButton";
import { formatLearningSurfaceText, toLatinDigits } from "@/i18n/englishInDevanagari";
import { UI } from "@/i18n/ui_hi";
import { tts } from "@/services/tts";
import { colors, radius } from "@/theme";
import type { EngineFeedback } from "@/engine/SessionEngine";
import type { TapRunnable } from "@/engine/types";

interface Props {
  step: TapRunnable;
  attemptsUsed: number;
  feedback: EngineFeedback | null;
  onSubmit: (option: string) => void;
  onContinue: () => void;
}

export const TapStep: React.FC<Props> = ({
  step,
  attemptsUsed,
  feedback,
  onSubmit,
  onContinue,
}) => {
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    tts.speak(step.audio, {
      rate:
        step.skill === "letter_recognition" ? 0.82 : undefined,
    });
    setPicked(null);
    return () => tts.stop();
  }, [step.uid, step.audio, step.skill]);

  const locked = feedback?.state === "correct" || feedback?.exhaustedAttempts;
  const attemptsLeft = Math.max(0, step.attemptsAllowed - attemptsUsed);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.question}>
          {formatLearningSurfaceText(toLatinDigits(step.question))}
        </Text>
        <AudioButton
          text={step.audio}
          iconOnly
          compact
          ttsRate={step.skill === "letter_recognition" ? 0.82 : undefined}
          accessibilityLabel={UI.listenShort}
        />
      </View>

      <View style={styles.options}>
        {step.options.map((opt, optIdx) => {
          const isPicked = picked === opt;
          const isAnswer = feedback?.exhaustedAttempts && opt === step.answer;
          const wasWrong =
            feedback?.state === "incorrect" && isPicked && !isAnswer;
          const wasRight =
            feedback?.state === "correct" && isPicked;
          return (
            <Pressable
              key={`${step.uid}-${optIdx}-${String(opt)}`}
              onPress={() => {
                if (locked) return;
                setPicked(opt);
                onSubmit(opt);
              }}
              style={({ pressed }) => [
                styles.option,
                isPicked && styles.picked,
                wasRight && styles.right,
                wasWrong && styles.wrong,
                isAnswer && styles.right,
                pressed && !locked && styles.pressed,
              ]}
            >
              <Text style={styles.optionText}>
                {formatLearningSurfaceText(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        {!locked ? (
          <Text style={styles.attempts}>{UI.triesLeft(attemptsLeft)}</Text>
        ) : (
          <PrimaryButton title={UI.continueNext} onPress={onContinue} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingVertical: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  question: { flex: 1, fontSize: 22, fontWeight: "700", color: colors.text },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  option: {
    minWidth: 96,
    minHeight: 96,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.tapBg,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { fontSize: 44, fontWeight: "800", color: colors.text },
  picked: { borderColor: colors.tapActive },
  right: { backgroundColor: "#DCFCE7", borderColor: colors.success },
  wrong: { backgroundColor: "#FEE2E2", borderColor: colors.danger },
  pressed: { opacity: 0.85 },
  footer: { marginTop: 24, alignItems: "center" },
  attempts: { color: colors.muted, fontSize: 14 },
});
