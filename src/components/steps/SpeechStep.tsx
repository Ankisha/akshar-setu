import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AudioButton } from "../AudioButton";
import { PrimaryButton } from "../PrimaryButton";
import { formatLearningSurfaceText, toLatinDigits } from "@/i18n/englishInDevanagari";
import { UI } from "@/i18n/ui_hi";
import { tts } from "@/services/tts";
import { defaultSTT } from "@/services/stt";
import { colors, radius } from "@/theme";
import type { EngineFeedback } from "@/engine/SessionEngine";
import type { SpeechRunnable } from "@/engine/types";

interface Props {
  step: SpeechRunnable;
  attemptsUsed: number;
  feedback: EngineFeedback | null;
  onSubmitSpeech: (transcript: string) => void;
  onSubmitFallbackTap: (option: string) => void;
  onContinue: () => void;
}

export const SpeechStep: React.FC<Props> = ({
  step,
  attemptsUsed,
  feedback,
  onSubmitSpeech,
  onSubmitFallbackTap,
  onContinue,
}) => {
  const [listening, setListening] = useState(false);
  const [useTapFallback, setUseTapFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tts.speak(step.audio, {
      rate:
        step.skill === "sound_pronunciation"
          ? 0.74
          : undefined,
    });
    setUseTapFallback(false);
    setError(null);
    return () => tts.stop();
  }, [step.uid, step.audio, step.skill]);

  const locked = feedback?.state === "correct" || feedback?.exhaustedAttempts;
  const attemptsLeft = Math.max(0, step.attemptsAllowed - attemptsUsed);

  const handleStartListening = async () => {
    if (listening) return;
    setError(null);
    setListening(true);
    try {
      await defaultSTT.start("hi-IN");
    } catch {
      setListening(false);
      setError(UI.micNo);
      setUseTapFallback(true);
    }
  };

  const handleStopListening = async () => {
    if (!listening) return;
    try {
      const { transcript } = await defaultSTT.stop();
      setListening(false);
      if (!transcript) {
        setError(UI.heardNothing);
        return;
      }
      onSubmitSpeech(transcript);
    } catch {
      setListening(false);
      setError(UI.serverDown);
      setUseTapFallback(true);
    }
  };

  const handleCancel = async () => {
    try {
      await defaultSTT.cancel();
    } catch {
      // Ignore
    }
    setListening(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.prompt}>
          {formatLearningSurfaceText(toLatinDigits(step.prompt))}
        </Text>
        <AudioButton
          text={step.audio}
          iconOnly
          compact
          ttsRate={step.skill === "sound_pronunciation" ? 0.74 : undefined}
          accessibilityLabel={UI.listenShort}
        />
      </View>

      {!useTapFallback ? (
        <View style={styles.micArea}>
          {!listening ? (
            <Pressable
              onPress={handleStartListening}
              disabled={locked}
              style={({ pressed }) => [
                styles.micBtn,
                pressed && !locked && styles.pressed,
                locked && styles.disabled,
              ]}
            >
              <Text style={styles.micIcon}>🎤</Text>
              <Text style={styles.micLabel}>{UI.speechPressMic}</Text>
            </Pressable>
          ) : (
            <View style={styles.listeningRow}>
              <Pressable
                onPress={handleStopListening}
                style={[styles.micBtn, styles.micListening]}
              >
                <Text style={styles.micIcon}>⏹️</Text>
                <Text style={styles.micLabel}>{UI.speechTapWhenDone}</Text>
              </Pressable>
              <Pressable onPress={handleCancel} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>{UI.cancel}</Text>
              </Pressable>
            </View>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!locked ? (
            <Pressable onPress={() => setUseTapFallback(true)}>
              <Text style={styles.fallback}>{UI.speechPreferTap}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.options}>
          {step.expected.map((opt, optIdx) => (
            <Pressable
              key={`${step.uid}-${optIdx}-${String(opt)}`}
              onPress={() => !locked && onSubmitFallbackTap(opt)}
              style={({ pressed }) => [
                styles.option,
                pressed && !locked && styles.pressed,
              ]}
            >
              <Text style={styles.optionText}>
                {formatLearningSurfaceText(opt)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

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
  prompt: { flex: 1, fontSize: 22, fontWeight: "700", color: colors.text },
  micArea: { alignItems: "center", gap: 16 },
  micBtn: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  micListening: { backgroundColor: colors.danger },
  micIcon: { fontSize: 64 },
  micLabel: {
    color: "#fff",
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  listeningRow: { alignItems: "center", gap: 12 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  cancelText: { color: colors.text, fontWeight: "600" },
  fallback: { color: colors.accent, textDecorationLine: "underline" },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  options: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  option: {
    minWidth: 120,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.tapBg,
    borderWidth: 3,
    borderColor: colors.border,
  },
  optionText: { fontSize: 32, fontWeight: "800", textAlign: "center" },
  footer: { marginTop: 24, alignItems: "center" },
  attempts: { color: colors.muted, fontSize: 14 },
});
