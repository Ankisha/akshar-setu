"""
LLM-powered endpoints for Akshar Setu:
  1. /determine-level  — analyse placement test answers → assign level
  2. /generate-session — given a level + context → produce a full session JSON

Uses Ollama on your laptop (Gemma hosted as e.g. `gemma4:e2b`):
  POST {OLLAMA_BASE_URL}/api/chat  with `{ "model", "messages", "stream": false }`

Configure with env vars (defaults suit local dev):
  OLLAMA_BASE_URL   default http://localhost:11434
  OLLAMA_MODEL      default gemma4:e2b

Set `OLLAMA_DISABLED=1` to skip the LLM and use deterministic fallback only.
"""

from __future__ import annotations

import json
import os
import re

import requests
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

# ─── Ollama ────────────────────────────────────────────────────────

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:e2b")
OLLAMA_TIMEOUT_DETERMINE = float(os.environ.get("OLLAMA_TIMEOUT_DETERMINE", "120"))
OLLAMA_TIMEOUT_GENERATE = float(os.environ.get("OLLAMA_TIMEOUT_GENERATE", "240"))
OLLAMA_ASR_TIMEOUT = float(os.environ.get("OLLAMA_ASR_TIMEOUT", "180"))

# Prompt for hosted Gemma transcription (English / Hindi mix, shared with HF path).
MIXED_ASR_PROMPT = (
    "Transcribe exactly what the speaker said. "
    "Use Devanagari for Hindi words and normal English spelling for English words "
    "(natural Hindi–English / Hinglish mix as spoken). "
    "Do not translate between languages and do not add explanations. "
    "Use ASCII digits for numbers (e.g. 5). "
    "If they say only a letter or sound, output just that letter or sound. "
    "Reply with only the transcription, one line, no quotes."
)


def ollama_enabled() -> bool:
    return os.environ.get("OLLAMA_DISABLED", "").lower() not in ("1", "true", "yes")


def probe_ollama() -> bool:
    try:
        with urlopen(
            Request(f"{OLLAMA_BASE_URL}/api/tags", method="GET"),
            timeout=3,
        ) as resp:
            return 200 <= getattr(resp, "status", 200) < 300
    except Exception:
        return False


def llm_health_info() -> dict:
    return {
        "provider": "ollama",
        "base_url": OLLAMA_BASE_URL,
        "model": OLLAMA_MODEL,
        "enabled": ollama_enabled(),
        "reachable": probe_ollama() if ollama_enabled() else False,
        "audio_transcriptions_url": f"{OLLAMA_BASE_URL}/v1/audio/transcriptions",
    }


def ollama_transcribe_wav(wav_path: str) -> str:
    """
    Sends 16 kHz mono WAV to Ollama's OpenAI-compatible audio transcriptions API.
    Requires a model build that supports audio (e.g. gemma4:e2b with Ollama audio support).
    """
    url = f"{OLLAMA_BASE_URL}/v1/audio/transcriptions"
    with open(wav_path, "rb") as f:
        files = {"file": ("audio.wav", f, "audio/wav")}
        data = {"model": OLLAMA_MODEL, "prompt": MIXED_ASR_PROMPT}
        r = requests.post(url, files=files, data=data, timeout=OLLAMA_ASR_TIMEOUT)
    if r.status_code >= 400:
        raise RuntimeError(f"Ollama ASR HTTP {r.status_code}: {(r.text or '')[:800]}")
    try:
        body = r.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Ollama ASR invalid JSON: {(r.text or '')[:500]}") from exc
    text = body.get("text")
    if text is None:
        text = body.get("transcription")
    return ("" if text is None else str(text)).strip()


def strip_json_fence(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def ollama_chat(prompt: str, timeout: float, temperature: float = 0.3) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": temperature},
    }
    req = Request(
        f"{OLLAMA_BASE_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    msg = data.get("message") or {}
    content = msg.get("content")
    if not isinstance(content, str):
        raise ValueError(f"Unexpected Ollama response shape: {raw[:400]}...")
    return content.strip()


# ─── Request / Response models ──────────────────────────────────────

class PlacementAnswer(BaseModel):
    question_id: str
    question: str
    correct_answer: str
    user_answer: str
    correct: bool


class DetermineLevelRequest(BaseModel):
    answers: list[PlacementAnswer]
    child_age: int = Field(default=5, ge=3, le=8)


class DetermineLevelResponse(BaseModel):
    level: int
    literacy_level: int
    numeracy_level: int
    analysis: str = ""
    parent_guidance: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)


class GenerateSessionRequest(BaseModel):
    level: int = Field(..., ge=1, le=10)
    literacy_level: int = Field(default=1, ge=1, le=10)
    numeracy_level: int = Field(default=1, ge=1, le=10)
    child_age: int = Field(default=5, ge=3, le=8)
    weaknesses: list[str] = Field(default_factory=list)
    previous_concepts: list[str] = Field(default_factory=list)


