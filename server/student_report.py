"""
Student Report: persistent per-student skill profile used by the adaptive
content generator.

Storage: a single JSON file on disk (server/data/student_report.json).
No database needed for the single-student MVP.

Schema
------
{
  "level": 1,                        # overall level 1-10
  "literacy_level": 1,               # 1-10
  "numeracy_level": 1,               # 1-10
  "hindi_characters": {              # 36 standard characters
    "अ": 0, "आ": 0, ...             # score 0-5 (0 = not yet covered)
  },
  "numbers": {                       # 1-10
    "1": 0, "2": 0, ...             # score 0-5
  },
  "addition_facts": {                # single-digit sums a+b where a<=b
    "1+1": 0, "1+2": 0, ...        # score 0-5 (0 = not yet covered)
  },
  "updated_at": "2026-05-03T15:00:00"
}

The report is:
  - initialised after placement
  - read before every /generate-session to feed the LLM
  - updated after each completed module via LLM analysis + fallback
"""

from __future__ import annotations

import copy
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parent / "data"
REPORT_PATH = DATA_DIR / "student_report.json"

HINDI_CHARACTERS = [
    "अ", "आ", "इ", "ई", "उ", "ऊ",
    "क", "ख", "ग", "घ",
    "च", "छ", "ज", "झ",
    "ट", "ठ", "ड", "ढ",
    "त", "थ", "द", "ध", "न",
    "प", "फ", "ब", "भ", "म",
    "य", "र", "ल", "व",
    "श", "ष", "स", "ह",
]

NUMBERS_1_TO_10 = [str(n) for n in range(1, 11)]

ADDITION_FACTS = [
    f"{a}+{b}" for a in range(1, 10) for b in range(a, 10) if a + b <= 10
]


