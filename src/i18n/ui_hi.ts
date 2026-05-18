/** Fixed app chrome — Hindi (Devanagari) only. Lesson JSON text can be mixed; server should prefer Devanagari prompts. */
import { formatLearningSurfaceText } from "./englishInDevanagari";

export const UI = {
  appNameLoading: "अक्षर सेतु",
  homeBrand: "अक्षर सेतु",
  homeTag: "घर पर ही, रोज़ की पढ़ाई",
  starLabel: "तारे",
  levelShort: "स्तर",
  akshar: "अक्षर",
  sankhya: "संख्या",
  parentHeading: "माता–पिता के लिए",
  listenShort: "सुनें",
  listenRepeat: "फिर से सुनें",
  completedSection: "आपने यह पूरा किया",
  correctCount: "सही",
  weakPrefix: "कमज़ोर:",
  nextLessonTitle: "अगला पाठ",
  nextLessonSubtitle:
    "सेतु बच्चे के स्तर के हिसाब से नया विषय तैयार करेगा",
  startNewLesson: "नया पाठ शुरू करें →",
  /** 🔊 इसी वाक्य के लिए (तीर टीटीएस में नहीं) */
  startNewLessonSpeak: "नया पाठ शुरू करें",
  resumeLesson: "पाठ जारी रखें →",
  resumeLessonSpeak: "पाठ जारी रखें",
  lessonLoadFailed:
    "पाठ लोड नहीं हो पाया — सर्वर से जवाब ठीक नहीं आया। फिर से कोशिश करें।",

  /** होम से स्तर-जाँच दोबारा (प्रदर्शन / डेमो के लिए) */
  retakePlacementTest: "स्तर की जाँच फिर से",
  retakePlacementHint:
    "नया स्तर तय होगा और सर्वर पर विद्यार्थी रिपोर्ट अपडेट होगी।",

  /** जब अभी तक होम पर स्तर सहेजा नहीं है */
  homeNoLevelTitle: "पहले स्तर तय करें",
  homeNoLevelSubtitle:
    "कुछ छोटे सवालों से सेतु बच्चे का स्तर समझेगा और सही पाठ चुनेगा।",
  homeTakePlacementTest: "स्तर की जाँच शुरू करें",

  placementListenSummary:
    "सब से पहले हम बच्चे का स्तर समझेंगे। कुछ आसान सवाल होंगे। हिंदी अक्षर और संख्याओं के बारे में। आप बच्चे को फ़ोन दिखाएँ और उस से जवाब चुनवाएँ।",
  placementIntroAdditional:
    "गलत जवाब भी ठीक है — इससे हम सही स्तर समझ पाएँगे।",

  placementWelcomeTitle: "नमस्ते! मैं सेतु हूँ",
  /** स्तर की जाँच के दौरान बिना सहेजे मुख्य पृष्ठ पर */
  placementReturnHome: "← होम पर लौटें",
  placementErrorNetwork:
    "सर्वर से जुड़ नहीं पाए। क्या सर्वर चालू है?",
  placementErrorDetermine:
    "स्तर निर्धारित नहीं हो पाया। फिर से कोशिश करें।",

  placementErrorDetermineTimeoutOrParse:
    "सेतु ने ज़्यादा समय लिया या जवाब ठीक नहीं मिल पाया। थोड़ी देर इंतज़ार करके फिर से जाँच शुरू करें।",

  /** जब सर्वर खाली सारांश भेजे */
  placementResultFallback:
    "जाँच पूरी हो गई। सेतु ने बच्चे के लिए एक स्तर चुना है। अब पहला पाठ शुरू करें।",

  childAge: "बच्चे की उम्र:",
  startTest: "जाँच शुरू करें",
  qProgress: "सवाल",

  analysing: "सेतु सोच रहा है… स्तर समझ रहा है",
  levelReadyTitle: "स्तर तैयार है!",
  strengthsPrefix: "मज़बूती:",
  focusPrefix: "ध्यान दें:",
  firstLessonBtn: "पहला पाठ शुरू करें →",
  firstLessonSpeak: "पहला पाठ शुरू करें",

  okAnswer: "सही!",
  tryAgainComfort: "कोई बात नहीं",
  micNo: "माइक नहीं चला। टैप करें।",
  heardNothing: "आवाज़ नहीं सुनाई दी। फिर से बोलें या टैप करें।",
  serverDown: "सर्वर से बात नहीं हो पाई। टैप करें।",
  cancel: "रद्द करें",

  triesLeft: (n: number) => `प्रयास शेष: ${n}`,

  parentListenCareful: "माता–पिता, ध्यान से सुनें",
  parentDemoPhrase: "ऐसे बोलना है",
  parentDoThis: "यह करें",

  englishMappingHeadingHi: "हिंदी",
  englishMappingHeadingEn: "अंग्रेज़ी (हिंदी लिपि में)",
  continueNext: "आगे बढ़ें →",
  understoodTick: "समझ गया",

  feedbackCorrectTitle: "सही जवाब!",
  feedbackKeepTrying: "कोशिश जारी रखें",
  correctAnswerWas: "सही जवाब:",

  completeTitle: "शाबाश!",
  completeSubtitle: "आज का पूरा हुआ",
  rewardPrefix: "इनाम:",

  goHome: "घर वापस",

  phases: {
    revision: "कल की याद",
    parent_prep: "माता–पिता की तैयारी",
    teaching_literacy: "अक्षर सीखें",
    teaching_numeracy: "संख्या सीखें",
    english_mapping: "अंग्रेज़ी का नक़्श बाँधें",
    practice: "अभ्यास",
    adaptive: "अतिरिक्त अभ्यास",
    complete: "बधाइयाँ!",
  } as Record<string, string>,

  rewardStar: "तारा",

  instructionListenCue: "सुनें",
  speechPressMic: "बोलने के लिए दबाएँ",
  speechTapWhenDone: "बोल चुके? रोक दें",
  speechPreferTap: "बोलने में दिक्कत? टैप करें",

  sessionCompleteSpeak: "शाबाश! पाठ पूरा हो गया।",

  accessibilityPlayAudio: "ऑडियो चलाएँ",

  setuIdle: "सेतु",
  setuHappy: "शाबाश!",
  setuCelebrate: "वाह!",
  setuEncourage: "कोशिश करो!",
  setuSad: "कोई बात नहीं!",
};

/** Engine `skill` ids → Hindi labels for progress / parent UI */
export const SKILL_LABEL_HI: Record<string, string> = {
  letter_recognition: "अक्षर पहचान",
  sound_pronunciation: "उच्चारण",
  word_mapping: "शब्द जोड़",
  number_recognition: "संख्या पहचान",
  counting: "गिनती",
  basic_operations: "सरल जोड़-घटाव",
};

export const skillUiLabel = (skillId: string): string =>
  SKILL_LABEL_HI[skillId] ?? skillId;

export function rewardDisplay(raw: string): string {
  const k = raw.trim().toLowerCase();
  if (k === "star") return UI.rewardStar;
  return formatLearningSurfaceText(raw);
}