# ─── Placement test questions (static, used by the app) ──────────

PLACEMENT_QUESTIONS = [
    {
        "id": "p1",
        "type": "tap",
        "question": "यह कौन सा अक्षर है?",
        "show": "अ",
        "options": ["अ", "आ", "इ"],
        "answer": "अ",
        "skill": "letter_recognition",
        "difficulty": 1,
    },
    {
        "id": "p2",
        "type": "tap",
        "question": "यह कौन सा अक्षर है?",
        "show": "क",
        "options": ["क", "ख", "ग"],
        "answer": "क",
        "skill": "letter_recognition",
        "difficulty": 2,
    },
    {
        "id": "p3",
        "type": "tap",
        "question": "यह कौन सा अक्षर है?",
        "show": "म",
        "options": ["म", "न", "ल"],
        "answer": "म",
        "skill": "letter_recognition",
        "difficulty": 3,
    },
    {
        "id": "p4",
        "type": "tap",
        "question": "कमल शब्द में सब से पहले कौन सा अक्षर आता है?",
        "show": "कमल",
        "options": ["क", "म", "ल"],
        "answer": "क",
        "skill": "word_mapping",
        "difficulty": 4,
    },
    {
        "id": "p5",
        "type": "tap",
        "question": "यह कौन सा अंक है?",
        "show": "1",
        "options": ["1", "2", "3"],
        "answer": "1",
        "skill": "number_recognition",
        "difficulty": 1,
    },
    {
        "id": "p6",
        "type": "tap",
        "question": "यह कौन सा अंक है?",
        "show": "5",
        "options": ["4", "5", "6"],
        "answer": "5",
        "skill": "number_recognition",
        "difficulty": 2,
    },
    {
        "id": "p7",
        "type": "tap",
        "question": "नीचे दिए चिन्ह तारों के हैं। सबको मिलाकर कुल कितने तारे हैं?",
        "show": "★★★",
        "options": ["2", "3", "4"],
        "answer": "3",
        "skill": "counting",
        "difficulty": 2,
    },
    {
        "id": "p8",
        "type": "tap",
        "question": "दो और एक को जोड़ने पर फल बताने के लिए सही अंक चुनें।",
        "show": "2 और 1",
        "options": ["2", "3", "4"],
        "answer": "3",
        "skill": "basic_operations",
        "difficulty": 3,
    },
]


# ─── Determine level ────────────────────────────────────────────────

DETERMINE_LEVEL_PROMPT = """You are an educational assessment expert for young Indian children (ages 3-8) learning Hindi literacy and numeracy.

Given the following placement test results, determine the child's level.

Child's age: {age}

Test results:
{results}

Analyse and return a JSON object with these fields:
- "level": overall level 1-10 (1=complete beginner, 5=knows basic consonants + numbers up to 10, 10=advanced)
- "literacy_level": 1-10 for Hindi letters/words only
- "numeracy_level": 1-10 for numbers/counting only
- "analysis": ONE simple paragraph for the parent, **only Hindi in Devanagari** (no English, no Roman Hindi). 2-4 short sentences: what the test suggests about the child, the chosen level in plain words, and encouragement + one practical next step at home. Use Latin digits 0-9 for numbers.
- "parent_guidance": Same message in 1 short sentence in Hindi, OR empty string "" if you put everything in analysis.
- "strengths": array of skill areas the child knows (for the app only, not shown verbatim to parent)
- "weaknesses": array of skill areas needing work (same)

Skills: letter_recognition, sound_pronunciation, word_mapping, number_recognition, counting, basic_operations

Return ONLY the JSON, no markdown fencing."""


def determine_level_via_ollama(req: DetermineLevelRequest) -> DetermineLevelResponse:
    results_text = "\n".join(
        f"- Q: {a.question} | Correct: {a.correct_answer} | Child said: {a.user_answer} | {'✓' if a.correct else '✗'}"
        for a in req.answers
    )
    prompt = DETERMINE_LEVEL_PROMPT.format(age=req.child_age, results=results_text)
    text = ollama_chat(prompt, timeout=OLLAMA_TIMEOUT_DETERMINE, temperature=0.25)
    text = strip_json_fence(text)
    data = json.loads(text)
    return DetermineLevelResponse(**data)


