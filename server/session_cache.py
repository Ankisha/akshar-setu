"""
Session cache: save generated session JSON so that if a user leaves
midway, the same session is served on next request instead of calling
the LLM again.

Storage: server/data/sessions/<session_id>.json

Lifecycle
---------
1. /generate-session: before calling LLM, check if there's a cached
   incomplete session for the same level + parameters.
2. If found and not marked complete → return it.
3. If not found → generate via LLM/fallback → cache it.
4. /complete-session (or /update-report): mark the cached session as
   complete so next request generates fresh content.
"""

from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
SESSIONS_DIR = DATA_DIR / "sessions"


def _cache_key(level: int, literacy_level: int, numeracy_level: int) -> str:
    """Deterministic key from the generation parameters that matter."""
    raw = f"L{level}_lit{literacy_level}_num{numeracy_level}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _session_path(cache_key: str) -> Path:
    return SESSIONS_DIR / f"{cache_key}.json"


def find_cached_session(
    level: int,
    literacy_level: int,
    numeracy_level: int,
) -> dict | None:
    """Return a cached incomplete session if one exists, else None."""
    key = _cache_key(level, literacy_level, numeracy_level)
    path = _session_path(key)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("_cache_meta", {}).get("completed", False):
            return None
        return data
    except Exception as e:
        print(f"[session_cache] Failed to load cached session {key}: {e}")
        return None


def cache_session(
    session: dict,
    level: int,
    literacy_level: int,
    numeracy_level: int,
) -> dict:
    """Save a generated session to disk. Returns the session with cache metadata."""
    key = _cache_key(level, literacy_level, numeracy_level)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    session["_cache_meta"] = {
        "cache_key": key,
        "completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "literacy_level": literacy_level,
        "numeracy_level": numeracy_level,
    }

    path = _session_path(key)
    path.write_text(
        json.dumps(session, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return session


def mark_session_complete(session_id: str) -> bool:
    """Mark cached session(s) with matching session_id as complete.
    Returns True if any file was updated."""
    if not SESSIONS_DIR.exists():
        return False

    found = False
    for path in SESSIONS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("session_id") == session_id:
                meta = data.get("_cache_meta", {})
                meta["completed"] = True
                meta["completed_at"] = datetime.now(timezone.utc).isoformat()
                data["_cache_meta"] = meta
                path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                found = True
        except Exception:
            continue
    return found


def mark_complete_by_params(
    level: int,
    literacy_level: int,
    numeracy_level: int,
) -> bool:
    """Mark the session for these specific params as complete."""
    key = _cache_key(level, literacy_level, numeracy_level)
    path = _session_path(key)
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        meta = data.get("_cache_meta", {})
        meta["completed"] = True
        meta["completed_at"] = datetime.now(timezone.utc).isoformat()
        data["_cache_meta"] = meta
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return True
    except Exception:
        return False


def strip_cache_meta(session: dict) -> dict:
    """Return a copy without internal _cache_meta (for API responses)."""
    out = {k: v for k, v in session.items() if k != "_cache_meta"}
    return out
