# Akshar Setu — Backend server

A lightweight **FastAPI** server that talks to **Ollama** for everything model-related:

- **Speech-to-text** — `POST /transcribe` → Ollama OpenAI-compatible `POST /v1/audio/transcriptions` (same `OLLAMA_MODEL` as chat), with Hindi–English (Hinglish) prompting in code.
- **Placement + sessions** — `/determine-level`, `/generate-session` → Ollama `POST /api/chat`.

**Google Cloud Text-to-Speech** (`/synthesize`) uses explicit **Neural2** voices by default (`hi-IN-Neural2-A`, `en-IN-Neural2-A`) — much less “robotic” than Standard. You can opt into **Premium** voices (e.g. **Chirp3 HD**) via env — same API, billing tier applies.

You only need **`GOOGLE_APPLICATION_CREDENTIALS`** (or **`gcloud auth application-default login`**) plus the Cloud TTS API enabled.

There is **no Hugging Face, PyTorch, or local LLM weights** in this process — start models with **Ollama** instead.

Example chat API (same host as your `ollama run`):

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "gemma4:e2b",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```

Default Ollama model in code: `gemma4:e2b`. Override with `OLLAMA_MODEL` / `OLLAMA_BASE_URL`.

## Setup

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Dependencies are small **except** optional numeric stack pulled in by **librosa** (audio resampling to 16 kHz WAV for transcriptions).

For Text-to-Speech, **`main.py` loads `server/.env.local` then `server/.env`** (`python-dotenv`). Copy `server/.env.example` → `server/.env.local` and set `GOOGLE_APPLICATION_CREDENTIALS` to your JSON path (do not commit `.env.local`). Or export the variable manually:

```bash
# Option A: application-default (no JSON file)
gcloud auth application-default login

# Option B: service-account key in shell
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# …or Option C: copy `server/.env.example` to `server/.env.local` with the path (loaded by main.py).
```

Quick check (writes `server/output.mp3`, ignored by git):

```bash
cd server && python test_google_tts.py
```

Enable the **Cloud Text-to-Speech API** in your Google Cloud project. See [supported voices](https://cloud.google.com/text-to-speech/docs/voices) (filter **Neural2** or **Premium** for Hindi / English).

**Voice overrides (still Google-only, no keys in the mobile app)**

| Env | Meaning |
|-----|--------|
| `GOOGLE_TTS_VOICE` | If set, use this voice ID for **every** request (e.g. `hi-IN-Chirp3-HD-Aoede`) |
| `GOOGLE_TTS_VOICE_HI` | **Default persona** — Hindi bilingual (mixed script) (**default `hi-IN-Neural2-A`**) |
| `GOOGLE_TTS_VOICE_EN` | With **`use_english_voice: true`** (`en-IN`…); default **`en-IN-Neural2-A`** |
| `GOOGLE_TTS_VOICE_EN_US` | With **`use_english_voice: true`** and `language_code: en-US`; default falls back via `GOOGLE_TTS_VOICE_EN` or **`en-US-Neural2-F`** |

Premium **Chirp3 HD** example (natural, code-mixed Hinglish often sounds good on `hi-IN` Premium):

```bash
export GOOGLE_TTS_VOICE_HI=hi-IN-Chirp3-HD-Aoede
```

Alternatively pass **`"voice_name": "hi-IN-Neural2-D"`** or **`"use_english_voice": true`** on **`POST /synthesize`** JSON.

## Run

```bash
python main.py
```

Server listens on **http://0.0.0.0:8642**. The app connects to  
`http://<your-mac-ip>:8642/transcribe`.

Find your Mac's LAN IP:

```bash
ipconfig getifaddr en0
```

## Endpoints

- `POST /transcribe` — audio upload → `{ transcript, inference_time_ms, backend: "ollama" }`
- `POST /synthesize` — text → `{ audio_base64, mime_type, language_code, voice, use_english_voice }`  
  (**Default**: Hindi Neural voice reads mixed Hindi + English spelling in **Hindi speech**. Set **`use_english_voice: true`** for native English only.)
- `GET /placement-questions` — diagnostic questions
- `POST /determine-level` — placement → level (**Ollama**)
- `POST /generate-session` — level/context → session JSON (**Ollama**)
- `GET /health` — TTS + Ollama reachability (`llm.audio_transcriptions_url`)

## Environment variables

- `HOST` — bind address (default: `0.0.0.0`)
- `PORT` — port (default: `8642`)

**Ollama**

- `OLLAMA_BASE_URL` — default `http://localhost:11434`
- `OLLAMA_MODEL` — default `gemma4:e2b`
- `OLLAMA_DISABLED=1` — skip Ollama for text (fallbacks only); **`/transcribe` will error** until you unset this
- `OLLAMA_TIMEOUT_DETERMINE` / `OLLAMA_TIMEOUT_GENERATE` — seconds (defaults: 120 / 240)
- `OLLAMA_ASR_TIMEOUT` — seconds for audio transcription (default: 180)

Start Ollama and pull your model: `ollama pull gemma4:e2b` (or your tag).

## Requirements

- Python 3.10+
- **Ollama** running locally (or reachable at `OLLAMA_BASE_URL`), with a model that supports your chat + transcription features