def determine_level_fallback(req: DetermineLevelRequest) -> DetermineLevelResponse:
    """Deterministic fallback when Ollama is unreachable or parsing fails."""
    total = len(req.answers)
    correct = sum(1 for a in req.answers if a.correct)
    ratio = correct / total if total > 0 else 0

    literacy_correct = sum(
        1
        for a in req.answers
        if a.correct
        and ("letter" in (a.question_id or "") or "word" in (a.question_id or "") or a.question_id in ("p1", "p2", "p3", "p4"))
    )
    literacy_total = sum(1 for a in req.answers if a.question_id in ("p1", "p2", "p3", "p4"))
    numeracy_correct = sum(
        1 for a in req.answers if a.correct and a.question_id in ("p5", "p6", "p7", "p8")
    )
    numeracy_total = sum(1 for a in req.answers if a.question_id in ("p5", "p6", "p7", "p8"))

    lit_ratio = literacy_correct / literacy_total if literacy_total > 0 else 0
    num_ratio = numeracy_correct / numeracy_total if numeracy_total > 0 else 0

    literacy_level = max(1, min(10, round(lit_ratio * 6) + 1))
    numeracy_level = max(1, min(10, round(num_ratio * 6) + 1))
    level = max(1, min(10, round(ratio * 6) + 1))

    strengths = []
    weaknesses = []
    if lit_ratio >= 0.75:
        strengths.append("letter_recognition")
    else:
        weaknesses.append("letter_recognition")
    if num_ratio >= 0.75:
        strengths.append("number_recognition")
    else:
        weaknesses.append("number_recognition")

    analysis = (
        f"बच्चे ने {correct} में से {total} सवाल सही किए। सेतु ने समग्र स्तर "
        f"{level} तय किया है। "
    )
    if ratio >= 0.75:
        analysis += (
            "बच्चे की पकड़ अच्छी दिखती है; छोटे पाठों से आगे बढ़ सकते हैं। "
        )
    elif ratio >= 0.5:
        analysis += (
            "कुछ जगह अभी अभ्यास चाहिए—रोज़ थोड़ा समय देकर धीरे-धीरे सीखाएँ। "
        )
    else:
        analysis += (
            "शुरुआत के स्तर से पाठ शुरू करना ठीक रहेगा; बिना जल्दबाज़ी दोहराव कराएँ। "
        )
    analysis += "रोज़ लगभग पंद्रह मिनट शांत माहौल में पढ़ाने की कोशिश करें।"

    parent_guidance = ""

    return DetermineLevelResponse(
        level=level,
        literacy_level=literacy_level,
        numeracy_level=numeracy_level,
        analysis=analysis,
        parent_guidance=parent_guidance,
        strengths=strengths,
        weaknesses=weaknesses,
    )


def determine_level(req: DetermineLevelRequest) -> DetermineLevelResponse:
    if ollama_enabled():
        try:
            return determine_level_via_ollama(req)
        except Exception as e:
            print(f"Ollama determine-level failed, using fallback: {e}")
    return determine_level_fallback(req)


# ─── Generate session ─────────────────────────────────────────────

