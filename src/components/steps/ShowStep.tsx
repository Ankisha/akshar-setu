import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../AudioButton";
import { PrimaryButton } from "../PrimaryButton";
import { UI } from "@/i18n/ui_hi";
import { toLatinDigits } from "@/i18n/englishInDevanagari";
import { tts } from "@/services/tts";
import { colors, radius, type } from "@/theme";
import type { ShowRunnable } from "@/engine/types";

interface Props {
  step: ShowRunnable;
  onNext: () => void;
}

export const ShowStep: React.FC<Props> = ({ step, onNext }) => {
  useEffect(() => {
    const a = step.audio?.trim();
    if (!a) return undefined;
    const av = (a.match(/ऽ/g) ?? []).length;
    const rate = av >= 4 ? 0.74 : undefined;
    tts.speak(a, rate !== undefined ? { rate } : {});
    return () => tts.stop();
  }, [step.uid, step.audio]);

  const avCount = ((step.audio ?? "").match(/ऽ/g) ?? []).length;
  const replayRate = avCount >= 4 ? 0.74 : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.displayBox}>
        <Text
          style={
            step.uiHint === "large_number" ? type.hugeNumber : type.hugeLetter
          }
        >
          {toLatinDigits(step.content)}
        </Text>
        {step.text ? (
          <Text style={styles.subText}>{toLatinDigits(step.text)}</Text>
        ) : null}
        {step.audio ? (
          <AudioButton
            text={step.audio}
            iconOnly
            compact
            ttsRate={replayRate}
            accessibilityLabel={UI.listenRepeat}
          />
        ) : null}
      </View>
      <PrimaryButton
        style={styles.btn}
        title={UI.continueNext}
        speakerText={UI.continueNext}
        onPress={onNext}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "space-around", paddingHorizontal: 24 },
  displayBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
    gap: 16,
  },
  subText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "600",
    textAlign: "center",
  },
  btn: { alignSelf: "stretch", width: "100%" },
});
