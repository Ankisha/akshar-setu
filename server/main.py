"""
Akshar Setu — FastAPI gateway: Ollama speech + text, optional Google TTS.

Speech-to-text calls Ollama (`POST /v1/audio/transcriptions`); placement and
session generation use `POST /api/chat`. No Hugging Face / local LLM weights.

Run:
    cd server
    pip install -r requirements.txt
    python main.py

Listens on 0.0.0.0:8642 (LAN: http://<your-mac-ip>:8642/transcribe).

Loads `GOOGLE_APPLICATION_CREDENTIALS` from `server/.env.local` then `server/.env`
(copy from `.env.example`). Do not commit `.env.local`.
"""

print("[boot] main.py starting...", flush=True)

import base64
import os
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env.local")
load_dotenv(Path(__file__).resolve().parent / ".env")

# Cloud deployment: write GCP credentials from env var to a temp file
_gcp_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
if _gcp_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
    _tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    _tmp.write(_gcp_json)
    _tmp.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmp.name
from contextlib import asynccontextmanager
from typing import Optional, Tuple

print("[boot] importing fastapi/uvicorn...", flush=True)
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
print("[boot] importing google cloud tts...", flush=True)
try:
    from google.cloud import texttospeech
except Exception as e:
    print(f"[boot] WARNING: google cloud tts import failed: {e}", flush=True)
    texttospeech = None
from pydantic import BaseModel, Field

from llm_content import (
    PLACEMENT_QUESTIONS,
    DetermineLevelRequest,
    GenerateSessionRequest,
    determine_level,
    generate_session,
    llm_health_info,
    normalize_delivered_session,
    ollama_enabled,
    ollama_transcribe_wav,
)
from student_report import (
    ModuleResults,
    init_report_from_placement,
    load_report,
    report_summary_for_llm,
    update_report,
)
from session_cache import (
    cache_session,
    find_cached_session,
    mark_session_complete,
    strip_cache_meta,
)
from tts_teaching_ssml import (
    question_then_letter_hold_ssml,
    single_letter_hold_ssml,
    teaching_plain_text_to_ssml,
)

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8642"))

# Google Cloud Text-to-Speech — Hindi-first for Hinglish (Devanagari + Latin in same string).
# Default: Hindi Neural voice reads mixed script with Hindi speech persona.
# Set use_english_voice on /synthesize (or GOOGLE_TTS_VOICE) for native English only.
#
# Credentials: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
# Optional voice IDs:
#   GOOGLE_TTS_VOICE       — force one voice globally
#   GOOGLE_TTS_VOICE_HI    — Hindi persona (default hi-IN-Neural2-A)
#   GOOGLE_TTS_VOICE_EN    — when use_english_voice=True (default en-IN-Neural2-A)
#   GOOGLE_TTS_VOICE_EN_US — optional override for en-US Neural when language_code=en-US & English persona

tts_client = None


def _locale_prefix_from_voice(voice_name: str) -> str:
    parts = voice_name.split("-")
    if len(parts) >= 3:
        head = f"{parts[0]}-{parts[1]}"
        tail = "-".join(parts[2:])
        if tail.startswith("Neural2") or tail.startswith("Wavenet") or tail.startswith("Standard"):
            return head
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return voice_name


def resolve_tts_voice(
    language_code: str,
    voice_override: Optional[str],
    use_english_voice: bool,
) -> Tuple[str, str]:
    """Return (voice_name, api_language_code). Default Hindi voice for bilingual lesson text."""
    if voice_override:
        vn = voice_override.strip()
        return vn, _locale_prefix_from_voice(vn)

    global_voice = os.environ.get("GOOGLE_TTS_VOICE", "").strip()
    if global_voice:
        return global_voice, _locale_prefix_from_voice(global_voice)

    if not use_english_voice:
        hi = os.environ.get("GOOGLE_TTS_VOICE_HI", "hi-IN-Neural2-A").strip()
        return hi, _locale_prefix_from_voice(hi)

    lc = language_code.strip().replace("_", "-").lower()
    if lc.startswith("en-us"):
        en = os.environ.get(
            "GOOGLE_TTS_VOICE_EN_US",
            os.environ.get("GOOGLE_TTS_VOICE_EN", "en-US-Neural2-F"),
        ).strip()
    else:
        en = os.environ.get("GOOGLE_TTS_VOICE_EN", "en-IN-Neural2-A").strip()
    return en, _locale_prefix_from_voice(en)



