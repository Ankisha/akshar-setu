#!/bin/bash
set -e

# ── Railway volume setup ────────────────────────────────────────────
# Railway allows one volume per service. Mount it at /data and use
# subdirectories for Ollama models and app data (student reports,
# session cache). When no volume is mounted /data won't exist and
# everything falls back to the ephemeral container filesystem.
VOLUME_ROOT="/data"
if [ -d "$VOLUME_ROOT" ]; then
    echo "Railway volume detected at $VOLUME_ROOT"

    mkdir -p "$VOLUME_ROOT/ollama"
    mkdir -p "$VOLUME_ROOT/server-data"

    export OLLAMA_MODELS="$VOLUME_ROOT/ollama"

    # Symlink /app/server/data → volume so Python code works unchanged
    if [ -d /app/server/data ] && [ ! -L /app/server/data ]; then
        # First deploy: seed volume from baked-in data/ if volume subdir is empty
        if [ -z "$(ls -A "$VOLUME_ROOT/server-data" 2>/dev/null)" ]; then
            cp -a /app/server/data/. "$VOLUME_ROOT/server-data/"
        fi
        rm -rf /app/server/data
    fi
    ln -sfn "$VOLUME_ROOT/server-data" /app/server/data
else
    echo "No volume at $VOLUME_ROOT — using ephemeral container storage"
fi

# ── Start Ollama (fully background — never block the HTTP server) ───
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"

(
    ollama serve &
    echo "Waiting for Ollama API..."
    for i in $(seq 1 120); do
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "Ollama API is up."
            break
        fi
        sleep 1
    done

    if ! ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
        echo "Pulling model $OLLAMA_MODEL in background..."
        ollama pull "$OLLAMA_MODEL"
        echo "Model $OLLAMA_MODEL ready."
    else
        echo "Model $OLLAMA_MODEL already present."
    fi
) &

# ── Start FastAPI immediately (Railway proxy needs PORT open fast) ──
echo "Starting FastAPI on ${HOST:-0.0.0.0}:${PORT:-8642} ..."
cd /app/server
exec python main.py
