# Kashtrix Media Ingest

Kashtrix is a live television ingest, transcoding, monitoring, and professional recording system. It provides device and RTMP ingest, reusable Live TV transcoding profiles, multi-format recording, archive preview, WebSocket dashboard updates, and continuously validated Secure License Manager entitlements.

## Docker deployment

Requirements: Docker Engine with Docker Compose.

The production stack uses FFmpeg 6.1.3 and Node.js 22.23.1 in the media backend, MySQL 8.4.10 for Prisma persistence, and Nginx 1.29 for the web UI and API/WebSocket proxy.

```bash
cp .env.example .env
# Replace every SET_/GENERATE_ placeholder with a unique value before starting.
# Set KTX_LICENSE_TENANT_ID and KTX_LICENSE_APPLICATION_ID to the public UUIDs
# shown for Kashtrix StreamOps in Secure License Manager.
docker compose up -d --build
```

Open `http://localhost:3000`. RTMP ingest listens on `rtmp://localhost:1935/live/<stream-name>`. API, WebSocket, HLS, DASH, recordings and previews all pass through the same web origin; internal ports `3005` and `8080` are not publicly exposed.

MySQL and recordings use named Docker volumes, so container recreation does not remove them. Environment files, databases, recordings, generated streams, dependencies, logs, archives, and build output are excluded from Git.

`KTE_JWT_SECRET` is always required. The backend never creates or promotes a superadmin from environment variables or API payloads. Create the first persisted superadmin from an interactive terminal with `npm --prefix backend run bootstrap:superadmin` (or `docker compose exec backend npm run bootstrap:superadmin` in Compose); the password prompt is hidden and the CLI accepts no credential arguments. Log in afterward through the normal `/api/auth/login` endpoint.

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

## Secure licensing

License keys are issued only from the Secure License Manager admin application. Kashtrix stores the successfully validated key in its private server-side license volume and maintains the SDK's TLS 1.3 heartbeat connection. It does not parse license JWTs in business logic and contains no local generator or signing secret.

After successful validation, the Secure License page displays the manager-issued license serial, customer/client name and email, installation client ID, validity and expiration dates, activation allowance, platform, application version, entitlement version, modules, and recording-device limit. These values come from the authenticated license session; Kashtrix does not accept local overrides for them.

When no current JWT is installed, Kashtrix maintains a mutually authenticated TLS provisioning connection to License Manager. Generating or reissuing a license with automatic activation enabled delivers the one-time JWT directly to the matching client ID, application, and HWID; Kashtrix persists it only after successful validation. Active clients receive reissued JWTs over their existing authenticated session after signed feature updates. Manual JWT activation remains available when the client is offline.

Kashtrix advertises these typed entitlement definitions through its `KTX1…` provisioning ID; Secure License Manager does not hardcode them:

- `CHANNELS` — channel composer, profiles and channel playout.
- `LIVE_SERVER` — RTMP/SRT live server, history and relay operations.
- `INGEST_SERVER` — ingest recording, device preview and recording library.
- `STREAMOPS` — StreamOps dashboard and operational control plane.
- `VOD_PLAYOUT` — VOD library, upload and playout.
- `RECORDING_DEVICES` — administrator-entered integer for simultaneous physical-device recordings, such as `5`.
- `TRANSCODE_QUEUE_ITEMS` — administrator-entered integer for queued or running transcode jobs.

Enable the required boolean features and enter numeric limits directly when issuing a license. A license with `INGEST_SERVER` and `RECORDING_DEVICES=0` can record live ingest streams but cannot start physical-device recording. Revocation, suspension, client bans, entitlement updates, loss of heartbeat validation, and limit reductions are enforced at runtime for every application role.

For local development, copy `.env.example` to `backend/.env` and set the server host, tenant/application UUIDs, CA, client certificate/key and Ed25519 public-key paths. Copy the `KTX1…` License provisioning ID from the Secure License page into License Manager; it carries the registered application, app-scoped HWID, feature definitions, and numeric limit definitions. The raw app-scoped HWID remains visible for diagnostics only.

## Main modules

- Live TV channel composer and transcoding profiles
- Live Server RTMP ingest monitoring
- Professional multi-format recording and source preview
- Searchable Recording Library with archive preview
- System monitoring
- Prisma ORM with MySQL persistence
- Application-scoped HWID and Ed25519-signed, mTLS-validated module licenses
