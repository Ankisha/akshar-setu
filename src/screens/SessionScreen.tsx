import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { PhaseBanner } from "@/components/PhaseBanner";
import { Setu } from "@/components/Setu";
import { StepRenderer } from "@/components/StepRenderer";
import { FeedbackBanner } from "@/components/FeedbackBanner";
import { useSessionEngine } from "@/engine/useSessionEngine";
import {
  recordCompletion,
  summarize,
  saveInProgressSession,
  clearInProgressSession,
} from "@/services/progress";
import { colors } from "@/theme";
import type { SessionSpec } from "@/engine/types";
import type { SessionCatalogEntry } from "@/content/catalog";

interface Props {
  session: SessionSpec;
  catalogEntry: SessionCatalogEntry;
  onExit: () => void;
  startAtIndex?: number;
}

export const SessionScreen: React.FC<Props> = ({
  session,
  catalogEntry,
  onExit,
  startAtIndex,
}) => {
  const engine = useSessionEngine(session, startAtIndex);
  const { state } = engine;
  const savePromiseRef = useRef<Promise<void> | null>(null);

  // Persist current step index so the user can resume later
  useEffect(() => {
    if (state.status === "running") {
      saveInProgressSession(session, state.index);
    }
  }, [state.index, state.status]);

  useEffect(() => {
    if (state.status !== "completed" || savePromiseRef.current) return;

    clearInProgressSession();

    const summary = summarize({
      sessionId: state.sessionId,
      level: state.level,
      label: catalogEntry.label,
      results: state.results,
      weaknesses: state.weaknesses,
      reward: session.progress?.reward ?? "star",
      literacyConcept: catalogEntry.literacy.concept,
      numeracyConcept: catalogEntry.numeracy.concept,
    });
    savePromiseRef.current = recordCompletion(summary).then(() => {});
  }, [state.status]);

  const handleDone = useCallback(async () => {
    if (savePromiseRef.current) {
      await savePromiseRef.current;
    } else {
      const summary = summarize({
        sessionId: state.sessionId,
        level: state.level,
        label: catalogEntry.label,
        results: state.results,
        weaknesses: state.weaknesses,
        reward: session.progress?.reward ?? "star",
        literacyConcept: catalogEntry.literacy.concept,
        numeracyConcept: catalogEntry.numeracy.concept,
      });
      await recordCompletion(summary);
    }
    onExit();
  }, [state, catalogEntry, session, onExit]);

  const handleGoHome = useCallback(() => {
    onExit();
  }, [onExit]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topRow}>
        {state.canGoBack ? (
          <Pressable onPress={engine.goBack} style={styles.backBtn}>
            <Text style={styles.backText}>← पीछे</Text>
          </Pressable>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <PhaseBanner
          phase={state.phase}
          index={state.index}
          total={state.total}
        />
        <Pressable onPress={handleGoHome} style={styles.homeBtn}>
          <Text style={styles.homeText}>🏠</Text>
        </Pressable>
      </View>
      <View style={styles.setuRow}>
        <Setu reaction={state.reaction} size="sm" />
      </View>
      <View style={styles.stage}>
        <StepRenderer
          state={state}
          feedback={state.lastFeedback}
          onAcknowledge={engine.acknowledge}
          onSubmitTap={engine.submitTap}
          onSubmitSpeech={engine.submitSpeech}
          onSubmitSpeechFallbackTap={engine.submitSpeechFallbackTap}
          onContinue={engine.continueFlow}
          onDone={handleDone}
        />
      </View>
      <FeedbackBanner feedback={state.lastFeedback} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  backPlaceholder: { width: 60 },
  homeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  homeText: {
    fontSize: 18,
  },
  setuRow: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  stage: { flex: 1 },
});
