import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { UI } from "@/i18n/ui_hi";
import { colors, radius } from "@/theme";
import { tts } from "@/services/tts";

interface Props {
  text: string;
  label?: string;
  compact?: boolean;
  /** Only show 🔊; still speaks full `text` */
  iconOnly?: boolean;
  accessibilityLabel?: string;
  /** Optional TTS rate (0.25–4); default server/device default */
  ttsRate?: number;
}

export const AudioButton: React.FC<Props> = ({
  text,
  label,
  compact,
  iconOnly,
  accessibilityLabel,
  ttsRate,
}) => {
  return (
    <Pressable
      onPress={() =>
        tts.speak(text, ttsRate !== undefined ? { rate: ttsRate } : {})
      }
      style={({ pressed }) => [
        styles.btn,
        compact && styles.compact,
        iconOnly && styles.iconOnlyBtn,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? UI.accessibilityPlayAudio}
    >
      <Text style={[styles.icon, iconOnly && styles.iconStandalone]}>🔊</Text>
      {!iconOnly && label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignSelf: "flex-start",
  },
  compact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  iconOnlyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
  icon: { fontSize: 20, color: "#fff", marginRight: 6 },
  iconStandalone: { marginRight: 0 },
  label: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
