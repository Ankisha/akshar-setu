/**
 * Show English vocabulary / roman labels in Devanagari for children
 * ("अंग्रेज़ी शब्द — हिंदी लिपि में") while preserving real Hindi passages as-is.
 * All numerals are shown with Western digits (0–9), not Devanagari (०–९).
 */

const SCRIPT_DV = /[\u0900-\u097F]/g;

/** Devanagari digits (U+0966–U+096F) → Latin 0–9 */
export function toLatinDigits(text: string): string {
  return text.replace(/[\u0966-\u096F]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x0966 + 48),
  );
}

/** ENGLISH_MAP (server) latin value → hindi-script gloss for mapping step */
const ROMAN_SOUND_TO_DV: Record<string, string> = {
  a: "अ ए",
  aa: "आ",
  i: "इ",
  ee: "ई",
  u: "उ",
  oo: "ऊ",
  ka: "क",
  kha: "ख",
  ga: "ग",
  gha: "घ",
  cha: "च",
  chha: "छ",
  ja: "ज",
  jha: "झ",
  ta: "त",
  tha: "थ",
  da: "द",
  dha: "ध",
  na: "न",
  pa: "प",
  pha: "फ",
  ba: "ब",
  bha: "भ",
  ma: "म",
  ya: "य",
  ra: "र",
  la: "ल",
  va: "व",
  sha: "श",
  sa: "स",
  ha: "ह",

  zero: "ज़ीरो",
  one: "वन · 1",
  two: "टू · 2",
  three: "थ्री · 3",
  four: "फ़ोर · 4",
  five: "फ़ाइव · 5",
  six: "सिक्स · 6",
  seven: "सेवन · 7",
  eight: "एट · 8",
  nine: "नाइन · 9",
  ten: "टेन · 10",
  eleven: "इलेवन · 11",
  twelve: "ट्वेल्व · 12",
  thirteen: "थर्टीन · 13",
  fourteen: "फ़ोर्टीन · 14",
  fifteen: "फ़िफ़्टीन · 15",
  sixteen: "सिक्सटीन · 16",
  seventeen: "सेवेन्टीन · 17",
  eighteen: "एटीन · 18",
  nineteen: "नाइनटीन · 19",
  twenty: "ट्वेन्टी · 20",
};

/** English common nouns → Devanagari how we spell them aloud in हिंदी टीटीएस दृश्य में */
const ENGLISH_WORD_GLOSS_DV: Record<string, string> = {
  pomegranate: "पोमग्रेनेट",
  mango: "मैंगो",
  tamarind: "टैमरिंड",
  sugarcane: "शुगरकेन",
  owl: "औल",
  wool: "वूल",
  pigeon: "पिजन",
  rabbit: "रैबिट",
  cow: "काउ",
  clock: "क्लोक",
  spoon: "स्पून",
  umbrella: "अम्बरेला",
  ship: "शिप",
  flag: "फ़्लैग",
  tomato: "टमाटो",
  cart: "कार्ट",
  drum: "ड्रम",
  dhol: "ढोल",
  pond: "पॉन्ड",
  plate: "प्लेट",
  inkpot: "इंकपॉट",
  bow: "बो",
  tap: "टैप",
  kite: "काइट",
  flower: "फ्लावर",
  duck: "डक",
  bear: "बियर",
  fish: "फ़िश",
  vehicle: "व्हिकल",
  chariot: "चैरिअट",
  top: "टॉप",
  forest: "फ़ॉरेस्ट",
  lion: "लायन",
  hexagon: "हैक्सैगॉन",
  apple: "ऐपल",
  elephant: "एलिफ़ैंट",
  lotus: "लोटस",
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[''"`´]/g, "")
    .replace(/\s+/g, " ");
}

/** True if mostly Latin roman word / label we may rewrite */
function mostlyLatinTeachingToken(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 42) return false;
  const lat = (t.match(/[a-z]/gi) ?? []).length;
  const dv = (t.match(SCRIPT_DV) ?? []).length ?? 0;
  return lat > 0 && dv < lat / 2;
}

/**
 * For UI that teaches English equivalents: prefer Devanagari spellings learners read.
 */
export function englishLessonLabelToDevanagari(latinInput: string): string {
  const t = latinInput.trim();
  if (!t) return t;
  const key = normalizeKey(t);
  const compact = key.replace(/\s+/g, "");
  if (ENGLISH_WORD_GLOSS_DV[key]) return ENGLISH_WORD_GLOSS_DV[key];
  if (ENGLISH_WORD_GLOSS_DV[compact]) return ENGLISH_WORD_GLOSS_DV[compact];
  const first = key.split(/\s+/)[0] ?? "";
  if (first && ENGLISH_WORD_GLOSS_DV[first]) return ENGLISH_WORD_GLOSS_DV[first];

  if (!mostlyLatinTeachingToken(t)) return t;

  const kk = normalizeKey(t).replace(/\s/g, "");

  const directWord = ROMAN_SOUND_TO_DV[normalizeKey(t)];
  if (directWord) return directWord.split(" · ")[0] ?? directWord;

  const directKey = ROMAN_SOUND_TO_DV[kk.replace(/[^a-z]/g, "")];
  if (directKey) return directKey.split(" · ")[0] ?? directKey;

  /** split "one · 1" patterns */
  if (/^\d+$/.test(t)) return `${t}`;
  /** short uppercase-like Ka */
  const short = /^[a-z]{1,3}$/.test(kk) ? kk : "";

  const shortMapped = ROMAN_SOUND_TO_DV[short];
  if (shortMapped) return shortMapped.split(" · ")[0] ?? shortMapped;

  /** Title-case first token Ka */
  const firstRomanTok = normalizeKey(t).split(/\s+/)[0] ?? "";

  const firstKey =
    ROMAN_SOUND_TO_DV[firstRomanTok] ?? ROMAN_SOUND_TO_DV[firstRomanTok.toLowerCase()];

  if (firstKey) return firstKey.split(" · ")[0] ?? firstKey;

  return t;
}

/** Lesson option / tap target: render in Devanagari when it's a latin teaching gloss */
export function formatLearningSurfaceText(text: string): string {
  if (!mostlyLatinTeachingToken(text)) return toLatinDigits(text);
  const out = englishLessonLabelToDevanagari(text);
  return toLatinDigits(out);
}
