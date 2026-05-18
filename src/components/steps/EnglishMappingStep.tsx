import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../AudioButton";
import { PrimaryButton } from "../PrimaryButton";
import {
  englishLessonLabelToDevanagari,
  toLatinDigits,
} from "@/i18n/englishInDevanagari";
import { UI } from "@/i18n/ui_hi";
import { tts } from "@/services/tts";
import { colors, radius } from "@/theme";
import type { EnglishMappingRunnable } from "@/engine/types";

interface Props {
  step: EnglishMappingRunnable;
  onNext: () => void;
}

export const EnglishMappingStep: React.FC<Props> = ({ step, onNext }) => {
  useEffect(() => {
    tts.speak(step.audio);
    return () => tts.stop();
  }, [step.uid, step.audio]);

  const englishInDv = toLatinDigits(
    englishLessonLabelToDevanagari(step.english),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.cell, styles.hindi]}>
          <Text style={styles.cellLabel}>{UI.englishMappingHeadingHi}</Text>
          <Text style={styles.hugeHi}>{toLatinDigits(step.hindi)}</Text>
          {step.wordExample ? (
            <Text style={styles.example}>
              {toLatinDigits(step.wordExample)}
            </Text>
          ) : null}
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={[styles.cell, styles.english]}>
          <Text style={styles.cellLabel}>{UI.englishMappingHeadingEn}</Text>
          <Text style={styles.hugeEn}>{englishInDv}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <AudioButton
          text={step.audio}
          iconOnly
          compact
          accessibilityLabel={UI.listenRepeat}
        />
        <PrimaryButton
          title={UI.continueNext}
          speakerText={UI.continueNext}
          onPress={onNext}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "space-around", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cell: {
    flex: 1,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
  },
  hindi: {
    backgroundColor: "#FFEDD5",
    borderColor: colors.primary,
  },
  english: {
    backgroundColor: "#DBEAFE",
    borderColor: colors.accent,
  },
  cellLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.muted,
    marginBottom: 4,
  },
  hugeHi: { fontSize: 80, fontWeight: "800", color: colors.primaryDark },
  hugeEn: {
    fontSize: 52,
    fontWeight: "800",
    color: colors.accent,
    textAlign: "center",
  },
  example: { marginTop: 4, color: colors.text, fontSize: 16 },
  arrow: { fontSize: 32, color: colors.muted },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
});