def _empty_report() -> dict:
    return {
        "level": 1,
        "literacy_level": 1,
        "numeracy_level": 1,
        "hindi_characters": {ch: 0 for ch in HINDI_CHARACTERS},
        "numbers": {n: 0 for n in NUMBERS_1_TO_10},
        "addition_facts": {f: 0 for f in ADDITION_FACTS},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def load_report() -> dict:
    if REPORT_PATH.exists():
        try:
            data = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
            report = _empty_report()
            report["level"] = data.get("level", 1)
            report["literacy_level"] = data.get("literacy_level", 1)
            report["numeracy_level"] = data.get("numeracy_level", 1)
            report["updated_at"] = data.get("updated_at", report["updated_at"])
            for ch in HINDI_CHARACTERS:
                report["hindi_characters"][ch] = _clamp(
                    data.get("hindi_characters", {}).get(ch, 0)
                )
            for n in NUMBERS_1_TO_10:
                report["numbers"][n] = _clamp(
                    data.get("numbers", {}).get(n, 0)
                )
            for f in ADDITION_FACTS:
                report["addition_facts"][f] = _clamp(
                    data.get("addition_facts", {}).get(f, 0)
                )
            return report
        except Exception as e:
            print(f"[student_report] Failed to load report, starting fresh: {e}")
    return _empty_report()


def save_report(report: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    report["updated_at"] = datetime.now(timezone.utc).isoformat()
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _clamp(val: int | float, lo: int = 0, hi: int = 5) -> int:
    try:
        return max(lo, min(hi, int(val)))
    except (TypeError, ValueError):
        return 0


def init_report_from_placement(
    level: int,
    literacy_level: int,
    numeracy_level: int,
) -> dict:
    """Create (or reset) the report after placement test."""
    report = _empty_report()
    report["level"] = max(1, min(10, level))
    report["literacy_level"] = max(1, min(10, literacy_level))
    report["numeracy_level"] = max(1, min(10, numeracy_level))
    save_report(report)
    return report


def report_summary_for_llm(report: dict) -> str:
    """Compact text representation injected into the session-generation prompt."""
    lines = [
        f"Level: {report['level']} | Literacy: {report['literacy_level']}/10 | Numeracy: {report['numeracy_level']}/10",
        "",
        "Hindi character scores (0=not covered, 1-5=mastery):",
    ]
    covered_chars = {
        ch: sc for ch, sc in report["hindi_characters"].items() if sc > 0
    }
    uncovered_chars = [
        ch for ch, sc in report["hindi_characters"].items() if sc == 0
    ]
    if covered_chars:
        lines.append(
            "  " + ", ".join(f"{ch}={sc}" for ch, sc in covered_chars.items())
        )
    lines.append(f"  Not yet covered ({len(uncovered_chars)}): {' '.join(uncovered_chars[:12])}{'…' if len(uncovered_chars)>12 else ''}")

    lines.append("")
    lines.append("Number scores (1-10):")
    lines.append(
        "  " + ", ".join(
            f"{n}={report['numbers'][n]}" for n in NUMBERS_1_TO_10
        )
    )

    covered_add = {
        f: sc for f, sc in report["addition_facts"].items() if sc > 0
    }
    if covered_add:
        lines.append("")
        lines.append("Addition facts covered:")
        lines.append(
            "  " + ", ".join(f"{f}={sc}" for f, sc in covered_add.items())
        )

    weak_chars = [ch for ch, sc in report["hindi_characters"].items() if 0 < sc <= 2]
    weak_nums = [n for n, sc in report["numbers"].items() if 0 < sc <= 2]
    if weak_chars or weak_nums:
        lines.append("")
        lines.append("Weak areas needing reinforcement:")
        if weak_chars:
            lines.append(f"  Characters: {', '.join(weak_chars)}")
        if weak_nums:
            lines.append(f"  Numbers: {', '.join(weak_nums)}")

    return "\n".join(lines)


# ─── LLM-based report update ────────────────────────────────────────


UPDATE_REPORT_PROMPT = """You are an educational assessment engine for a Hindi literacy and numeracy app for children aged 3-8.

Current student report:
{report_summary}

The student just completed a learning module. Here are the results:
{module_results}

Based on these results, update the student's skill scores.

Rules:
- Only update scores for characters/numbers/facts that were actually tested or practiced in this module.
- Score scale: 0=not covered, 1=introduced but struggled, 2=recognized with help, 3=can do with some mistakes, 4=mostly correct, 5=mastered.
- If a character/number was correct on first attempt, increase score by 1 (max 5).
- If incorrect on all attempts, decrease score by 1 (min 1 if already introduced, never go to 0 from >0).
- If the student got it right after retry, keep score the same or +1 if score was low.
- Update level/literacy_level/numeracy_level only if there's strong evidence of improvement (many 4-5 scores).

Return ONLY a JSON object with these fields (include only items that changed):
{{
  "level": <int 1-10 or null if unchanged>,
  "literacy_level": <int 1-10 or null if unchanged>,
  "numeracy_level": <int 1-10 or null if unchanged>,
  "hindi_characters": {{"<char>": <new_score>, ...}},
  "numbers": {{"<num>": <new_score>, ...}},
  "addition_facts": {{"<fact>": <new_score>, ...}}
}}

Return ONLY the JSON, no markdown fencing or explanation."""


class ModuleStepResult(BaseModel):
    step_id: str
    step_type: str  # tap, speech, show, instruction
    skill: str = ""
    correct: bool | None = None
    user_answer: str = ""
    correct_answer: str = ""
    attempts_used: int = 1
    attempts_allowed: int = 2


class ModuleResults(BaseModel):
    """Sent by the client after completing a session."""
    session_id: str
    module_type: str = ""  # literacy, numeracy, practice
    concept: str = ""      # the letter or number taught
    step_results: list[ModuleStepResult] = Field(default_factory=list)


def _format_module_results(results: ModuleResults) -> str:
    lines = [
        f"Session: {results.session_id}",
        f"Module type: {results.module_type}, Concept: {results.concept}",
        "",
        "Step results:",
    ]
    for sr in results.step_results:
        mark = "✓" if sr.correct else ("✗" if sr.correct is False else "—")
        lines.append(
            f"  {sr.step_id} ({sr.step_type}, skill={sr.skill}): "
            f"{mark} answer={sr.user_answer!r} expected={sr.correct_answer!r} "
            f"attempts={sr.attempts_used}/{sr.attempts_allowed}"
        )
    return "\n".join(lines)


def update_report_via_llm(report: dict, results: ModuleResults) -> dict:
    """Call Ollama to analyse module results and return updated report."""
    from llm_content import ollama_chat, strip_json_fence, ollama_enabled, OLLAMA_TIMEOUT_DETERMINE

    if not ollama_enabled():
        raise RuntimeError("Ollama disabled")

    prompt = UPDATE_REPORT_PROMPT.format(
        report_summary=report_summary_for_llm(report),
        module_results=_format_module_results(results),
    )

    text = ollama_chat(prompt, timeout=OLLAMA_TIMEOUT_DETERMINE, temperature=0.2)
    text = strip_json_fence(text)
    delta = json.loads(text)
    return _apply_delta(report, delta)


def update_report_fallback(report: dict, results: ModuleResults) -> dict:
    """Deterministic fallback: adjust scores based on correctness."""
    updated = copy.deepcopy(report)

    for sr in results.step_results:
        if sr.correct is None:
            continue

        # Determine which score bucket this step targets
        target_char = None
        target_num = None
        target_add = None

        concept = results.concept.strip()

        if sr.skill in ("letter_recognition", "sound_pronunciation", "word_mapping"):
            # The concept or correct_answer might be a Hindi character
            candidate = sr.correct_answer.strip() or concept
            if candidate in updated["hindi_characters"]:
                target_char = candidate
        elif sr.skill in ("number_recognition", "counting"):
            candidate = sr.correct_answer.strip() or concept
            if candidate in updated["numbers"]:
                target_num = candidate
        elif sr.skill == "basic_operations":
            # Try to parse "a + b" from the question
            match = re.search(r"(\d)\s*\+\s*(\d)", sr.correct_answer or "")
            if match:
                a, b = sorted([int(match.group(1)), int(match.group(2))])
                fact = f"{a}+{b}"
                if fact in updated["addition_facts"]:
                    target_add = fact

        # Apply score change
        if target_char:
            old = updated["hindi_characters"][target_char]
            updated["hindi_characters"][target_char] = _adjust_score(
                old, sr.correct, sr.attempts_used, sr.attempts_allowed
            )
        if target_num:
            old = updated["numbers"][target_num]
            updated["numbers"][target_num] = _adjust_score(
                old, sr.correct, sr.attempts_used, sr.attempts_allowed
            )
        if target_add:
            old = updated["addition_facts"][target_add]
            updated["addition_facts"][target_add] = _adjust_score(
                old, sr.correct, sr.attempts_used, sr.attempts_allowed
            )

    # Possibly bump levels if many high scores
    _maybe_bump_levels(updated)

    return updated


def _adjust_score(
    old: int, correct: bool, attempts_used: int, attempts_allowed: int
) -> int:
    if old == 0:
        # First encounter
        if correct and attempts_used == 1:
            return 3
        elif correct:
            return 2
        else:
            return 1
    if correct:
        if attempts_used == 1:
            return min(5, old + 1)
        return min(5, old)  # got it eventually, hold steady
    # Incorrect on all attempts
    return max(1, old - 1)


def _maybe_bump_levels(report: dict) -> None:
    char_scores = [s for s in report["hindi_characters"].values() if s > 0]
    num_scores = [s for s in report["numbers"].values() if s > 0]

    if char_scores:
        avg_lit = sum(char_scores) / len(char_scores)
        covered_ratio = len(char_scores) / len(HINDI_CHARACTERS)
        new_lit = max(1, min(10, round(avg_lit * 1.2 + covered_ratio * 3)))
        if new_lit > report["literacy_level"]:
            report["literacy_level"] = new_lit

    if num_scores:
        avg_num = sum(num_scores) / len(num_scores)
        covered_ratio = len(num_scores) / len(NUMBERS_1_TO_10)
        new_num = max(1, min(10, round(avg_num * 1.2 + covered_ratio * 3)))
        if new_num > report["numeracy_level"]:
            report["numeracy_level"] = new_num

    report["level"] = max(
        1,
        min(10, round((report["literacy_level"] + report["numeracy_level"]) / 2)),
    )


def _apply_delta(report: dict, delta: dict) -> dict:
    """Merge LLM-produced delta into the existing report, clamping values."""
    updated = copy.deepcopy(report)

    if delta.get("level") is not None:
        updated["level"] = max(1, min(10, int(delta["level"])))
    if delta.get("literacy_level") is not None:
        updated["literacy_level"] = max(1, min(10, int(delta["literacy_level"])))
    if delta.get("numeracy_level") is not None:
        updated["numeracy_level"] = max(1, min(10, int(delta["numeracy_level"])))

    for ch, sc in (delta.get("hindi_characters") or {}).items():
        if ch in updated["hindi_characters"]:
            updated["hindi_characters"][ch] = _clamp(sc)

    for n, sc in (delta.get("numbers") or {}).items():
        if n in updated["numbers"]:
            updated["numbers"][n] = _clamp(sc)

    for f, sc in (delta.get("addition_facts") or {}).items():
        if f in updated["addition_facts"]:
            updated["addition_facts"][f] = _clamp(sc)

    return updated


def update_report(results: ModuleResults) -> dict:
    """Main entry: load report → try LLM update → fallback → save."""
    report = load_report()
    old_report = copy.deepcopy(report)

    try:
        updated = update_report_via_llm(report, results)
    except Exception as e:
        print(f"[student_report] LLM update failed, using fallback: {e}")
        try:
            updated = update_report_fallback(report, results)
        except Exception as e2:
            print(f"[student_report] Fallback also failed, keeping old report: {e2}")
            updated = old_report

    save_report(updated)
    return updated
