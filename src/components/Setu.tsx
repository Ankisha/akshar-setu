import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { UI } from "@/i18n/ui_hi";
import { colors } from "@/theme";
import type { SetuReaction } from "@/engine/types";

const EMOJI: Record<SetuReaction, string> = {
  idle: "🐘",
  happy: "🐘",
  celebrate: "🎉🐘",
  encourage: "🐘",
  sad: "🐘",
};

const LABEL: Record<SetuReaction, string> = {
  idle: UI.setuIdle,
  happy: UI.setuHappy,
  celebrate: UI.setuCelebrate,
  encourage: UI.setuEncourage,
  sad: UI.setuSad,
};

interface Props {
  reaction: SetuReaction;
  size?: "sm" | "md" | "lg";
}

export const Setu: React.FC<Props> = ({ reaction, size = "md" }) => {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reaction === "happy" || reaction === "celebrate") {
      Animated.sequence([
        Animated.timing(bounce, { toValue: -12, duration: 180, useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 0, useNativeDriver: true }),
      ]).start();
    } else if (reaction === "encourage" || reaction === "sad") {
      Animated.sequence([
        Animated.timing(bounce, { toValue: 6, duration: 180, useNativeDriver: true }),
        Animated.spring(bounce, { toValue: 0, useNativeDriver: true }),
      ]).start();
    }
  }, [reaction, bounce]);

  const emojiSize = size === "lg" ? 96 : size === "sm" ? 40 : 64;

  return (
    <View style={styles.wrap}>
      <Animated.Text
        style={[
          styles.emoji,
          { fontSize: emojiSize, transform: [{ translateY: bounce }] },
        ]}
      >
        {EMOJI[reaction]}
      </Animated.Text>
      <Text style={styles.label}>{LABEL[reaction]}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  emoji: { lineHeight: 120 },
  label: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
});
