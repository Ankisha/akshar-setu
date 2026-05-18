/**
 * Placement TTS helpers: Hindi-friendly full sentences for cloud/device speech.
 */

import type { PlacementQuestion } from "@/services/api";
import {
  formatLearningSurfaceText,
  toLatinDigits,
} from "@/i18n/englishInDevanagari";

/** Intro card: spoken text must match all visible paragraphs */
export function placementIntroFullVoice(summary: string, extra: string): string {
  return `${summary.trim()} ${extra.trim()}`.trim();
}

/**
 * On question show or 🔊 replay: Hindi question wording only — no stimulus box
 * narration, choices, or correct answer read aloud.
 */
export function placementQuestionStemSpeak(q: PlacementQuestion): string {
  return formatLearningSurfaceText(toLatinDigits(q.question));
}
