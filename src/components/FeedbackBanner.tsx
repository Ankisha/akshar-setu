import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "@/i18n/ui_hi";
import { formatLearningSurfaceText, toLatinDigits } from "@/i18n/englishInDevanagari";
import { colors, radius } from "@/theme";
import { tts } from "@/services/tts";
import type { EngineFeedback } from "@/engine/SessionEngine";

interface Props {
  feedback: EngineFeedback | null;
}

export const FeedbackBanner: React.FC<Props> = ({ feedback }) => {
  useEffect(() => {
    if (feedback?.audio) {
      tts.speak(feedback.audio);
    }
  }, [feedback?.audio]);

  if (!feedback) return null;

  const isGood = feedback.state === "correct";
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: isGood ? "#DCFCE7" : "#FEF3C7" },
      ]}
    >
      <Text style={styles.icon}>{isGood ? "✅" : "💪"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {isGood ? UI.feedbackCorrectTitle : UI.feedbackKeepTrying}
        </Text>
        <Text style={styles.body}>{toLatinDigits(feedback.audio)}</Text>
        {feedback.correctAnswer ? (
          <Text style={styles.hint}>
            {UI.correctAnswerWas}{" "}
            {formatLearningSurfaceText(feedback.correctAnswer)}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  icon: { fontSize: 32 },
  title: { fontWeight: "800", color: colors.text, fontSize: 16 },
  body: { color: colors.text, fontSize: 14, marginTop: 2 },
  hint: { color: colors.primaryDark, fontWeight: "700", marginTop: 4 },
});
