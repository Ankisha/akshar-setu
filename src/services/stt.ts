/**
 * Speech-to-text service.
 *
 * Provides three adapters:
 *  - MockSTT:  returns a queued string (for dev/testing).
 *  - GemmaSTT: records audio via expo-av, sends to the Gemma 4 E2B server,
 *              returns the transcript. Falls back to tap if anything fails.
 *
 * UI callers should ALWAYS show a "use tap instead" fallback button per
 * the product spec: speech must degrade to tap gracefully.
 */

import { Audio } from "expo-av";
import { Platform } from "react-native";
import { STT_SERVER_URL, STT_HEALTH_URL } from "@/config";
import { abortSignalAfter } from "@/utils/abortSignal";

/* ----- Shared types ----- */

export interface STTResult {
  transcript: string;
  confidence: number;
}

export interface STTAdapter {
  isAvailable(): Promise<boolean>;
  start(language?: string): Promise<void>;
  stop(): Promise<STTResult>;
  cancel(): Promise<void>;
}

/* ----- MockSTT (unchanged, for dev) ----- */

export class MockSTT implements STTAdapter {
  private queued: string | null = null;
  private running = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<STTResult> {
    this.running = false;
    const transcript = this.queued ?? "";
    this.queued = null;
    return { transcript, confidence: transcript ? 0.9 : 0 };
  }

  async cancel(): Promise<void> {
    this.running = false;
    this.queued = null;
  }

  queueNextResult(transcript: string): void {
    this.queued = transcript;
  }

  isRunning(): boolean {
    return this.running;
  }
}

/* ----- GemmaSTT (real adapter) ----- */

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 64_000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 64_000,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64_000,
  },
};

export class GemmaSTT implements STTAdapter {
  private recording: Audio.Recording | null = null;
  private language = "Hindi";

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(STT_HEALTH_URL, {
        method: "GET",
        signal: abortSignalAfter(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async start(language?: string): Promise<void> {
    this.language = language ?? "Hindi";

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Microphone permission not granted");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
    this.recording = recording;
  }

  async stop(): Promise<STTResult> {
    if (!this.recording) {
      return { transcript: "", confidence: 0 };
    }

    await this.recording.stopAndUnloadAsync();
    const uri = this.recording.getURI();
    this.recording = null;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    if (!uri) {
      return { transcript: "", confidence: 0 };
    }

    return this.sendToServer(uri);
  }

  async cancel(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // Already stopped.
      }
      this.recording = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  private async sendToServer(uri: string): Promise<STTResult> {
    const ext = Platform.OS === "web" ? "webm" : "m4a";
    const mimeType = Platform.OS === "web" ? "audio/webm" : "audio/m4a";
    const filename = `recording.${ext}`;

    const form = new FormData();
    form.append("audio", {
      uri,
      type: mimeType,
      name: filename,
    } as unknown as Blob);
    form.append("language", this.language);

    const resp = await fetch(STT_SERVER_URL, {
      method: "POST",
      body: form,
      signal: abortSignalAfter(15_000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`STT server error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const transcript = (data.transcript ?? "").trim();
    return {
      transcript,
      confidence: transcript ? 0.85 : 0,
    };
  }
}

/* ----- Default export: GemmaSTT with MockSTT fallback ----- */

export const gemmaSTT = new GemmaSTT();
export const mockSTT = new MockSTT();

/**
 * defaultSTT tries GemmaSTT first; if the server is unreachable the
 * SpeechStep UI will catch the error and offer the tap fallback.
 */
export const defaultSTT: STTAdapter = gemmaSTT;
