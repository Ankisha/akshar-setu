/**
 * `AbortSignal.timeout()` is missing in some React Native / Hermes builds.
 * Passing `signal: AbortSignal.timeout(n)` throws before `fetch()` runs,
 * even when the server would return 200 — the promise rejects with no HTTP trace.
 */

export function abortSignalAfter(ms: number): AbortSignal {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
