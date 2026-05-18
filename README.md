# Akshar Setu — MVP

Parent-assisted learning app for Indian kids (ages 3–8) that teaches
Foundational Literacy and Numeracy. Hindi-first, audio-first, React Native
(Expo).

This repository contains the MVP including the **session execution engine
(step runner)** that drives a lesson from revision → parent prep →
teaching → english mapping → practice → adaptive → completion.

---

## Run

```bash
npm install
npx expo start
```

Then open the Expo Go app on a physical device (recommended, for TTS) or
press `i` / `a` in the Expo CLI for iOS / Android simulators.

> **Microphone / STT note:** The MVP ships a `MockSTT` adapter that
> simulates recognition so the flow can be exercised end-to-end. Swap it
> for a real adapter (e.g. `@react-native-voice/voice` or a cloud STT)
> by implementing the `STTAdapter` interface in `src/services/stt.ts`.

## Project layout

```
src/
├── engine/                  # The step runner (core)
│   ├── types.ts             # Schema + runnable step types
│   ├── flow.ts              # Builds ordered flow from session JSON
│   ├── evaluator.ts         # Fuzzy + exact/keyword speech eval + tap
│   ├── adaptive.ts          # Weakness tracker + adaptive generator stub
│   ├── SessionEngine.ts     # State machine (subscribe / commands)
│   └── useSessionEngine.ts  # React hook wrapper
├── services/
│   ├── tts.ts               # expo-speech wrapper (Hindi-first)
│   ├── stt.ts               # Pluggable speech-to-text (MockSTT default)
│   └── progress.ts          # AsyncStorage progress persistence
├── components/
│   ├── Setu.tsx             # Baby elephant character with reactions
│   ├── PhaseBanner.tsx      # Phase + progress header
│   ├── FeedbackBanner.tsx   # Correct / try again banner
│   ├── AudioButton.tsx
│   ├── PrimaryButton.tsx
│   ├── StepRenderer.tsx     # Dispatches on step.kind
│   └── steps/               # One component per runnable kind
├── screens/
│   ├── HomeScreen.tsx
│   └── SessionScreen.tsx
├── content/sessions/
│   └── day_1.json           # Sample session (matches the schema)
└── theme/                   # Colors, spacing, type
```

## How the execution engine works

1. **Flow build (`flow.ts`).** A `SessionSpec` (the authored JSON) is
   flattened into an ordered array of `FlowItem`s. Each `FlowItem` wraps
   a normalized `RunnableStep` (`instruction | show | tap | speech |
   parent_prep | english_mapping | complete`) tagged with a `Phase`.

2. **Engine (`SessionEngine.ts`).** A UI-agnostic state machine owns:
   - the current index, attempts-used counter, and list of results,
   - a `WeaknessTracker` keyed by `Skill`,
   - the list of subscribers notified on every state change.

   The engine exposes command methods the UI calls:
   - `acknowledge()` for non-interactive steps,
   - `submitTap(option)` / `submitSpeech(transcript)` /
     `submitSpeechFallbackTap(option)` for interactive steps,
   - `continue()` to dismiss feedback and advance,
   - `skip()`, `retry()`.

3. **Evaluation (`evaluator.ts`).** Tap answers are compared exactly.
   Speech answers use either normalized Levenshtein similarity with a
   configurable threshold (`"fuzzy"`) or exact / substring match
   (`"exact_or_keyword"`).

4. **Adaptive injection (`adaptive.ts`).** Mistakes on interactive steps
   increment per-skill counters. When the engine reaches the configured
   `injection_point` (`post_teaching` or `post_practice`), any skill
   whose mistake count is ≥ `trigger_threshold` gets 1–2 extra practice
   questions generated (template-based stub today; swap with a Gemma
   call in production) and spliced into the flow. This happens once
   per session.

5. **Feedback & Setu.** Every evaluated step produces an
   `EngineFeedback` (`correct | incorrect | info`) with an audio line
   and a `SetuReaction` (`happy | celebrate | encourage | sad | idle`)
   that drives the character bounce.

6. **Persistence.** On completion, a summary (correct count, weak
   skills, reward) is written to `AsyncStorage` so the home screen can
   show the next unlocked level and total stars.

## Speech → tap fallback

Per the product spec, speech degrades gracefully. The `SpeechStep`
component always shows a "Bolne mein dikkat? Tap karein" link that
switches to a tap chooser across `expected` strings. The engine has a
dedicated command for this path (`submitSpeechFallbackTap`) so the
result is still attributed to the same step and skill.

## Extending

- **Add a new step kind:** add a type in `engine/types.ts`, extend
  `convertModuleStep` in `flow.ts`, and add a matching component under
  `components/steps/` + a case in `StepRenderer.tsx`.
- **Swap the adaptive generator for Gemma:** replace
  `generateAdaptiveForSkill` in `adaptive.ts` with an async call that
  returns `RunnableStep[]`; if the call becomes async the engine's
  `maybeInjectAdaptive` should be awaited (keep the current synchronous
  path as a fallback).
- **Real STT:** implement `STTAdapter` and set `defaultSTT` in
  `services/stt.ts`.

## Goal

Validate the question: "Can a parent successfully teach a child one
concept using this app?" — keep UI simple, audio-first, local content,
linear progression.
