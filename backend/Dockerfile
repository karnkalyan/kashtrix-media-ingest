# Node.js runtime is copied into the FFmpeg 6 image so recording and
# transcoding always use the declared broadcast toolchain versions.
FROM node:22.23.1-bookworm-slim AS node-runtime

FROM jrottenberg/ffmpeg:6.1.3-ubuntu2404

ENTRYPOINT []
WORKDIR /app

COPY --from=node-runtime /usr/local/ /usr/local/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/local/bin/ffmpeg \
    FFPROBE_PATH=/usr/local/bin/ffprobe

COPY package.json package-lock.json ./
COPY lib ./lib
RUN npm ci --include=dev
COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY . .

EXPOSE 3005 8080 1935
HEALTHCHECK --interval=15s --timeout=5s --retries=20 \
    CMD curl -fsS http://localhost:3005/api/license/status || exit 1
CMD ["sh", "-c", "npm run db:push && node server.js"]
