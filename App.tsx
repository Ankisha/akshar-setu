import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebPhoneFrame } from "@/components/WebPhoneFrame";
import { HomeScreen } from "@/screens/HomeScreen";
import { PlacementScreen } from "@/screens/PlacementScreen";
import { SessionScreen } from "@/screens/SessionScreen";
import { generateSession, type LevelResult } from "@/services/api";
import {
  loadProgress,
  recordPlacement,
  loadInProgressSession,
  clearInProgressSession,
  type PlacementResult,
} from "@/services/progress";
import { UI } from "@/i18n/ui_hi";
import { colors } from "@/theme";
import type { SessionSpec } from "@/engine/types";

type Route = "loading" | "placement" | "home" | "session";

export default function App() {
  const [route, setRoute] = useState<Route>("loading");
  const [runKey, setRunKey] = useState(0);
  const [placementFlowKey, setPlacementFlowKey] = useState(0);
  const [session, setSession] = useState<SessionSpec | null>(null);
  const [resumeIndex, setResumeIndex] = useState<number | undefined>(undefined);
  const [placement, setPlacement] = useState<PlacementResult | null>(null);
  const [hasInProgress, setHasInProgress] = useState(false);

  useEffect(() => {
    Promise.all([loadProgress(), loadInProgressSession()]).then(
      ([p, inProgress]) => {
        setPlacement(p.placement);
        setHasInProgress(inProgress !== null);
        setRoute("home");
      },
    );
  }, []);

  const handlePlacementComplete = useCallback(async (result: LevelResult, childAge: number) => {
    const pr = await recordPlacement({
      level: result.level,
      literacy_level: result.literacy_level,
      numeracy_level: result.numeracy_level,
      weaknesses: result.weaknesses,
      strengths: result.strengths,
      analysis: result.analysis,
      parent_guidance: result.parent_guidance,
      child_age: childAge,
    });
    setPlacement(pr.placement);
    setRoute("home");
  }, []);

  const handleStartSession = useCallback(async () => {
    await clearInProgressSession();
    setHasInProgress(false);

    const progress = await loadProgress();
    const p = progress.placement;
    if (!p) return;

    const previousConcepts = Object.values(progress.sessions).flatMap((s) => [
      s.literacyConcept,
      s.numeracyConcept,
    ]);

    const json = await generateSession({
      level: p.level,
      literacy_level: p.literacy_level,
      numeracy_level: p.numeracy_level,
      child_age: p.child_age,
      weaknesses: p.weaknesses,
      previous_concepts: previousConcepts,
    });

    setSession(json as unknown as SessionSpec);
    setResumeIndex(undefined);
    setRunKey((k) => k + 1);
    setRoute("session");
  }, []);

  const handleResumeSession = useCallback(async () => {
    const inProgress = await loadInProgressSession();
    if (!inProgress) return;
    setSession(inProgress.session as unknown as SessionSpec);
    setResumeIndex(inProgress.stepIndex);
    setRunKey((k) => k + 1);
    setRoute("session");
  }, []);

  const handleExit = useCallback(async () => {
    setSession(null);
    setResumeIndex(undefined);
    const inProgress = await loadInProgressSession();
    setHasInProgress(inProgress !== null);
    setRoute("home");
  }, []);

  const handleRetakePlacement = useCallback(() => {
    setPlacementFlowKey((k) => k + 1);
    setRoute("placement");
  }, []);

  /** जाँच छोड़कर होम पर — पहले से सहेजा स्तर बिना बदले रहता है */
  const handleExitPlacement = useCallback(() => {
    setRoute("home");
  }, []);

  // ─── Loading ──────────────────────────────────────────────────

  if (route === "loading") {
    return (
      <WebPhoneFrame>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{UI.appNameLoading}</Text>
        </View>
      </WebPhoneFrame>
    );
  }

  // ─── Placement test ───────────────────────────────────────────

  if (route === "placement") {
    return (
      <WebPhoneFrame>
        <StatusBar style="dark" />
        <PlacementScreen
          key={placementFlowKey}
          onComplete={handlePlacementComplete}
          onGoHome={handleExitPlacement}
        />
      </WebPhoneFrame>
    );
  }

  // ─── Session ──────────────────────────────────────────────────

  if (route === "session" && session) {
    const lv = session.level ?? placement?.level ?? 1;
    return (
      <WebPhoneFrame>
        <StatusBar style="dark" />
        <SessionScreen
          key={runKey}
          session={session}
          startAtIndex={resumeIndex}
          catalogEntry={{
            sessionId: session.session_id ?? `generated_${placement?.level ?? 1}`,
            level: lv,
            label: `${UI.levelShort} ${lv}`,
            literacy: {
              concept: session.modules?.[0]?.concept ?? "?",
              word: (session.modules?.[0] as { word_example?: string })
                ?.word_example ?? "",
              english:
                (session.modules?.[0] as { english_mapping?: string })
                  ?.english_mapping ?? "",
            },
            numeracy: {
              concept: session.modules?.[1]?.concept ?? "?",
              english:
                (session.modules?.[1] as { english_mapping?: string })
                  ?.english_mapping ?? "",
            },
            estimatedMinutes: session.meta?.estimated_duration_minutes ?? 15,
            parentPrepSummary: session.parent_prep?.audio_instruction ?? "",
          }}
          onExit={handleExit}
        />
      </WebPhoneFrame>
    );
  }

  // ─── Home ─────────────────────────────────────────────────────

  return (
    <WebPhoneFrame>
      <StatusBar style="dark" />
      <HomeScreen
        key={route}
        placement={placement}
        hasInProgress={hasInProgress}
        onStartSession={handleStartSession}
        onResumeSession={handleResumeSession}
        onRetakePlacement={handleRetakePlacement}
      />
    </WebPhoneFrame>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 16,
  },
  loadingText: { fontSize: 24, fontWeight: "800", color: colors.primaryDark },
});
