#!/usr/bin/env python3
"""
Smoke test: Google Cloud Text-to-Speech with hi-IN-Neural2-A.

Loads credentials from env (set `GOOGLE_APPLICATION_CREDENTIALS`, or put it in `.env.local`).

Usage (from repo root):
  cd server && source .venv/bin/activate && pip install -r requirements.txt
  python test_google_tts.py
"""

from pathlib import Path

from dotenv import load_dotenv
from google.cloud import texttospeech

_SERVER_DIR = Path(__file__).resolve().parent


def main() -> None:
    load_dotenv(_SERVER_DIR / ".env.local")
    load_dotenv(_SERVER_DIR / ".env")

    client = texttospeech.TextToSpeechClient()

    input_text = texttospeech.SynthesisInput(
        text="Namaste Ankisha! Yeh Hindi aur English mixed line hai — A for Akshar, ka for क."
    )
    voice = texttospeech.VoiceSelectionParams(
        language_code="hi-IN",
        name="hi-IN-Neural2-A",
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
    )

    response = client.synthesize_speech(
        input=input_text,
        voice=voice,
        audio_config=audio_config,
    )

    out_path = _SERVER_DIR / "output.mp3"
    out_path.write_bytes(response.audio_content)
    print(f"OK — wrote {out_path}")


if __name__ == "__main__":
    main()
