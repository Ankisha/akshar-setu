import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { UI } from "@/i18n/ui_hi";
import { colors, radius } from "@/theme";
import { tts } from "@/services/tts";

interface Props {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "success" | "danger";
  disabled?: boolean;
  style?: ViewStyle;
  /** Left 🔊 speaks this; main area still runs `onPress`. Speaker stays enabled when `disabled` (e.g. loading). */
  speakerText?: string;
  speakerDisabled?: boolean;
}

export const PrimaryButton: React.FC<Props> = ({
  title,
  onPress,
  variant = "primary",
  disabled,
  style,
  speakerText,
  speakerDisabled = false,
}) => {
  if (!speakerText) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.btn,
          variant === "ghost" && styles.ghost,
          variant === "success" && styles.success,
          variant === "danger" && styles.danger,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
      >
        <Text
          style={[
            styles.title,
            variant === "ghost" && styles.ghostTitle,
          ]}
        >
          {title}
        </Text>
      </Pressable>
    );
  }

  const isGhost = variant === "ghost";

  return (
    <View
      style={[
        styles.comboOuter,
        variant === "primary" && styles.comboPrimary,
        variant === "success" && styles.success,
        variant === "danger" && styles.danger,
        isGhost && styles.ghostCombo,
        style,
      ]}
    >
      <Pressable
        disabled={speakerDisabled}
        onPress={() => tts.speak(speakerText)}
        style={({ pressed }) => [
          styles.speakerSlot,
          isGhost && styles.speakerSlotGhost,
          pressed && !speakerDisabled && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${UI.accessibilityPlayAudio}: ${speakerText}`}
      >
        <Text style={[styles.speakerIcon, isGhost && styles.speakerIconGhost]}>
          🔊
        </Text>
      </Pressable>
      <View
        style={[
          styles.comboDivider,
          isGhost && styles.comboDividerGhost,
        ]}
      />
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.titleSlot,
          pressed && !disabled && styles.pressed,
          disabled && styles.titleSlotDisabled,
        ]}
      >
        <Text
          style={[
            styles.title,
            isGhost && styles.ghostTitle,
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  success: { backgroundColor: colors.success },
  danger: { backgroundColor: colors.danger },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  title: { color: "#fff", fontWeight: "700", fontSize: 16 },
  ghostTitle: { color: colors.primary },

  comboOuter: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.md,
    overflow: "hidden",
    minHeight: 48,
  },
  comboPrimary: { backgroundColor: colors.primary },
  ghostCombo: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  speakerSlot: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  speakerSlotGhost: {
    backgroundColor: "rgba(234,88,12,0.08)",
  },
  speakerIcon: { fontSize: 20 },
  speakerIconGhost: { fontSize: 20 },
  comboDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  comboDividerGhost: {
    backgroundColor: "rgba(234,88,12,0.35)",
    width: 2,
  },
  titleSlot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  titleSlotDisabled: { opacity: 0.45 },
});
