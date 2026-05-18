"""Optional SSML for Hindi teaching demos (paced letter sequences)."""

from __future__ import annotations

import re
from xml.sax.saxutils import escape

_BREAK_BETWEEN_LETTERS_MS = "950ms"
_BREAK_BETWEEN_UNITS_MS = "600ms"
_BREAK_LIGHT_MS = "350ms"

_PROSODY_SLOW_OPEN = '<prosody rate="78%">'
_PROSODY_SLOW_CLOSE = "</prosody>"

_DV_ONE = re.compile(r"^[\u0900-\u097F]$")


def _letter_hold_fragment_for_embed(text: str) -> str | None:
    """Inner SSML (no outer <speak>) for embedding after a spoken question."""
    full = single_letter_hold_ssml(text.strip())
    if not full:
        return None
    opener, closer = "<speak>", "</speak>"
    if not (full.startswith(opener) and full.endswith(closer)):
        return None
    return full[len(opener) : -len(closer)]


def split_question_then_letter_chunk(text: str) -> tuple[str, str] | None:
    """
    Undo ``{question}। {letter_sound}`` used in letter-recognition tap / practice audio.
    """
    t = text.strip()
    if not t:
        return None

    for sep in ("। ", "॥ ", "।", "?"):
        idx = t.rfind(sep)
        if idx <= 0:
            continue
        if sep == "। ":
            pre, post = t[:idx].rstrip(), t[idx + len(sep) :].strip()
        elif sep == "॥ ":
            pre, post = t[:idx].rstrip(), t[idx + len(sep) :].strip()
        elif sep == "।":
            pre, post = t[:idx].rstrip(), t[idx + 1 :].strip()
        else:
            pre, post = t[:idx].rstrip(), t[idx + 1 :].strip().lstrip(" .।")

        if not pre or not post:
            continue
        core = post.replace("ऽ", "")
        if (
            len(core) == 1
            and bool(_DV_ONE.fullmatch(core))
            and single_letter_hold_ssml(post) is not None
        ):
            return pre, post
    return None


def question_then_letter_hold_ssml(text: str) -> str | None:
    """e.g. कौन सा है। कऽ… → question + ~3s elongated letter."""
    pair = split_question_then_letter_chunk(text)
    if not pair:
        return None
    pre, post = pair
    hold_mid = _letter_hold_fragment_for_embed(post)
    if not hold_mid:
        return None
    pre_esc = escape(pre.strip())
    return (
        "<speak>"
        f'<prosody rate="92%">{pre_esc}</prosody>'
        '<break time="480ms"/>'
        f"{hold_mid}"
        "</speak>"
    )


def single_letter_hold_ssml(text: str, target_seconds: float = 3.0) -> str | None:
    """
    Stretch a lone teaching glyph (e.g. क or कऽऽ…) to ~target_seconds wall time by
    replaying slowed prosody with short gaps — what parents expect for "आवाज़ लंबी".
    """
    stripped = text.strip()
    if not stripped or "<speak" in stripped.lower():
        return None
    if " " in stripped:
        return None
    if re.search(r"[।॥,.?!|]", stripped):
        return None
    core = stripped.replace("ऽ", "")
    if len(core) != 1 or not _DV_ONE.fullmatch(core):
        return None
    # Keep server-provided avagrahas or add a thick tail so each rep is audible
    chunk = stripped if "ऽ" in stripped else core + "ऽ" * 14
    esc = escape(chunk)

    # Empirical: 4× ~0.65s at ~38% + 3× 0.32s gap ≈ 3.5s; tune with target_seconds
    if target_seconds <= 2.5:
        reps, gap_ms, rate = 3, 280, "42%"
    elif target_seconds <= 3.5:
        reps, gap_ms, rate = 4, 320, "38%"
    else:
        reps, gap_ms, rate = 5, 350, "36%"

    parts: list[str] = []
    for i in range(reps):
        parts.append(f'<prosody rate="{rate}">{esc}</prosody>')
        if i < reps - 1:
            parts.append(f'<break time="{gap_ms}ms"/>')
    return "<speak>" + "".join(parts) + "</speak>"


def teaching_plain_text_to_ssml(text: str) -> str | None:
    """
    Convert strings like ``क ख ग। तीन।`` into SSML with long pauses between
    consecutive single Devanagari letters (how aksharmala is taught orally).
    """
    stripped = text.strip()
    if not stripped or "<speak" in stripped.lower():
        return None
    if not re.search(r"[\u0900-\u097F]\s+[\u0900-\u097F]", stripped):
        return None

    clauses = [c.strip() for c in re.split(r"\s*[।॥]\s*", stripped) if c.strip()]
    if not clauses:
        return None

    ssml_parts: list[str] = []

    for clause in clauses:
        tokens = clause.split()
        if not tokens:
            continue

        singles = [t for t in tokens if _DV_ONE.fullmatch(t)]
        if len(tokens) >= 2 and len(singles) >= 2 and len(singles) >= (len(tokens) + 1) // 2:
            chunk: list[str] = []
            for i, tok in enumerate(tokens):
                esc = escape(tok)
                if _DV_ONE.fullmatch(tok):
                    chunk.append(_PROSODY_SLOW_OPEN + esc + _PROSODY_SLOW_CLOSE)
                else:
                    chunk.append(esc)
                if i + 1 < len(tokens):
                    nxt = tokens[i + 1]
                    span = _BREAK_BETWEEN_LETTERS_MS if (
                        _DV_ONE.fullmatch(tok) and _DV_ONE.fullmatch(nxt)
                    ) else _BREAK_LIGHT_MS
                    chunk.append(f'<break time="{span}"/>')
            ssml_parts.append("".join(chunk))
        else:
            ssml_parts.append(_PROSODY_SLOW_OPEN + escape(clause) + _PROSODY_SLOW_CLOSE)

    if not ssml_parts:
        return None

    body = f'<break time="{_BREAK_BETWEEN_UNITS_MS}"/>'.join(ssml_parts)
    return f"<speak>{body}<break time=\"220ms\"/></speak>"
