import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AudioButton } from "@/components/AudioButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Setu } from "@/components/Setu";
import {
  formatLearningSurfaceText,
  toLatinDigits,
} from "@/i18n/englishInDevanagari";
import { UI } from "@/i18n/ui_hi";
import {
  determineLevel,
  fetchPlacementQuestions,
  type LevelResult,
  type PlacementAnswer,
  type PlacementQuestion,
} from "@/services/api";
import {
  placementIntroFullVoice,
  placementQuestionStemSpeak,
} from "@/services/placementTts";
import { tts } from "@/services/tts";
import { colors, radius } from "@/theme";

type Phase = "intro" | "testing" | "analysing" | "result";

interface Props {
  onComplete: (result: LevelResult, childAge: number) => void;
  /** जाँच बीच में छोड़कर होम; AsyncStorage का पुराना स्तर बदलता नहीं */
  onGoHome: () => void;
}

function placementVoiceParagraph(r: LevelResult): string {
  const merged = `${r.analysis.trim()} ${r.parent_guidance.trim()}`.trim();
  return merged.length > 0 ? merged : UI.placementResultFallback;
}

function PlacementTopBar({ onGoHome }: { onGoHome: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onGoHome}
        style={({ pressed }) => [styles.topBarBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={UI.placementReturnHome}
      >
        <Text style={styles.topBarText}>{UI.placementReturnHome}</Text>
      </Pressable>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

export const PlacementScreen: React.FC<Props> = ({ onComplete, onGoHome }) => {
  const abandonedRef = useRef(false);

  /** जाँच सत्र छोड़ना; पूरा होने का इंतज़ार न करें पर सेटस्टेट न करें जब टैब छोड़ दिया हो */
  const goHome = useCallback(() => {
    abandonedRef.current = true;
    tts.stop();
    onGoHome();
  }, [onGoHome]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [childAge, setChildAge] = useState(5);

  useEffect(() => {
    fetchPlacementQuestions()
      .then(setQuestions)
      .catch(() => setError(UI.placementErrorNetwork));
  }, []);

  const startTest = useCallback(() => {
    if (questions.length === 0) return;
    setError(null);
    setPhase("testing");
    setCurrentIdx(0);
    setAnswers([]);
    const q = questions[0];
    tts.speak(placementQuestionStemSpeak(q));
  }, [questions]);

  const handleAnswer = useCallback(
    (option: string) => {
      const q = questions[currentIdx];
      const answer: PlacementAnswer = {
        question_id: q.id,
        question: q.question,
        correct_answer: q.answer,
        user_answer: option,
        correct: option === q.answer,
      };
      const newAnswers = [...answers, answer];
      setAnswers(newAnswers);

      if (answer.correct) {
        tts.speak(UI.okAnswer, { preferCloud: false });
      } else {
        tts.speak(UI.tryAgainComfort, { preferCloud: false });
      }

      const nextIdx = currentIdx + 1;
      if (nextIdx >= questions.length) {
        setPhase("analysing");
        determineLevel(newAnswers, childAge)
          .then((r) => {
            if (abandonedRef.current) return;
            setResult(r);
            setPhase("result");
          })
          .catch((err: unknown) => {
            if (abandonedRef.current) return;
            if (__DEV__) {
              console.warn("[Placement] determineLevel failed:", err);
            }
            const name =
              err && typeof err === "object" && "name" in err
                ? String((err as { name?: string }).name ?? "")
                : "";
            const msg =
              err && typeof err === "object" && "message" in err
                ? String((err as { message?: string }).message ?? "")
                : String(err ?? "");
            const isAbort =
              name === "AbortError" ||
              /abort|aborted|timeout|timed out/i.test(`${name} ${msg}`);
            setError(
              isAbort
                ? UI.placementErrorDetermineTimeoutOrParse
                : UI.placementErrorDetermine,
            );
            setPhase("intro");
          });
      } else {
        setTimeout(() => {
          setCurrentIdx(nextIdx);
          tts.speak(placementQuestionStemSpeak(questions[nextIdx]));
        }, 800);
      }
    },
    [questions, currentIdx, answers, childAge],
  );

  // ─── Intro: parent onboarding ────────────────────────────────

  if (phase === "intro") {
    return (
      <SafeAreaView style={styles.root}>
        <PlacementTopBar onGoHome={goHome} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.center}>
            <Setu reaction="happy" size="lg" />
            <Text style={styles.title}>{UI.placementWelcomeTitle}</Text>
            <View style={styles.introCard}>
              <View style={styles.introHeadingRow}>
                <Text style={styles.introHeading}>{UI.parentHeading}</Text>
                <AudioButton
                  text={placementIntroFullVoice(
                    UI.placementListenSummary,
                    UI.placementIntroAdditional,
                  )}
                  iconOnly
                  compact
                  accessibilityLabel={UI.listenRepeat}
                />
              </View>
              <Text style={styles.introText}>
                {UI.placementListenSummary}
              </Text>
              <Text style={styles.introText}>
                {UI.placementIntroAdditional}
              </Text>
            </View>

            <View style={styles.ageBlock}>
              <View style={styles.ageLabelRow}>
                <Text style={styles.ageLabel}>{UI.childAge}</Text>
                <AudioButton
                  text={UI.childAge}
                  iconOnly
                  compact
                  accessibilityLabel={`${UI.accessibilityPlayAudio}: ${UI.childAge}`}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.agePillsScroll}
                contentContainerStyle={styles.agePillsRow}
              >
                {[3, 4, 5, 6, 7, 8].map((age) => (
                  <Pressable
                    key={age}
                    onPress={() => setChildAge(age)}
                    style={[
                      styles.agePill,
                      age === childAge && styles.agePillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.ageText,
                        age === childAge && styles.ageTextActive,
                      ]}
                    >
                      {age}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              style={styles.introStartBtnFull}
              title={UI.startTest}
              speakerText={UI.startTest}
              onPress={startTest}
              disabled={questions.length === 0}
            />
            {questions.length === 0 && !error ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Testing: one question at a time ─────────────────────────

  if (phase === "testing") {
    const q = questions[currentIdx];
    return (
      <SafeAreaView style={styles.root}>
        <PlacementTopBar onGoHome={goHome} />
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            {UI.qProgress} {currentIdx + 1} / {questions.length}
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${((currentIdx + 1) / questions.length) * 100}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.questionArea}>
          <View style={styles.questionHeaderRow}>
            <Text style={[styles.qText, styles.qTextFlex]}>
              {formatLearningSurfaceText(toLatinDigits(q.question))}
            </Text>
            <AudioButton
              text={placementQuestionStemSpeak(q)}
              compact
              iconOnly
              accessibilityLabel={UI.listenShort}
            />
          </View>
          {q.show ? (
            <View style={styles.showBox}>
              <Text style={styles.showContent}>
                {formatLearningSurfaceText(toLatinDigits(q.show))}
              </Text>
            </View>
          ) : null}
          <View style={styles.optionsRow}>
            {q.options.map((opt, optIdx) => (
              <Pressable
                key={`${q.id}-${optIdx}-${String(opt)}`}
                onPress={() => handleAnswer(opt)}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.optionText}>
                  {formatLearningSurfaceText(opt)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.setuSmall}>
          <Setu reaction="idle" size="sm" />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Analysing ───────────────────────────────────────────────

  if (phase === "analysing") {
    return (
      <SafeAreaView style={styles.root}>
        <PlacementTopBar onGoHome={goHome} />
        <View style={styles.center}>
          <Setu reaction="idle" size="md" />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{UI.analysing}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Result ──────────────────────────────────────────────────

  if (phase === "result" && result) {
    const summaryRaw = placementVoiceParagraph(result);
    const summaryDisplay = formatLearningSurfaceText(
      toLatinDigits(summaryRaw),
    );
    return (
      <SafeAreaView style={styles.root}>
        <PlacementTopBar onGoHome={goHome} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.center}>
            <Setu reaction="celebrate" size="lg" />
            <Text style={styles.resultTitle}>{UI.levelReadyTitle}</Text>

            <View style={styles.levelBadge}>
              <Text style={styles.levelNumber}>{result.level}</Text>
              <Text style={styles.levelLabel}>{UI.levelShort}</Text>
            </View>

            <View style={styles.resultSummaryRow}>
              <Text style={styles.resultSummaryText}>{summaryDisplay}</Text>
              <AudioButton
                text={summaryDisplay}
                iconOnly
                compact
                accessibilityLabel={UI.listenShort}
              />
            </View>

            <PrimaryButton
              style={styles.resultStartBtnFull}
              title={UI.firstLessonBtn}
              speakerText={UI.firstLessonSpeak}
              onPress={() => onComplete(result, childAge)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 2,
    backgroundColor: colors.bg,
  },
  topBarBtn: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  topBarText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  topBarSpacer: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { alignItems: "center", gap: 16, paddingTop: 20 },

  title: { fontSize: 24, fontWeight: "800", color: colors.primaryDark },
  introCard: {
    backgroundColor: "#E0F2FE",
    borderRadius: radius.lg,
    padding: 20,
    width: "100%",
    gap: 10,
    borderWidth: 1,
    borderColor: "#7DD3FC",
  },
  introHeading: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    color: "#0369A1",
    letterSpacing: 1,
  },
  introHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    flexWrap: "wrap",
  },
  introText: { fontSize: 16, color: colors.text, lineHeight: 22 },

  ageBlock: {
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
  },
  ageLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  agePillsScroll: { alignSelf: "stretch", maxHeight: 48 },
  agePillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
    paddingVertical: 2,
  },
  ageLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  agePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  agePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ageText: { fontWeight: "700", color: colors.text },
  ageTextActive: { color: "#fff" },

  error: { color: colors.danger, fontSize: 14, textAlign: "center" },

  introStartBtnFull: { width: "100%", alignSelf: "stretch" },

  progressRow: { paddingHorizontal: 20, paddingTop: 16 },
  progressText: { fontSize: 14, color: colors.muted, marginBottom: 6 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.primary },

  questionArea: {
    flex: 1,
    justifyContent: "center",
    alignSelf: "stretch",
    padding: 24,
    gap: 20,
  },
  questionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  qTextFlex: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
  },
  qText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  showBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.border,
  },
  showContent: { fontSize: 72, fontWeight: "800", color: colors.primaryDark },
  optionsRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  option: {
    minWidth: 96,
    minHeight: 96,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.tapBg,
    borderWidth: 3,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { fontSize: 40, fontWeight: "800", color: colors.text },
  pressed: { opacity: 0.85 },

  setuSmall: { position: "absolute", bottom: 16, right: 16 },

  loadingText: {
    fontSize: 18,
    color: colors.muted,
    textAlign: "center",
    marginTop: 12,
  },

  resultTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.primaryDark,
  },
  levelBadge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: { fontSize: 40, fontWeight: "800", color: "#fff" },
  levelLabel: { fontSize: 12, fontWeight: "700", color: "#fff" },
  resultSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },
  resultSummaryText: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    lineHeight: 26,
    minWidth: 0,
  },

  resultStartBtnFull: { width: "100%", alignSelf: "stretch" },
});