GENERATE_SESSION_PROMPT = """You are a Hindi Foundational Literacy & Numeracy curriculum designer for Indian children aged {age}.

ABSOLUTE RULE: EVERY string in the output JSON MUST be Hindi Devanagari ONLY. NO English, NO Roman Hindi ANYWHERE except the `english_mapping` field. Use ASCII digits (0-9) for numbers.

Context:
- Level: {level}/10 | Literacy: {literacy_level}/10 | Numeracy: {numeracy_level}/10
- Weak areas: {weaknesses} | Already covered: {previous_concepts}
- Student profile: {student_report}

Pick concepts with score 0 (new) or 1-2 (weak) from profile. Use score 4-5 only as distractors.

PEDAGOGY (follow exactly):
Literacy module: 1) instruction: tell child to look and listen. 2) show: display letter large + audio = LONG elongated vowel/consonant in Devanagari ONLY (many ऽ after the glyph, NEVER Latin letters like "aaaa"). 3) speech: child says the sound; evaluation.type="phonetic", threshold=0.55. 4) tap: 3 letters + spoken question (audio may be Hindi question then letter sound — app will compose).
Numeracy module: 1) instruction: introduce digit. 2) show: display digit large + audio. 3) tap: identify the digit among 3 options. 4) speech: child says the number.
parent_prep: coaching tips — each prep step `"audio"` MUST be EXACT WORD-FOR-WORD IDENTICAL TO that step's `"text"` (never copy `audio_instruction` into a step).

JSON structure (follow EXACTLY):

{{
  "session_id": "generated_{level}",
  "level": {level},
  "meta": {{
    "estimated_duration_minutes": 15,
    "skills_covered": ["letter_recognition", "sound_pronunciation", "number_recognition"]
  }},
  "parent_prep": {{
    "audio_instruction": "<Hindi Devanagari: 2 sentences about today's lesson>",
    "steps": [
      {{"id": "prep_1", "text": "<Hindi coaching tip>", "audio": "<same>"}},
      {{"id": "prep_2", "text": "<Hindi coaching tip>", "audio": "<same>"}}
    ],
    "demo_audio": "<Hindi: model sentence parent says>"
  }},
  "modules": [
    {{
      "type": "literacy",
      "concept": "<one Hindi letter appropriate for literacy_level>",
      "word_example": "<common Hindi word starting with that letter>",
      "english_mapping": "<English COMMON NOUN for word_example only, e.g. Lotus for कमल — NOT roman letter Ka>",
      "steps": [
        {{"id": "lit_1", "actor": "system", "type": "instruction", "text": "<Hindi: intro>", "audio": "<same>"}},
        {{"id": "lit_2", "actor": "system", "type": "show", "content": "<letter>", "ui_hint": "large_letter", "audio": "<elongated sound>", "text": "<letter> — <word>"}},
        {{"id": "lit_3", "actor": "child", "type": "speech", "prompt": "<Hindi: say the sound>", "audio": "<elongated sound>", "expected": ["<letter>", "<letter+matra>"], "evaluation": {{"type": "phonetic", "threshold": 0.55}}, "skill": "sound_pronunciation", "attempts_allowed": 3}},
        {{"id": "lit_4", "actor": "child", "type": "tap", "question": "<Hindi: which is X?>", "audio": "<elongated sound>", "options": ["<correct>", "<w1>", "<w2>"], "answer": "<correct>", "skill": "letter_recognition", "attempts_allowed": 2}}
      ]
    }},
    {{
      "type": "numeracy",
      "concept": "<number appropriate for numeracy_level>",
      "visual_count": "<X items>",
      "english_mapping": "<English word for number>",
      "steps": [
        {{"id": "num_1", "actor": "system", "type": "instruction", "text": "<Hindi: intro>", "audio": "<same>"}},
        {{"id": "num_2", "actor": "system", "type": "show", "content": "<digit>", "ui_hint": "large_number", "audio": "<digit spoken>", "text": "<digit> — <Hindi word>"}},
        {{"id": "num_3", "actor": "child", "type": "tap", "question": "<Hindi: which is X?>", "audio": "<Hindi>", "options": ["<correct>", "<w1>", "<w2>"], "answer": "<correct>", "skill": "number_recognition", "attempts_allowed": 2}},
        {{"id": "num_4", "actor": "child", "type": "speech", "prompt": "<Hindi: say number>", "audio": "<digit>", "expected": ["<digit>", "<hindi word>"], "evaluation": {{"type": "exact_or_keyword"}}, "skill": "number_recognition", "attempts_allowed": 2}}
      ]
    }}
  ],
  "practice": [
    {{"id": "prac_1", "type": "speech", "prompt": "<prompt>", "audio": "<same>", "expected": ["<expected>"], "evaluation": {{"type": "fuzzy", "threshold": 0.7}}, "skill": "sound_pronunciation", "attempts_allowed": 2}},
    {{"id": "prac_2", "type": "tap", "question": "<question>", "audio": "<same>", "options": ["<opt1>", "<opt2>", "<opt3>"], "answer": "<correct>", "skill": "number_recognition", "attempts_allowed": 2}},
    {{"id": "prac_3", "type": "tap", "question": "<question>", "audio": "<same>", "options": ["<opt1>", "<opt2>", "<opt3>"], "answer": "<correct>", "skill": "letter_recognition", "attempts_allowed": 2}}
  ],
  "adaptive": {{
    "enabled": true,
    "trigger_threshold": 2,
    "max_questions": 3,
    "injection_point": "post_practice"
  }},
  "feedback": {{
    "correct": {{"audio": "बहुत अच्छा!", "setu_reaction": "happy"}},
    "incorrect": {{"audio": "फिर से कोशिश करो।", "setu_reaction": "encourage"}}
  }},
  "progress": {{
    "reward": "star",
    "unlock_next_session": true
  }}
}}

Rules:
- Letter progression: अ,आ,इ,ई,उ,ऊ → क,ख,ग,घ → च,छ,ज → ट,ठ,ड → त,थ,द → प,फ,ब,भ,म → य,र,ल,व → श,ष,स,ह
- Numbers: 1-5 → 6-10 → 11-20
- Word examples: common objects (कमल, गाय, आम, etc.)
- ALL text/audio/prompt/question = Hindi Devanagari ONLY. Absolutely no English or Roman Hindi.
- For literacy, `english_mapping` is the ENGLISH WORD for `word_example` (e.g. कमल → Lotus); numeracy english_mapping stays One/Two/English number word.
- Return ONLY valid JSON. No markdown fencing. No explanations."""


HINDI_LETTER_PROGRESSION = [
    "अ",
    "आ",
    "इ",
    "ई",
    "उ",
    "ऊ",
    "क",
    "ख",
    "ग",
    "घ",
    "च",
    "छ",
    "ज",
    "झ",
    "ट",
    "ठ",
    "ड",
    "ढ",
    "त",
    "थ",
    "द",
    "ध",
    "न",
    "प",
    "फ",
    "ब",
    "भ",
    "म",
    "य",
    "र",
    "ल",
    "व",
    "श",
    "ष",
    "स",
    "ह",
]

