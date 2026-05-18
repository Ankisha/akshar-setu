# Stage 1: Build Expo web app
FROM node:20-slim AS frontend

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx expo export --platform web

# Stage 2: Python server + Ollama
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ffmpeg curl zstd ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama (CPU-only; install.sh needs zstd to extract the tarball)
RUN curl -fsSL https://ollama.com/install.sh | sh

COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ ./server/
COPY --from=frontend /app/dist ./dist/
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Railway volume mount point (attach one volume at /data)
RUN mkdir -p /data /app/server/data

WORKDIR /app/server

ENV PORT=8642
EXPOSE 8642

CMD ["/app/start.sh"]
