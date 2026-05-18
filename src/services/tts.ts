/**
 * Text-to-speech service.
 *
 * Primary path: Google Cloud Text-to-Speech via our Mac/FastAPI server (default Hindi
 * neural voice reads mixed Hindi + English alphabets in one utterance — Hindi speech).
 * Fallback path: device TTS through expo-speech (`hi-IN`).
 *
 * If credentials are missing, `POST /synthesize` returns **503** → we parse the
 * error and fall back to on-device speech (no unexplained silence for the learner).
 *
 * API keys stay on the server; the mobile app only receives short MP3 clips.
 */

import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { TTS_SYNTHESIZE_URL } from "@/config";

/**
 * iOS by default mutes `Audio.Sound` when the **silent / ringer switch** is on.
 * Children's TTS must always be audible regardless of that switch — set the
 * audio mode once before the first playback.
 */
let audioModeReady: Promise<void> | null = null;
const ensureAudioMode = (): Promise<void> => {
  if (!audioModeReady) {
    audioModeReady = Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      staysActiveInBackground: false,
    }).catch((err) => {
      if (__DEV__) {
        console.warn(
          "[TTS] setAudioModeAsync failed (continuing):",
          err instanceof Error ? err.message : String(err),
        );
      }
    }) as Promise<void>;
  }
  return audioModeReady;
};

export interface SpeakOptions {
  language?: string;
  /** Native English neural voice; default false = Hindi persona (reads हिंदी + English in Hindi speech). */
  useEnglishVoice?: boolean;
  rate?: number;
  pitch?: number;
  onDone?: () => void;
  preferCloud?: boolean;
}

const DEFAULT_LANG = "hi-IN";

let speaking = false;
let currentSound: Audio.Sound | null = null;
let currentRequest: AbortController | null = null;

const isAbortError = (err: unknown): boolean => {
  if (typeof err !== "object" || err === null) return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  const message =
    "message" in err ? String((err as { message?: string }).message) : "";
  return (
    name === "AbortError" ||
    /aborted|^aborted$/i.test(message)
  );
};

const localSpeak = (text: string, opts: SpeakOptions = {}): void => {
  Speech.stop();
  speaking = true;
  Speech.speak(text, {
    language: opts.language ?? DEFAULT_LANG,
    rate: opts.rate ?? 0.95,
    pitch: opts.pitch ?? 1.05,
    onDone: () => {
      speaking = false;
      opts.onDone?.();
    },
    onStopped: () => {
      speaking = false;
    },
    onError: () => {
      speaking = false;
    },
  });
};

const stopCloudSound = async (): Promise<void> => {
  currentRequest?.abort();
  currentRequest = null;
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {
      // Sound may already be unloaded.
    }
    currentSound = null;
  }
};

/** Best-effort message from `{ "error": "..." }` or plain text body. */
const readSynthesizeFailureBody = async (resp: Response): Promise<string> => {
  const raw = await resp.text();
  try {
    const j = JSON.parse(raw) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) {
      return j.error.trim();
    }
  } catch {
    /* not JSON */
  }
  const t = raw.trim();
  return t ? t.slice(0, 300) : resp.statusText || `HTTP ${resp.status}`;
};

const writeBase64Audio = async (base64: string): Promise<string> => {
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error("No writable directory available for TTS audio");
  }
  const uri = `${baseDir}tts-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
};

const speakCloud = async (text: string, opts: SpeakOptions = {}): Promise<void> => {
  await ensureAudioMode();
  await stopCloudSound();
  Speech.stop();

  speaking = true;
  currentRequest = new AbortController();

  const resp = await fetch(TTS_SYNTHESIZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language_code: opts.language ?? DEFAULT_LANG,
      use_english_voice: opts.useEnglishVoice ?? false,
      speaking_rate: opts.rate ?? 0.92,
      pitch: opts.pitch ?? 1,
    }),
    signal: currentRequest.signal,
  });

  if (!resp.ok) {
    const detail = await readSynthesizeFailureBody(resp);
    throw new Error(
      resp.status === 503
        ? `Google TTS unavailable (503): ${detail}`
        : `TTS HTTP ${resp.status}: ${detail}`,
    );
  }

  const data = (await resp.json()) as { audio_base64?: string };
  if (!data.audio_base64) {
    throw new Error("TTS server did not return audio");
  }

  const uri = await writeBase64Audio(data.audio_base64);
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  currentSound = sound;
  sound.setOnPlaybackStatusUpdate((status) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      speaking = false;
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      opts.onDone?.();
    }
  });
};

export const tts = {
  speak(text: string, opts: SpeakOptions = {}): void {
    if (!text) return;
    const preferCloud = opts.preferCloud ?? true;
    if (!preferCloud) {
      localSpeak(text, opts);
      return;
    }
    speakCloud(text, opts).catch((err) => {
      // `stop()` / new `speak()` aborts the in-flight fetch — do not replay on device.
      if (isAbortError(err)) return;
      // Keep the app usable if the Mac server or Google TTS is unavailable (e.g. 503).
      if (__DEV__) {
        console.warn(
          "[TTS] Cloud synth failed — using device speech. Reason:",
          err instanceof Error ? err.message : String(err),
        );
      }
      localSpeak(text, opts);
    });
  },

  stop(): void {
    Speech.stop();
    stopCloudSound().catch(() => {});
    speaking = false;
  },

  isSpeaking(): boolean {
    return speaking;
  },
};
