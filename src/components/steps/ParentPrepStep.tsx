import React, { useMemo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../AudioButton";
import { PrimaryButton } from "../PrimaryButton";
import { UI } from "@/i18n/ui_hi";
import {
  formatLearningSurfaceText,
  toLatinDigits,
} from "@/i18n/englishInDevanagari";
import { tts } from "@/services/tts";
import { colors, radius } from "@/theme";
import type { ParentPrepRunnable } from "@/engine/types";

function spokenLine(step: ParentPrepRunnable): string {
  const raw = (step.audio && step.audio.trim()) || step.text;
  return formatLearningSurfaceText(toLatinDigits(raw));
}

interface Props {
  step: ParentPrepRunnable;
  onNext: () => void;
}

export const ParentPrepStep: React.FC<Props> = ({ step, onNext }) => {
  const line = useMemo(
    () => spokenLine(step),
    [step.uid, step.sourceId, step.audio, step.text],
  );

  useEffect(() => {
    const toPlay = line.trim();
    if (!toPlay) return;
    tts.speak(toPlay);
    return () => tts.stop();
  }, [step.uid, step.sourceId, line]);

  const title = step.isIntro
    ? UI.parentListenCareful
    : step.isDemo
      ? UI.parentDemoPhrase
      : UI.parentDoThis;

  const displayBody = formatLearningSurfaceText(toLatinDigits(step.text));

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.title}>{title}</Text>
          <AudioButton
            text={line}
            iconOnly
            compact
            accessibilityLabel={UI.listenRepeat}
          />
        </View>
        <Text style={styles.text}>{displayBody}</Text>
      </View>
      <PrimaryButton
        style={styles.acknowledgeBtn}
        title={UI.understoodTick}
        speakerText={UI.understoodTick}
        onPress={onNext}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "space-between", padding: 24 },
  card: {
    backgroundColor: "#E0F2FE",
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 2,
    borderColor: "#7DD3FC",
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#0369A1",
    fontWeight: "800",
  },
  text: { fontSize: 22, fontWeight: "700", color: colors.text, lineHeight: 30 },
  acknowledgeBtn: { alignSelf: "stretch", width: "100%" },
});
