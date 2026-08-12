# Kashtrix Media Ingest

Kashtrix is a live television ingest, transcoding, monitoring, and professional recording system. It provides device and RTMP ingest, reusable Live TV transcoding profiles, multi-format recording, archive preview, WebSocket dashboard updates, and HWID-bound feature licensing.

## Docker deployment

Requirements: Docker Engine with Docker Compose.

```bash
cp .env.example .env
# Edit every password and secret in .env before starting.
docker compose up -d --build
```

Open `http://localhost:3000`. RTMP ingest listens on `rtmp://localhost:1935/live/<stream-name>` and HLS/media delivery is exposed on port `8080`.

MySQL and recordings use named Docker volumes, so container recreation does not remove them. Environment files, databases, recordings, generated streams, dependencies, logs, archives, and build output are excluded from Git.

## Local development

Requirements: Node.js 22+, MySQL 8+, and FFmpeg.

```bash
npm install
npm --prefix backend install
copy .env.example backend\.env
npm run db:generate
npm run db:push
npm run dev
```

The frontend runs at `http://localhost:3000`; the backend API and WebSocket server run at `http://localhost:3005`.

## Main modules

- Live TV channel composer and transcoding profiles
- Live Server RTMP ingest monitoring
- Professional multi-format recording and source preview
- Searchable Recording Library with archive preview
- System monitoring
- Prisma ORM with MySQL persistence
- Stable system HWID and module-based licenses

