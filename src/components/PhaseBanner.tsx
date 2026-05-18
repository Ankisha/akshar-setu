import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { UI } from "@/i18n/ui_hi";
import { colors, radius } from "@/theme";
import type { Phase } from "@/engine/types";

const PHASE_LABEL: Record<Phase, string> = UI.phases as Record<Phase, string>;

const PHASE_COLOR: Record<Phase, string> = {
  revision: "#F59E0B",
  parent_prep: "#0EA5E9",
  teaching_literacy: "#EA580C",
  teaching_numeracy: "#2563EB",
  english_mapping: "#7C3AED",
  practice: "#16A34A",
  adaptive: "#DB2777",
  complete: "#059669",
};

interface Props {
  phase: Phase;
  index: number;
  total: number;
}

export const PhaseBanner: React.FC<Props> = ({ phase, index, total }) => {
  const pct = total === 0 ? 0 : Math.min(1, (index + 1) / total);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: PHASE_COLOR[phase] }]} />
        <Text style={styles.label}>{PHASE_LABEL[phase]}</Text>
        <Text style={styles.count}>
          {index + 1} / {total}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: PHASE_COLOR[phase] },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: { flexDirection: "row", alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  label: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  count: { fontSize: 13, color: colors.muted },
  track: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
  },
  fill: { height: "100%" },
});