WORD_EXAMPLES = {
    "अ": "अनार",
    "आ": "आम",
    "इ": "इमली",
    "ई": "ईख",
    "उ": "उल्लू",
    "ऊ": "ऊन",
    "क": "कबूतर",
    "ख": "खरगोश",
    "ग": "गाय",
    "घ": "घड़ी",
    "च": "चम्मच",
    "छ": "छाता",
    "ज": "जहाज़",
    "झ": "झंडा",
    "ट": "टमाटर",
    "ठ": "ठेला",
    "ड": "डमरू",
    "ढ": "ढोल",
    "त": "तालाब",
    "थ": "थाली",
    "द": "दवात",
    "ध": "धनुष",
    "न": "नल",
    "प": "पतंग",
    "फ": "फूल",
    "ब": "बतख",
    "भ": "भालू",
    "म": "मछली",
    "य": "यान",
    "र": "रथ",
    "ल": "लट्टू",
    "व": "वन",
    "श": "शेर",
    "ष": "षट्कोण",
    "स": "सेब",
    "ह": "हाथी",
}

ENGLISH_MAP = {
    "अ": "A",
    "आ": "Aa",
    "इ": "I",
    "ई": "Ee",
    "उ": "U",
    "ऊ": "Oo",
    "क": "Ka",
    "ख": "Kha",
    "ग": "Ga",
    "घ": "Gha",
    "च": "Cha",
    "छ": "Chha",
    "ज": "Ja",
    "झ": "Jha",
    "ट": "Ta",
    "ठ": "Tha",
    "ड": "Da",
    "ढ": "Dha",
    "त": "Ta",
    "थ": "Tha",
    "द": "Da",
    "ध": "Dha",
    "न": "Na",
    "प": "Pa",
    "फ": "Pha",
    "ब": "Ba",
    "भ": "Bha",
    "म": "Ma",
    "य": "Ya",
    "र": "Ra",
    "ल": "La",
    "व": "Va",
    "श": "Sha",
    "ष": "Sha",
    "स": "Sa",
    "ह": "Ha",
}

WORD_ENGLISH_MAP = {
    "अनार": "Pomegranate",
    "आम": "Mango",
    "इमली": "Tamarind",
    "ईख": "Sugarcane",
    "उल्लू": "Owl",
    "ऊन": "Wool",
    "कबूतर": "Pigeon",
    "कमल": "Lotus",
    "खरगोश": "Rabbit",
    "गाय": "Cow",
    "घड़ी": "Clock",
    "चम्मच": "Spoon",
    "छाता": "Umbrella",
    "जहाज़": "Ship",
    "झंडा": "Flag",
    "टमाटर": "Tomato",
    "ठेला": "Cart",
    "डमरू": "Drum",
    "ढोल": "Dhol",
    "तालाब": "Pond",
    "थाली": "Plate",
    "दवात": "Inkpot",
    "धनुष": "Bow",
    "नल": "Tap",
    "पतंग": "Kite",
    "फूल": "Flower",
    "बतख": "Duck",
    "भालू": "Bear",
    "मछली": "Fish",
    "यान": "Vehicle",
    "रथ": "Chariot",
    "लट्टू": "Top",
    "वन": "Forest",
    "शेर": "Lion",
    "षट्कोण": "Hexagon",
    "सेब": "Apple",
    "हाथी": "Elephant",
}

# Elongated pronunciation for TTS — Devanagari avagraha only (Latin "aaaa" reads as "kaka").

ELONGATED_PRONUNCIATION: dict[str, str] = {
    "अ": "अऽऽऽऽऽ",
    "आ": "आऽऽऽऽऽ",
    "इ": "इऽऽऽऽऽ",
    "ई": "ईऽऽऽऽऽ",
    "उ": "उऽऽऽऽऽ",
    "ऊ": "ऊऽऽऽऽऽ",
}
for _cons in "कखगघचछजझटठडढतथदधनपफबभमयरलवशषसह":
    ELONGATED_PRONUNCIATION[_cons] = _cons + "ऽ" * 14

# Phonetic aliases: STT may transcribe elongated sounds as these variants
PHONETIC_ALIASES: dict[str, list[str]] = {
    "अ": ["अ", "आ", "a"],
    "आ": ["आ", "अ", "aa"],
    "इ": ["इ", "ई", "i"],
    "ई": ["ई", "इ", "ee"],
    "उ": ["उ", "ऊ", "u"],
    "ऊ": ["ऊ", "उ", "oo"],
    "क": ["क", "का", "ka", "kaa"],
    "ख": ["ख", "खा", "kha", "khaa"],
    "ग": ["ग", "गा", "ga", "gaa"],
    "घ": ["घ", "घा", "gha", "ghaa"],
    "च": ["च", "चा", "cha", "chaa"],
    "छ": ["छ", "छा", "chha", "chhaa"],
    "ज": ["ज", "जा", "ja", "jaa"],
    "झ": ["झ", "झा", "jha", "jhaa"],
    "ट": ["ट", "टा", "ta", "taa"],
    "ठ": ["ठ", "ठा", "tha", "thaa"],
    "ड": ["ड", "डा", "da", "daa"],
    "ढ": ["ढ", "ढा", "dha", "dhaa"],
    "त": ["त", "ता", "ta", "taa"],
    "थ": ["थ", "था", "tha", "thaa"],
    "द": ["द", "दा", "da", "daa"],
    "ध": ["ध", "धा", "dha", "dhaa"],
    "न": ["न", "ना", "na", "naa"],
    "प": ["प", "पा", "pa", "paa"],
    "फ": ["फ", "फा", "pha", "phaa"],
    "ब": ["ब", "बा", "ba", "baa"],
    "भ": ["भ", "भा", "bha", "bhaa"],
    "म": ["म", "मा", "ma", "maa"],
    "य": ["य", "या", "ya", "yaa"],
    "र": ["र", "रा", "ra", "raa"],
    "ल": ["ल", "ला", "la", "laa"],
    "व": ["व", "वा", "va", "vaa"],
    "श": ["श", "शा", "sha", "shaa"],
    "ष": ["ष", "षा", "sha", "shaa"],
    "स": ["स", "सा", "sa", "saa"],
    "ह": ["ह", "हा", "ha", "haa"],
}


