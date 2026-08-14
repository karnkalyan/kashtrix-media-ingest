# Multi-stage build providing modern FFmpeg with complete codec toolchain (SRT, H.264, H.265, AAC, etc.)
FROM mwader/static-ffmpeg:latest AS ffmpeg-source

FROM node:22.23.1-bookworm-slim

WORKDIR /app

# Copy modern static FFmpeg & FFprobe binaries (zero missing dynamic library errors)
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/ffprobe

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/local/bin/ffmpeg \
    FFPROBE_PATH=/usr/local/bin/ffprobe

COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY . .

EXPOSE 3005 8080 1935
HEALTHCHECK --interval=15s --timeout=5s --retries=20 \
    CMD curl -fsS http://localhost:3005/api/license/status || exit 1
CMD ["sh", "-c", "npx prisma db push --schema prisma/schema.prisma && node server.js"]
