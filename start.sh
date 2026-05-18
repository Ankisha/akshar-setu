#!/bin/bash

# ── Railway volume setup (optional, non-fatal) ─────────────────────
VOLUME_ROOT="/data"
if [ -d "$VOLUME_ROOT" ]; then
    echo "Railway volume detected at $VOLUME_ROOT"
    mkdir -p "$VOLUME_ROOT/ollama" 2>/dev/null || true
    mkdir -p "$VOLUME_ROOT/server-data" 2>/dev/null || true
    export OLLAMA_MODELS="$VOLUME_ROOT/ollama"

    if [ -d /app/server/data ] && [ ! -L /app/server/data ]; then
        if [ -z "$(ls -A "$VOLUME_ROOT/server-data" 2>/dev/null)" ]; then
            cp -a /app/server/data/. "$VOLUME_ROOT/server-data/" 2>/dev/null || true
        fi
        rm -rf /app/server/data 2>/dev/null || true
    fi
    ln -sfn "$VOLUME_ROOT/server-data" /app/server/data 2>/dev/null || true
else
    echo "No volume at $VOLUME_ROOT — using ephemeral container storage"
    mkdir -p /app/server/data 2>/dev/null || true
fi

# ── Start Ollama fully in background (non-blocking) ────────────────
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"

(
    ollama serve 2>&1 &
    for i in $(seq 1 120); do
        curl -s http://localhost:11434/api/tags > /dev/null 2>&1 && break
        sleep 1
    done
    echo "Ollama API is up."

    if ! ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
        echo "Pulling model $OLLAMA_MODEL in background..."
        ollama pull "$OLLAMA_MODEL" 2>&1
        echo "Model $OLLAMA_MODEL ready."
    else
        echo "Model $OLLAMA_MODEL already present."
    fi
) &

# ── Start FastAPI immediately ──────────────────────────────────────
echo "Starting FastAPI on 0.0.0.0:${PORT:-8642} ..."
cd /app/server
exec python -u main.py
