import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../AudioButton";
import { PrimaryButton } from "../PrimaryButton";
import { UI } from "@/i18n/ui_hi";
import { formatLearningSurfaceText, toLatinDigits } from "@/i18n/englishInDevanagari";
import { tts } from "@/services/tts";
import { colors, radius } from "@/theme";
import type { InstructionRunnable } from "@/engine/types";

interface Props {
  step: InstructionRunnable;
  onNext: () => void;
}

export const InstructionStep: React.FC<Props> = ({ step, onNext }) => {
  useEffect(() => {
    const char = step.characterAudio?.trim();
    if (char) {
      tts.speak(step.audio, {
        rate: 0.9,
        onDone: () => {
          tts.speak(char, { rate: 0.74, pitch: 1 });
        },
      });
    } else {
      tts.speak(step.audio);
    }
    return () => tts.stop();
  }, [step.uid, step.audio, step.characterAudio]);

  const display = formatLearningSurfaceText(toLatinDigits(step.text ?? step.audio));

  return (
    <View style={styles.wrap}>
      {step.content ? (
        <View style={styles.displayBox}>
          <Text style={styles.bigContent}>{toLatinDigits(step.content)}</Text>
          {step.characterAudio?.trim() ? (
            <View style={styles.charSoundRow}>
              <Text style={styles.charCue}>{UI.listenShort}</Text>
              <AudioButton
                text={step.characterAudio!.trim()}
                iconOnly
                compact
                ttsRate={0.74}
                accessibilityLabel={UI.listenRepeat}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>{UI.instructionListenCue}</Text>
          <AudioButton
            text={step.audio}
            iconOnly
            compact
            accessibilityLabel={UI.listenRepeat}
          />
        </View>
        <Text style={styles.text}>{display}</Text>
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
  wrap: { flex: 1, justifyContent: "space-between", padding: 24 },
  displayBox: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFBEB",
    borderRadius: radius.lg,
    paddingVertical: 20,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: 10,
  },
  charSoundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  charCue: { fontSize: 15, fontWeight: "700", color: colors.primaryDark },
  bigContent: {
    fontSize: 100,
    fontWeight: "900",
    color: colors.primaryDark,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#E0F2FE",
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: 2,
    borderColor: "#7DD3FC",
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: { fontSize: 14, color: colors.muted },
  text: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 34,
  },
  btn: { alignSelf: "stretch", width: "100%" },
});
