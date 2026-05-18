#!/bin/bash
set -e

# Start Ollama server in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to start..."
for i in $(seq 1 30); do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "Ollama is ready."
        break
    fi
    sleep 1
done

# Pull model if not already present
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
if ! ollama list | grep -q "$OLLAMA_MODEL"; then
    echo "Pulling model $OLLAMA_MODEL (this may take a few minutes on first deploy)..."
    ollama pull "$OLLAMA_MODEL"
fi

echo "Model $OLLAMA_MODEL is available."
echo "Starting FastAPI server..."
cd /app/server
exec python main.py
