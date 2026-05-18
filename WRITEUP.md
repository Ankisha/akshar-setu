# Akshar Setu: AI-Powered Foundational Literacy for India's Children

**A parent-assisted, audio-first learning app that uses Gemma 4 to deliver personalized Hindi literacy and numeracy lessons to children aged 3–8.**

**Track:** Education

---

## The Problem

260 million Indian children need Foundational Literacy and Numeracy (FLN), yet most lack access to quality tutors. Parents want to help but don't know *how* to structure a lesson. Akshar Setu bridges this gap: it turns a parent's smartphone into an adaptive Hindi tutor powered by Gemma 4, requiring no teaching expertise from the parent—just 15 minutes a day.

## Architecture Overview

Akshar Setu is a full-stack application with three layers:

**Frontend:** A React Native (Expo 54) app written in TypeScript, targeting both mobile and web. The UI is entirely in Hindi Devanagari, audio-first, and designed around a mascot character ("Setu," a baby elephant) that reacts to the child's performance with animations.

**Backend:** A FastAPI server (Python 3.11) that hosts all AI-powered endpoints—placement assessment, session generation, speech transcription, and student report updates. Google Cloud TTS provides neural Hindi voice synthesis.

**AI Layer:** Gemma 4 (`gemma4:e2b`) running locally via Ollama. This single model handles four distinct capabilities: structured curriculum generation, diagnostic assessment, speech-to-text transcription, and student skill analysis—all through carefully engineered prompts.

**Deployment:** A multi-stage Docker image builds the Expo web export in Node, then bundles the Python server and Ollama into one container. A Railway-oriented startup script manages volume persistence for model weights and student data, pulling the Gemma model on first deploy.

## How We Use Gemma 4

Gemma 4 is the intelligence backbone of Akshar Setu, driving four core capabilities:

### 1. Adaptive Session Generation

This is our most sophisticated use of Gemma. When a child starts a lesson, Gemma receives the student's full skill profile—per-character and per-number mastery scores (0–5 scale) across all 36 Hindi characters and numbers 1–10—and generates a complete, structured lesson in a single inference pass.

The prompt constrains Gemma to output valid JSON matching our session schema: parent preparation steps, a literacy module (instruction → show letter → child speaks → tap quiz), a numeracy module, and mixed practice. Crucially, the prompt embeds pedagogy rules: letter progression follows Hindi linguistic structure (vowels → velar → palatal → retroflex → dental consonants), elongated sounds use the Devanagari avagraha (ऽ) rather than Latin repetition, and the model must select concepts the student hasn't mastered (score 0–2) rather than already-strong ones (4–5).

A post-generation normalization layer (`normalize_delivered_session`) patches common LLM output issues: deduplicating tap options, correcting english_mapping values (ensuring the English word maps to the *word example*, not the letter name), and replacing letter audio with properly elongated TTS-compatible Devanagari strings.

### 2. Placement Assessment

When a child first uses the app, they take an 8-question diagnostic covering letter recognition, word mapping, number recognition, counting, and basic operations. Gemma analyses the results and returns a structured JSON assessment: overall/literacy/numeracy levels (1–10), a parent-facing analysis paragraph (in Hindi Devanagari with ASCII digits), and skill-specific strengths and weaknesses. This analysis seeds the student report that drives all future session personalization.

### 3. Speech Transcription (ASR)

Gemma 4's multimodal capabilities power our speech-to-text pipeline. The child's audio (recorded via `expo-av`) is resampled to 16 kHz mono WAV using librosa and sent to Ollama's OpenAI-compatible `/v1/audio/transcriptions` endpoint. A custom ASR prompt instructs Gemma to transcribe Hinglish naturally—Devanagari for Hindi words, English spelling for English words, ASCII digits for numbers, and to output isolated letters/sounds faithfully without embellishment.

### 4. Student Skill Report Updates

After each completed module, Gemma reviews the step-by-step results (which steps were correct, how many attempts were used) against the current skill profile and produces a targeted delta update. The prompt encodes scoring rubrics: first-attempt correct earns +1, exhausting all attempts earns −1, and levels only increase with strong evidence across multiple skills.