def _elongated_for_letter(ch: str) -> str:
    if len(ch) != 1:
        return ch
    return ELONGATED_PRONUNCIATION.get(ch, ch + "ऽ" * 12)


def _normalize_parent_prep(pp: dict) -> None:
    steps = pp.get("steps")
    if not isinstance(steps, list):
        return
    for item in steps:
        if not isinstance(item, dict):
            continue
        text = (item.get("text") or "").strip()
        if not text:
            continue
        item["audio"] = text


_NUMERIC_DISTRACT_DELTAS = (1, -1, 2, -2, 3, -3, 4)


def _dedupe_options(answer: str, options: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in options:
        if not isinstance(raw, str):
            continue
        v = raw.strip()
        if not v or v in seen:
            continue
        seen.add(v)
        cleaned.append(v)
    if answer and answer not in seen:
        cleaned.insert(0, answer)
        seen.add(answer)
    if answer and answer.isdigit():
        try:
            base = int(answer)
        except ValueError:
            base = None
        if base is not None:
            for delta in _NUMERIC_DISTRACT_DELTAS:
                if len(cleaned) >= 3:
                    break
                cand = base + delta
                if cand < 0:
                    continue
                s = str(cand)
                if s in seen:
                    continue
                seen.add(s)
                cleaned.append(s)
    while len(cleaned) < 3:
        filler = f"_x{len(cleaned)}"
        if filler in seen:
            filler += "_"
        cleaned.append(filler)
        seen.add(filler)
    return cleaned[:3]


def _normalize_options_in_steps(steps: list) -> None:
    for s in steps or []:
        if not isinstance(s, dict):
            continue
        if s.get("type") != "tap":
            continue
        opts = s.get("options")
        ans = s.get("answer", "")
        if isinstance(opts, list):
            s["options"] = _dedupe_options(str(ans).strip(), opts)


def normalize_delivered_session(session: dict) -> dict:
    """
    Patch common LLM/cached faults: duplicated parent_prep audio, wrong english_mapping
    (letter roman instead of word meaning), doubled glyphs for TTS, duplicate tap options,
    etc.
    """
    pp = session.get("parent_prep")
    if isinstance(pp, dict):
        _normalize_parent_prep(pp)

    for mod in session.get("modules") or []:
        if isinstance(mod, dict):
            _normalize_options_in_steps(mod.get("steps") or [])
    _normalize_options_in_steps(session.get("practice") or [])

    for mod in session.get("modules") or []:
        if not isinstance(mod, dict):
            continue

        if mod.get("type") == "literacy":
            concept = (mod.get("concept") or "").strip()
            wex = (mod.get("word_example") or "").strip()
            if wex and wex in WORD_ENGLISH_MAP:
                mod["english_mapping"] = WORD_ENGLISH_MAP[wex]

            if len(concept) == 1:
                elong = _elongated_for_letter(concept)
                for step in mod.get("steps") or []:
                    if not isinstance(step, dict):
                        continue
                    ty = step.get("type")
                    if ty == "show":
                        step["audio"] = elong
                    elif ty == "speech":
                        step["audio"] = elong
                    elif ty == "tap" and step.get("skill") == "letter_recognition":
                        q = (step.get("question") or "").strip()
                        step["audio"] = f"{q}। {elong}" if q else elong

    first_letter: str | None = None
    for mod in session.get("modules") or []:
        if isinstance(mod, dict) and mod.get("type") == "literacy":
            c = (mod.get("concept") or "").strip()
            if len(c) == 1:
                first_letter = c
                break

    if first_letter:
        pr_elong = _elongated_for_letter(first_letter)
        for step in session.get("practice") or []:
            if not isinstance(step, dict):
                continue
            if step.get("type") == "speech" and step.get("skill") == "sound_pronunciation":
                step["audio"] = pr_elong
            elif step.get("type") == "tap" and step.get("skill") == "letter_recognition":
                pq = (step.get("question") or "").strip()
                step["audio"] = f"{pq}। {pr_elong}" if pq else pr_elong

    return session


def generate_session_via_ollama(req: GenerateSessionRequest, student_report_text: str = "") -> dict:
    prompt = GENERATE_SESSION_PROMPT.format(
        age=req.child_age,
        level=req.level,
        literacy_level=req.literacy_level,
        numeracy_level=req.numeracy_level,
        weaknesses=", ".join(req.weaknesses) or "none identified",
        previous_concepts=", ".join(req.previous_concepts) or "none yet",
        student_report=student_report_text or "No report available yet.",
    )

    text = ollama_chat(prompt, timeout=OLLAMA_TIMEOUT_GENERATE, temperature=0.35)
    text = strip_json_fence(text)
    return json.loads(text)


def generate_session_fallback(req: GenerateSessionRequest, report: dict | None = None) -> dict:
    """Deterministic session generator for demo when Ollama is unavailable.
    Uses student report to pick adaptive content when available."""
    # Pick letter: prefer uncovered (score=0) or weak (score 1-2) from report
    letter = None
    if report:
        char_scores = report.get("hindi_characters", {})
        for ch in HINDI_LETTER_PROGRESSION:
            if char_scores.get(ch, 0) == 0:
                letter = ch
                break
        if letter is None:
            weak = [(ch, sc) for ch, sc in char_scores.items()
                    if 0 < sc <= 2 and ch in HINDI_LETTER_PROGRESSION]
            if weak:
                weak.sort(key=lambda x: x[1])
                letter = weak[0][0]
    if letter is None:
        letter = HINDI_LETTER_PROGRESSION[min(req.literacy_level - 1, len(HINDI_LETTER_PROGRESSION) - 1)]
    lit_idx = HINDI_LETTER_PROGRESSION.index(letter) if letter in HINDI_LETTER_PROGRESSION else 0
    word = WORD_EXAMPLES.get(letter, f"{letter}...")
    eng = WORD_ENGLISH_MAP.get(word, ENGLISH_MAP.get(letter, letter))
    elongated = ELONGATED_PRONUNCIATION.get(letter, letter)
    phonetic_expected = PHONETIC_ALIASES.get(letter, [letter, eng.lower()])

    # Pick number: prefer uncovered or weak from report
    number = None
    if report:
        num_scores = report.get("numbers", {})
        for n_str in [str(i) for i in range(1, 11)]:
            if num_scores.get(n_str, 0) == 0:
                number = int(n_str)
                break
        if number is None:
            weak_nums = [(n_str, sc) for n_str, sc in num_scores.items()
                         if 0 < sc <= 2]
            if weak_nums:
                weak_nums.sort(key=lambda x: x[1])
                number = int(weak_nums[0][0])
    if number is None:
        number = min(req.numeracy_level + 1, 20)
    number_str = str(number)
    _eng_words = [
        "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
        "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
        "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
    ]
    _hi_words = [
        "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात",
        "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह",
        "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस",
    ]
    number_eng = _eng_words[min(number, 20)]
    number_hi = _hi_words[min(number, 20)]

    lit_distractors = []
    for offset in [1, 2]:
        idx = (lit_idx + offset) % len(HINDI_LETTER_PROGRESSION)
        lit_distractors.append(HINDI_LETTER_PROGRESSION[idx])

    _distract_pool: list[str] = []
    for delta in (1, -1, 2, -2, 3):
        cand = number + delta
        if cand < 0 or cand == number:
            continue
        s = str(cand)
        if s == number_str or s in _distract_pool:
            continue
        _distract_pool.append(s)
        if len(_distract_pool) == 2:
            break
    num_distractors = _distract_pool

    return {
        "session_id": f"generated_{req.level}",
        "level": req.level,
        "meta": {
            "estimated_duration_minutes": 15,
            "skills_covered": ["letter_recognition", "sound_pronunciation", "number_recognition"],
        },
        "parent_prep": {
            "audio_instruction": (
                f"आज हम देखेंगे अक्षर '{letter}' और संख्या {number_str}। "
                "बच्चे के साथ धीमे रहें और हिम्मत बनाए रखें।"
            ),
            "steps": [
                {
                    "id": "prep_1",
                    "text": f"अक्षर '{letter}' साफ़ दिखाएँ और ज़रूर हो तो बच्चे की उंगली से इशारा करके नाम कराएँ।",
                    "audio": f"अक्षर '{letter}' साफ़ दिखाएँ और ज़रूर हो तो बच्चे की उंगली से इशारा करके नाम कराएँ।",
                },
                {
                    "id": "prep_2",
                    "text": "फिर धीरे से स्वयं बोलकर दिखाएँ; बिना जल्दी के फिराने को बोलें।",
                    "audio": "फिर धीरे से स्वयं बोलकर दिखाएँ; बिना जल्दी के फिराने को बोलें।",
                },
            ],
            "demo_audio": f"ऐसे बोलें: यह '{letter}' है। अब मेरे संग फिराइए—'{letter}'।",
        },
        "modules": [
            {
                "type": "literacy",
                "concept": letter,
                "word_example": word,
                "english_mapping": eng,
                "steps": [
                    {
                        "id": "lit_1",
                        "actor": "system",
                        "type": "instruction",
                        "text": f"ध्यान से देखो और सुनो: यह अक्षर '{letter}' है।",
                        "audio": f"ध्यान से देखो और सुनो: यह अक्षर '{letter}' है।",
                    },
                    {
                        "id": "lit_2",
                        "actor": "system",
                        "type": "show",
                        "content": letter,
                        "ui_hint": "large_letter",
                        "audio": elongated,
                        "text": f"{letter} — {word}",
                    },
                    {
                        "id": "lit_3",
                        "actor": "child",
                        "type": "speech",
                        "prompt": f"अब आप '{letter}' बोलो — धीरे से, लंबा खींचकर।",
                        "audio": elongated,
                        "expected": phonetic_expected,
                        "evaluation": {"type": "phonetic", "threshold": 0.55},
                        "skill": "sound_pronunciation",
                        "attempts_allowed": 3,
                    },
                    {
                        "id": "lit_4",
                        "actor": "child",
                        "type": "tap",
                        "question": f"कौन सा अक्षर '{letter}' है? टैप करो।",
                        "audio": elongated,
                        "options": [letter] + lit_distractors,
                        "answer": letter,
                        "skill": "letter_recognition",
                        "attempts_allowed": 2,
                    },
                ],
            },
            {
                "type": "numeracy",
                "concept": number_str,
                "visual_count": f"{number_str} चिह्न",
                "english_mapping": number_eng,
                "steps": [
                    {
                        "id": "num_1",
                        "actor": "system",
                        "type": "instruction",
                        "text": f"ध्यान से देखो: यह अंक {number_str} है।",
                        "audio": f"ध्यान से देखो: यह अंक {number_str} है।",
                    },
                    {
                        "id": "num_2",
                        "actor": "system",
                        "type": "show",
                        "content": number_str,
                        "ui_hint": "large_number",
                        "audio": number_hi,
                        "text": f"{number_str} — {number_hi}",
                    },
                    {
                        "id": "num_3",
                        "actor": "child",
                        "type": "tap",
                        "question": f"नीचे कौन सा अंक {number_str} है? टैप करो।",
                        "audio": f"नीचे कौन सा अंक {number_str} है? टैप करो।",
                        "options": [number_str] + num_distractors,
                        "answer": number_str,
                        "skill": "number_recognition",
                        "attempts_allowed": 2,
                    },
                    {
                        "id": "num_4",
                        "actor": "child",
                        "type": "speech",
                        "prompt": f"अब '{number_hi}' बोलो।",
                        "audio": number_hi,
                        "expected": [number_str, number_hi],
                        "evaluation": {"type": "exact_or_keyword"},
                        "skill": "number_recognition",
                        "attempts_allowed": 2,
                    },
                ],
            },
        ],
        "practice": [
            {
                "id": "prac_1",
                "type": "speech",
                "prompt": f"'{letter}' की आवाज़ फिर से बोलो — लंबा खींचकर।",
                "audio": elongated,
                "expected": phonetic_expected,
                "evaluation": {"type": "phonetic", "threshold": 0.55},
                "skill": "sound_pronunciation",
                "attempts_allowed": 3,
            },
            {
                "id": "prac_2",
                "type": "tap",
                "question": f"संख्या {number_str} कहाँ है? टैप करो।",
                "audio": f"संख्या {number_str} कहाँ है? टैप करो।",
                "options": [number_str] + num_distractors,
                "answer": number_str,
                "skill": "number_recognition",
                "attempts_allowed": 2,
            },
            {
                "id": "prac_3",
                "type": "tap",
                "question": f"'{letter}' वाला अक्षर कौन सा है? टैप करो।",
                "audio": elongated,
                "options": [letter] + lit_distractors,
                "answer": letter,
                "skill": "letter_recognition",
                "attempts_allowed": 2,
            },
        ],
        "adaptive": {"enabled": True, "trigger_threshold": 2, "max_questions": 3, "injection_point": "post_practice"},
        "feedback": {
            "correct": {"audio": "बहुत अच्छा!", "setu_reaction": "happy"},
            "incorrect": {"audio": "फिर से कोशिश करो।", "setu_reaction": "encourage"},
        },
        "progress": {"reward": "star", "unlock_next_session": True},
    }


def generate_session(req: GenerateSessionRequest, student_report_text: str = "", report: dict | None = None) -> dict:
    if ollama_enabled():
        try:
            data = generate_session_via_ollama(req, student_report_text)
            return normalize_delivered_session(data)
        except Exception as e:
            print(f"Ollama generate-session failed, using fallback: {e}")
    return normalize_delivered_session(generate_session_fallback(req, report))
