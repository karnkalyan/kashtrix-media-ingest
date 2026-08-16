# Kashtrix Media Ingest

Kashtrix is a live television ingest, transcoding, monitoring, and professional recording system. It provides device and RTMP ingest, reusable Live TV transcoding profiles, multi-format recording, archive preview, WebSocket dashboard updates, and HWID-bound feature licensing.

## Docker deployment

Requirements: Docker Engine with Docker Compose.

The production stack uses FFmpeg 6.1.3 and Node.js 22.23.1 in the media backend, MySQL 8.4.10 for Prisma persistence, and Nginx 1.29 for the web UI and API/WebSocket proxy.

```bash
cp .env.example .env
# Replace every SET_/GENERATE_ placeholder with a unique value before starting.
docker compose up -d --build
```

Open `http://localhost:3000`. RTMP ingest listens on `rtmp://localhost:1935/live/<stream-name>`. API, WebSocket, HLS, DASH, recordings and previews all pass through the same web origin; internal ports `3005` and `8080` are not publicly exposed.

MySQL and recordings use named Docker volumes, so container recreation does not remove them. Environment files, databases, recordings, generated streams, dependencies, logs, archives, and build output are excluded from Git.

`KTE_JWT_SECRET` is always required. When no persisted superadmin exists, the backend also requires `KTE_DEFAULT_USERNAME` and `KTE_DEFAULT_PASSWORD`; it creates or securely promotes that one account, persists the `SUPER_ADMIN` role in MySQL, and does not reuse the bootstrap password on later starts. Change the bootstrap password from Account Profile after the first login.

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

## Production domains

Nginx accepts both `ingest.kashtrix.com` and `ingest.kasthrix.com`. The browser always uses same-origin paths, so no production frontend URL needs to be hard-coded:

- Dashboard: `https://ingest.kashtrix.com/`
- API: `https://ingest.kashtrix.com/api/...`
- Realtime: `wss://ingest.kashtrix.com/ws`
- HLS: `https://ingest.kashtrix.com/live/<stream>/index.m3u8`
- RTMP ingest: `rtmp://ingest.kashtrix.com:1935/live/<stream>`

Create DNS `A`/`AAAA` records for both domain spellings pointing to the Docker host. In production, set `HTTP_PORT=80`, terminate HTTPS at Cloudflare, a load balancer, or a host-level TLS proxy, and forward it to this Nginx service. WebSocket upgrade forwarding is already configured. If Cloudflare is used, the RTMP hostname must be DNS-only because standard Cloudflare HTTP proxying does not carry RTMP port `1935`.

Local development uses the identical `/api`, `/ws`, and media paths. Vite proxies them to ports `3005` and `8080`, so there is no environment-specific API code.

## Main modules

- Live TV channel composer and transcoding profiles
- Live Server RTMP ingest monitoring
- Professional multi-format recording and source preview
- Searchable Recording Library with archive preview
- System monitoring
- Prisma ORM with MySQL persistence
- Stable system HWID and module-based licenses
