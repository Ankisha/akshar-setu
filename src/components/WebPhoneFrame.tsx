import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { colors } from "@/theme";

const PHONE_WIDTH = 390;

export const WebPhoneFrame: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <View style={styles.desktop}>
      <View style={styles.phone}>
        <View style={styles.phoneInner}>{children}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  desktop: {
    flex: 1,
    width: "100%",
    // @ts-expect-error web-only CSS value
    minHeight: "100vh",
    backgroundColor: "#0f172a",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  phone: {
    width: "100%",
    maxWidth: PHONE_WIDTH,
    flex: 1,
    // @ts-expect-error web-only CSS value
    maxHeight: "min(100vh, 844px)",
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: colors.bg,
    borderWidth: 3,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  phoneInner: {
    flex: 1,
    width: "100%",
  },
});
