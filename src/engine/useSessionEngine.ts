import { useEffect, useMemo, useRef, useState } from "react";
import { SessionEngine, type EngineState } from "./SessionEngine";
import type { SessionSpec } from "./types";

/**
 * React hook that owns a SessionEngine instance for the given session.
 * Provides the latest state snapshot plus stable command callbacks.
 */
export const useSessionEngine = (session: SessionSpec, startAtIndex?: number) => {
  const engineRef = useRef<SessionEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new SessionEngine(session, startAtIndex);
  }
  const engine = engineRef.current;

  const [state, setState] = useState<EngineState>(() => engine.getState());

  useEffect(() => {
    const unsub = engine.subscribe(setState);
    engine.start();
    return () => {
      unsub();
    };
  }, [engine]);

  const commands = useMemo(
    () => ({
      acknowledge: () => engine.acknowledge(),
      submitTap: (option: string) => engine.submitTap(option),
      submitSpeech: (transcript: string) => engine.submitSpeech(transcript),
      submitSpeechFallbackTap: (option: string) =>
        engine.submitSpeechFallbackTap(option),
      retry: () => engine.retry(),
      skip: () => engine.skip(),
      continueFlow: () => engine.continue(),
      goBack: () => engine.goBack(),
    }),
    [engine],
  );

  return { state, ...commands, engine };
};