### Resilience: Deterministic Fallbacks

Every Gemma-powered pathway has a handcrafted deterministic fallback. If the model is unreachable, slow, or returns malformed JSON, the app degrades gracefully: placement uses ratio-based scoring, session generation follows curriculum tables with report-aware concept selection, and report updates apply rule-based score adjustments. The app never breaks—it just becomes less personalized.

## Key Technical Challenges

### Structured Output Reliability

LLMs generating valid JSON for a complex nested schema (sessions contain modules, each with ordered pedagogical steps, evaluation configs, and audio text) is inherently fragile. We address this through: (1) explicit JSON schema in the prompt with concrete examples, (2) `strip_json_fence` to handle markdown code block wrapping, (3) the normalization layer that repairs common structural issues post-generation, and (4) the deterministic fallback path as a safety net.

### Hindi-First Audio Pipeline

Building an audio-first experience in Hindi presented unique challenges. TTS must handle mixed content—Devanagari text, elongated letter sounds (using avagraha: कऽऽऽऽ), and SSML markup for teaching pacing. We use Google Cloud TTS with Neural2 voices and SSML helpers for teaching lines, falling back to `expo-speech` (device TTS) if the cloud service is unavailable.

### Speech Evaluation for Children

Children's speech is noisy—they elongate sounds, add matra suffixes, and STT transcription varies wildly. Our evaluator (`evaluator.ts`) implements three strategies: **phonetic matching** that strips elongation markers and repeated glyphs before comparing, **fuzzy matching** using normalized Levenshtein similarity with configurable thresholds, and **exact-or-keyword** for number recognition. A phonetic alias table maps each Hindi character to its common STT variants (e.g., "क" matches "क", "का", "ka", "kaa"). Speech steps also offer a tap fallback—if the microphone fails or the child is too shy, they can tap the answer instead, with the result still attributed to the correct skill.

### Devanagari Digit Normalization

A subtle but pervasive issue: Gemma and various data sources occasionally output Devanagari numerals (०–९) instead of ASCII digits (0–9). Since our UI policy requires Western digits throughout, every string that reaches the display layer passes through `toLatinDigits()`. This is enforced at render time rather than at data ingestion, preserving original content for TTS/STT while ensuring visual consistency.

## Why These Technical Choices

**Gemma 4 via Ollama (not a cloud API):** Privacy is critical for children's data. Running Gemma locally means voice recordings and student profiles never leave the deployment. Ollama's OpenAI-compatible API also gives us ASR and chat through a single service, simplifying operations. The `e2b` variant balances quality with the resource constraints of a single-container deployment.

**React Native (Expo) + FastAPI:** Expo's cross-platform reach (iOS, Android, web from one codebase) is essential for an education app targeting India's diverse device ecosystem. FastAPI's async capabilities handle concurrent TTS synthesis and LLM calls efficiently, and the co-hosted static export means a single container serves both UI and API.

**JSON-as-curriculum:** Rather than hardcoding lessons, the entire session is a structured JSON document that Gemma generates per-student. This means the curriculum is inherently adaptive—no two children with different profiles receive the same lesson—while the rigid schema keeps the execution engine predictable and testable.

**File-based persistence (no database):** For an MVP targeting a single-student-per-device model, a JSON file on disk (symlinked to a Railway volume for persistence) eliminates operational complexity while being trivially inspectable and debuggable.

## Results and Impact

Akshar Setu demonstrates that a single open-weight model—Gemma 4—can power an end-to-end educational experience: from understanding a child's spoken Hindi, to diagnosing their skill gaps, to generating pedagogically-sound personalized lessons, to tracking their progress over time. The architecture is designed so that as Gemma improves, the app improves with it—no code changes needed, just a model swap.

The deterministic fallback design means the app works even offline or on minimal hardware, making it deployable in the low-connectivity environments where India's FLN gap is most acute.