def load_tts_client() -> None:
    global tts_client
    if texttospeech is None:
        raise RuntimeError("google-cloud-texttospeech module failed to import")
    tts_client = texttospeech.TextToSpeechClient()
    v_hi, lc_hi = resolve_tts_voice("hi-IN", None, False)
    v_en, lc_en = resolve_tts_voice("en-IN", None, True)
    print(
        "Google Cloud Text-to-Speech ready — default Hindi persona: "
        f"{v_hi} ({lc_hi}); English persona (opt-in): {v_en} ({lc_en})."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global tts_client
    try:
        load_tts_client()
    except Exception as e:
        print(f"TTS unavailable (Google Cloud): {e}")
        tts_client = None
    yield


app = FastAPI(title="Akshar Setu API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language_code: str = "hi-IN"
    """When use_english_voice=True, helps pick en-IN vs en-US Neural voice. Ignored for persona when False."""
    use_english_voice: bool = Field(
        default=False,
        description=(
            "If false (default), use Hindi (hi-IN) neural voice: reads Devanagari + "
            "English letters with Hindi speech. If true, native English neural voice."
        ),
    )
    voice_name: Optional[str] = Field(
        default=None,
        description=(
            "Full Google Cloud voice id (e.g. hi-IN-Neural2-A, hi-IN-Chirp3-HD-Aoede)."
        ),
    )
    speaking_rate: float = Field(default=0.92, ge=0.25, le=4.0)
    pitch: float = Field(default=1.0, ge=-20.0, le=20.0)


def synthesize_text(request: SynthesizeRequest) -> dict:
    assert tts_client is not None

    voice_name, lang_for_api = resolve_tts_voice(
        request.language_code,
        request.voice_name,
        request.use_english_voice,
    )

    ssml_body = teaching_plain_text_to_ssml(request.text)
    question_letter_ssml: str | None = None
    letter_hold_ssml: str | None = None
    if not ssml_body:
        question_letter_ssml = question_then_letter_hold_ssml(request.text)
    if not ssml_body and not question_letter_ssml:
        letter_hold_ssml = single_letter_hold_ssml(request.text)

    if ssml_body:
        synthesis_input = texttospeech.SynthesisInput(ssml=ssml_body)
        teach_rate = min(float(request.speaking_rate), 0.86)
    elif question_letter_ssml:
        synthesis_input = texttospeech.SynthesisInput(ssml=question_letter_ssml)
        teach_rate = min(float(request.speaking_rate), 1.0)
    elif letter_hold_ssml:
        synthesis_input = texttospeech.SynthesisInput(ssml=letter_hold_ssml)
        # Prosody in SSML carries the pacing; avoid double‑slow from global factor
        teach_rate = min(float(request.speaking_rate), 1.0)
    else:
        synthesis_input = texttospeech.SynthesisInput(text=request.text)
        teach_rate = float(request.speaking_rate)

    voice_params = texttospeech.VoiceSelectionParams(
        language_code=lang_for_api,
        name=voice_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=teach_rate,
        pitch=request.pitch,
    )

    started = time.time()
    response = tts_client.synthesize_speech(
        input=synthesis_input,
        voice=voice_params,
        audio_config=audio_config,
    )

    return {
        "audio_base64": base64.b64encode(response.audio_content).decode("utf-8"),
        "mime_type": "audio/mpeg",
        "language_code": lang_for_api,
        "use_english_voice": request.use_english_voice,
        "voice": voice_name,
        "synthesis_time_ms": round((time.time() - started) * 1000),
    }


def prepare_wav_for_ollama(src_path: str) -> str:
    """16 kHz mono PCM WAV for Ollama's transcriptions API."""
    import librosa
    import soundfile as sf

    y, _ = librosa.load(src_path, sr=16_000, mono=True)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    path = tmp.name
    tmp.close()
    sf.write(path, y, 16_000, subtype="PCM_16")
    return path


def transcribe_via_ollama_wav(wav_path: str) -> dict:
    t0 = time.time()
    text = ollama_transcribe_wav(wav_path)
    return {
        "transcript": text,
        "inference_time_ms": round((time.time() - t0) * 1000),
        "backend": "ollama",
    }


def run_transcribe(upload_path: str, _language: str) -> dict:
    if not ollama_enabled():
        raise RuntimeError(
            "OLLAMA_DISABLED is set. Speech transcription requires Ollama; unset OLLAMA_DISABLED."
        )
    wav_path = prepare_wav_for_ollama(upload_path)
    try:
        return transcribe_via_ollama_wav(wav_path)
    finally:
        if os.path.isfile(wav_path):
            os.unlink(wav_path)


@app.post("/transcribe")
async def transcribe_endpoint(
    audio: UploadFile = File(...),
    language: str = Form("Hindi"),
):
    """
    WAV/M4A/WebM upload → transcript via Ollama (same `OLLAMA_MODEL` as text LLM).
    `language` is accepted for API compatibility; Hinglish is handled in the ASR prompt.
    """
    contents = await audio.read()
    suffix = ".wav"
    if audio.filename:
        if audio.filename.endswith(".m4a"):
            suffix = ".m4a"
        elif audio.filename.endswith(".webm"):
            suffix = ".webm"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = run_transcribe(tmp_path, language)
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )
    finally:
        os.unlink(tmp_path)


@app.post("/synthesize")
async def synthesize_endpoint(request: SynthesizeRequest):
    """
    Text → MP3 (**Neural2** / Premium IDs). Hindi-first:

    - **use_english_voice=false** (default): `hi-IN` neural voice — reads Hindi + Latin
      in one utterance with **Hindi speech** (lesson / Hinglish).
    - **use_english_voice=true**: native English neural voice; use `language_code`
      `en-IN` or `en-US` to tune region.

    Credentials: **GOOGLE_APPLICATION_CREDENTIALS** or `gcloud` ADC.
    """
    if tts_client is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Google Cloud TTS is not configured or failed to load."},
        )
    try:
        return JSONResponse(content=synthesize_text(request))
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )


