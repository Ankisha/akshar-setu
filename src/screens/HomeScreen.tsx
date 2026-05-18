import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Setu } from "@/components/Setu";
import { formatLearningSurfaceText } from "@/i18n/englishInDevanagari";
import { rewardDisplay, skillUiLabel, UI } from "@/i18n/ui_hi";
import {
  loadProgress,
  type PlacementResult,
  type ProgressState,
  type SessionSummary,
} from "@/services/progress";
import { colors, radius } from "@/theme";

interface Props {
  placement: PlacementResult | null;
  hasInProgress?: boolean;
  onStartSession: () => Promise<void>;
  onResumeSession?: () => Promise<void>;
  /** स्तर-जाँच स्क्रीन खोलें (पहली बार या फिर से) */
  onRetakePlacement: () => void;
}

export const HomeScreen: React.FC<Props> = ({
  placement,
  hasInProgress,
  onStartSession,
  onResumeSession,
  onRetakePlacement,
}) => {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    loadProgress().then(setProgress);
  }, [placement]);

  const completedSessions: SessionSummary[] = progress
    ? Object.values(progress.sessions).sort(
        (a, b) => b.completedAt - a.completedAt,
      )
    : [];

  const handleStart = async () => {
    setSessionError(null);
    setLoading(true);
    try {
      await onStartSession();
    } catch (err) {
      if (__DEV__) {
        console.warn("[Home] Naya lesson failed:", err);
      }
      setSessionError(UI.lessonLoadFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (!onResumeSession) return;
    setSessionError(null);
    setLoading(true);
    try {
      await onResumeSession();
    } catch (err) {
      if (__DEV__) {
        console.warn("[Home] Resume lesson failed:", err);
      }
      setSessionError(UI.lessonLoadFailed);
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>{UI.homeBrand}</Text>
        <Text style={styles.tag}>{UI.homeTag}</Text>
      </View>
      {progress ? (
        <Text style={styles.stat}>
          ⭐ {progress.stars} {UI.starLabel}
        </Text>
      ) : null}
    </View>
  );

  if (!placement) {
    return (
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {header}
          <View style={styles.placementPromptCard}>
            <Setu reaction="happy" size="md" />
            <Text style={styles.placementPromptTitle}>
              {UI.homeNoLevelTitle}
            </Text>
            <Text style={styles.placementPromptSubtitle}>
              {UI.homeNoLevelSubtitle}
            </Text>
            <PrimaryButton
              style={styles.fullWidthBtn}
              title={UI.homeTakePlacementTest}
              speakerText={UI.homeTakePlacementTest}
              onPress={onRetakePlacement}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View style={styles.levelBlock}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelNumber}>{placement.level}</Text>
            <Text style={styles.levelLabel}>{UI.levelShort}</Text>
          </View>
          <PrimaryButton
            variant="ghost"
            style={styles.fullWidthBtn}
            title={UI.retakePlacementTest}
            speakerText={UI.retakePlacementTest}
            onPress={onRetakePlacement}
          />
        </View>

        {completedSessions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{UI.completedSection}</Text>
            {completedSessions.map((s, idx) => (
              <View
                key={`${String(s.sessionId)}-${s.completedAt}-${idx}`}
                style={styles.doneCard}
              >
                <View style={styles.doneTop}>
                  <Text style={styles.doneCheck}>✅</Text>
                  <Text style={styles.doneLabel}>
                    {s.label} — {UI.levelShort} {s.level}
                  </Text>
                </View>
                <View style={styles.doneDetails}>
                  <View style={styles.conceptPill}>
                    <Text style={styles.conceptText}>
                      {formatLearningSurfaceText(s.literacyConcept)}
                    </Text>
                  </View>
                  <View style={[styles.conceptPill, styles.numPill]}>
                    <Text style={styles.conceptText}>
                      {formatLearningSurfaceText(s.numeracyConcept)}
                    </Text>
                  </View>
                  <Text style={styles.doneScore}>
                    {s.correctCount}/{s.totalInteractive} {UI.correctCount}
                  </Text>
                </View>
                {s.weakSkills.length > 0 ? (
                  <Text style={styles.weak}>
                    {UI.weakPrefix}{" "}
                    {s.weakSkills.map(skillUiLabel).join(", ")}
                  </Text>
                ) : null}
                <Text style={styles.rewardLine}>
                  {UI.rewardPrefix} {rewardDisplay(s.reward)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {hasInProgress ? (
          <View style={styles.ctaSection}>
            <Setu reaction="happy" size="md" />
            <Text style={styles.ctaTitle}>{UI.resumeLesson}</Text>
            {sessionError ? (
              <Text style={styles.ctaError}>{sessionError}</Text>
            ) : null}
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <PrimaryButton
                  style={styles.fullWidthBtn}
                  title={UI.resumeLesson}
                  speakerText={UI.resumeLessonSpeak}
                  onPress={handleResume}
                />
                <PrimaryButton
                  variant="ghost"
                  style={styles.fullWidthBtn}
                  title={UI.startNewLesson}
                  speakerText={UI.startNewLessonSpeak}
                  onPress={handleStart}
                />
              </>
            )}
          </View>
        ) : (
          <View style={styles.ctaSection}>
            <Setu reaction="happy" size="md" />
            <Text style={styles.ctaTitle}>{UI.nextLessonTitle}</Text>
            <Text style={styles.ctaSubtitle}>{UI.nextLessonSubtitle}</Text>
            {sessionError ? (
              <Text style={styles.ctaError}>{sessionError}</Text>
            ) : null}
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <PrimaryButton
                style={styles.fullWidthBtn}
                title={UI.startNewLesson}
                speakerText={UI.startNewLessonSpeak}
                onPress={handleStart}
              />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  brand: { fontSize: 28, fontWeight: "800", color: colors.primaryDark },
  tag: { fontSize: 14, color: colors.muted, marginTop: 2 },
  stat: { fontSize: 18, fontWeight: "700", color: colors.text, paddingTop: 4 },

  placementPromptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: "center",
    gap: 14,
    borderWidth: 2,
    borderColor: colors.border,
  },
  placementPromptTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primaryDark,
    textAlign: "center",
  },
  placementPromptSubtitle: {
    fontSize: 15,
    color: colors.text,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 4,
  },

  levelBlock: {
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    width: "100%",
  },
  levelBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: { fontSize: 36, fontWeight: "800", color: "#fff" },
  levelLabel: { fontSize: 11, fontWeight: "700", color: "#fff" },
  fullWidthBtn: {
    alignSelf: "stretch",
    width: "100%",
  },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },

  doneCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  doneTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  doneCheck: { fontSize: 16 },
  doneLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  doneDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  conceptPill: {
    backgroundColor: "#FFEDD5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  numPill: { backgroundColor: "#DBEAFE" },
  conceptText: { fontWeight: "800", fontSize: 16, color: colors.text },
  doneScore: {
    marginLeft: "auto",
    fontSize: 13,
    fontWeight: "600",
    color: colors.success,
  },
  weak: { fontSize: 12, color: colors.danger, marginTop: 6 },
  rewardLine: { fontSize: 12, color: colors.muted, marginTop: 4 },

  ctaSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  ctaTitle: { fontSize: 20, fontWeight: "800", color: colors.primaryDark },
  ctaSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  ctaError: {
    fontSize: 14,
    color: colors.danger,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
});
