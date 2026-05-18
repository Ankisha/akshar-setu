import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../PrimaryButton";
import { rewardDisplay, UI } from "@/i18n/ui_hi";
import { tts } from "@/services/tts";
import { colors } from "@/theme";
import type { CompleteRunnable } from "@/engine/types";

interface Props {
  step: CompleteRunnable;
  correct: number;
  total: number;
  onDone: () => void;
}

export const CompleteStep: React.FC<Props> = ({
  step,
  correct,
  total,
  onDone,
}) => {
  useEffect(() => {
    tts.speak(UI.sessionCompleteSpeak);
    return () => tts.stop();
  }, [step.uid]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.star}>⭐</Text>
      <Text style={styles.title}>{UI.completeTitle}</Text>
      <Text style={styles.subtitle}>{UI.completeSubtitle}</Text>
      <Text style={styles.score}>
        {correct} / {total} {UI.correctCount}
      </Text>
      <Text style={styles.reward}>
        {UI.rewardPrefix} {rewardDisplay(step.reward)}
      </Text>
      <PrimaryButton title={UI.goHome} onPress={onDone} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  star: { fontSize: 120 },
  title: { fontSize: 32, fontWeight: "800", color: colors.primaryDark },
  subtitle: { fontSize: 18, color: colors.text },
  score: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.success,
    marginTop: 8,
  },
  reward: { fontSize: 16, color: colors.muted, marginBottom: 20 },
});