@app.get("/placement-questions")
async def placement_questions_endpoint():
    """Returns the set of diagnostic questions for the placement test."""
    return JSONResponse(content={"questions": PLACEMENT_QUESTIONS})


@app.post("/determine-level")
async def determine_level_endpoint(request: DetermineLevelRequest):
    """Analyse placement answers and assign a level. Also initialises the student report."""
    try:
        result = determine_level(request)
        init_report_from_placement(
            level=result.level,
            literacy_level=result.literacy_level,
            numeracy_level=result.numeracy_level,
        )
        return JSONResponse(content=result.model_dump())
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/generate-session")
async def generate_session_endpoint(request: GenerateSessionRequest):
    """Generate a complete session JSON for the given level.
    Uses session cache (returns saved session if left midway) and
    injects the student report for adaptive content selection."""
    try:
        # 1. Check cache: if an incomplete session exists for these params, return it
        cached = find_cached_session(
            request.level, request.literacy_level, request.numeracy_level,
        )
        if cached is not None:
            print(f"[generate-session] Returning cached session for L{request.level}")
            return JSONResponse(
                content=normalize_delivered_session(strip_cache_meta(cached)),
            )

        # 2. Load student report for adaptive generation
        report = load_report()
        report_text = report_summary_for_llm(report)

        # 3. Generate via LLM (with report context) or fallback
        session = generate_session(request, student_report_text=report_text, report=report)

        # 4. Cache the generated session
        cache_session(
            session, request.level, request.literacy_level, request.numeracy_level,
        )

        return JSONResponse(content=session)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/student-report")
async def get_student_report():
    """Return the current student skill report."""
    try:
        report = load_report()
        return JSONResponse(content=report)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/update-report")
async def update_report_endpoint(results: ModuleResults):
    """Update the student report after a module is completed.
    Tries LLM-based analysis first, falls back to deterministic scoring.
    Also marks the cached session as complete."""
    try:
        updated = update_report(results)
        # Mark the session as complete in cache so a fresh one is generated next time
        mark_session_complete(results.session_id)
        return JSONResponse(content=updated)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/complete-session")
async def complete_session_endpoint(body: dict):
    """Mark a session as complete in cache (lightweight, no report update).
    Expects {"session_id": "..."} in the body."""
    session_id = body.get("session_id", "")
    if not session_id:
        return JSONResponse(status_code=400, content={"error": "session_id required"})
    found = mark_session_complete(session_id)
    return JSONResponse(content={"completed": found, "session_id": session_id})


@app.get("/health")
async def health():
    v_hi = v_en = None
    if tts_client is not None:
        v_hi, _ = resolve_tts_voice("hi-IN", None, False)
        v_en, _ = resolve_tts_voice("en-US", None, True)
    return {
        "status": "ok",
        "speech": {"backend": "ollama"},
        "tts": "google-cloud-texttospeech" if tts_client else "unavailable",
        "tts_google": (
            {"engine": "neural_or_premium", "default_hi_voice": v_hi, "default_en_voice": v_en}
            if tts_client
            else None
        ),
        "llm": llm_health_info(),
    }


# Serve Expo web build as static files (must be AFTER all API routes)
from fastapi.staticfiles import StaticFiles

DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")


if __name__ == "__main__":
    print(f"[boot] Starting uvicorn on {HOST}:{PORT}", flush=True)
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)
