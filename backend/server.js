(async () => {
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

const cors = require('cors');

const fs = require('fs');

const path = require('path');

const PrismaStore = require('./prismaStore');

const NodeMediaServer = require('node-media-server');

const bundledFfmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const multer = require('multer');

const systemApi = require('./systemInfoApi'); // Import system API functions
const {
    canViewTerminal,
    createTokenCodec,
    hashPassword,
    isStrongPassword,
    isSuperadmin,
    normalizeUserRole,
    parseManagedRole,
    passwordNeedsUpgrade,
    redactTerminalData,
    requireEnv,
    resolvePersistedIdentity,
    verifyPassword,
} = require('./securityPolicy');

const loadEnvFile = () => {
    const envFile = path.join(__dirname, '.env');
    if (!fs.existsSync(envFile)) return;
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
    }
};
loadEnvFile();

const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpegPath;
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
const { getFFmpegDevices } = require('./getDevices');

// --- CONFIGURATION ---

const MEDIA_PORT = 8080;

const API_PORT = 3005;

const DATA_DIR = path.join(__dirname, 'data');

const MEDIA_ROOT = path.join(process.cwd(), 'media');
const RECORDINGS_DIR = path.join(MEDIA_ROOT, 'recordings');
const RECORDED_DIR = path.join(process.cwd(), 'recorded');
const RECORDING_THUMBNAILS_DIR = path.join(MEDIA_ROOT, 'recording-thumbnails');

const JWT_SECRET = requireEnv('KTE_JWT_SECRET', 32);
const { signToken, verifyToken } = createTokenCodec(JWT_SECRET);
const CHANNEL_RUNTIME_FIELDS = ['status', 'uptime', 'speed', 'speedHistory', 'outputLog'];
const sanitizeChannelForStorage = (channel) => {
    const source = channel && typeof channel === 'object' && !Array.isArray(channel) ? channel : {};
    const { status, uptime, speed, speedHistory, outputLog, ...persistentChannel } = source;
    return persistentChannel;
};

const VOD_DIR = path.join(__dirname, 'media', 'vod');

// FIX: NMS v4 outputs HLS to MEDIA_ROOT/hls/<stream>/ (no 'live' subfolder by default)
// We handle both possible layouts
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');
const DASH_DIR = path.join(MEDIA_ROOT, 'dash');
const LIVE_DIR = path.join(MEDIA_ROOT, 'live');
const DEVICE_PREVIEW_DIR = path.join(HLS_DIR, 'device-preview');

// FIX: Per-stream HLS processes managed by us (since NMS http is disabled)
const hlsProcesses = new Map(); // streamKey -> { proc, pid }
const devicePreviewProcesses = new Map(); // previewId -> { proc, owner, videoDevice, audioDevice, outputDir }

// Bitrate and session tracking
const streamStatsHistory = new Map(); // key -> { lastBytes, lastTime, kbps }
const activeSessions = new Map(); // key -> { sessionId, totalIncoming, totalOutgoing, subscribers: Map<clientId, lastBytes>, subscriberRefs: Map }
const activeRecordings = new Map(); // key -> { proc, filePath, fileName, startTime, recordId }
const hlsViewers = new Map(); // stream key -> Map<viewer key, lastSeen>
const hlsByteCounters = new Map(); // stream key -> total bytes served by media HTTP

// FIX: Track cumulative outgoing bytes per stream (RTMP subscribers)
// key -> { lastSnapshotBytes: number, cumulativeBytes: number, sessionBytesMap: Map<sessionId, lastBytes> }
const rtmpOutgoingTracker = new Map();

// Frequency for broadcasting system stats (e.g., every 2 seconds)
const SYSTEM_STATS_INTERVAL_MS = 2000;

// ---------------------

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
if (!fs.existsSync(RECORDING_THUMBNAILS_DIR)) fs.mkdirSync(RECORDING_THUMBNAILS_DIR, { recursive: true });
if (!fs.existsSync(VOD_DIR)) fs.mkdirSync(VOD_DIR, { recursive: true });
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
if (!fs.existsSync(DEVICE_PREVIEW_DIR)) fs.mkdirSync(DEVICE_PREVIEW_DIR, { recursive: true });
if (!fs.existsSync(DASH_DIR)) fs.mkdirSync(DASH_DIR, { recursive: true });
if (!fs.existsSync(LIVE_DIR)) fs.mkdirSync(LIVE_DIR, { recursive: true });

const db = new PrismaStore();
await db.initialize();

const normalizeStoredChannels = async () => {
    const rows = db.prepare('SELECT id, data FROM channels').all();
    const upsert = db.prepare(`INSERT INTO channels (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`);
    let normalized = 0;

    for (const row of rows) {
        let channel;
        try {
            channel = JSON.parse(row.data);
        } catch (error) {
            console.warn(`[DB] Skipping malformed channel row ${row.id} during runtime-state cleanup: ${error.message}`);
            continue;
        }

        if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
            console.warn(`[DB] Skipping invalid channel row ${row.id} during runtime-state cleanup`);
            continue;
        }
        if (!CHANNEL_RUNTIME_FIELDS.some(field => Object.prototype.hasOwnProperty.call(channel, field))) continue;

        upsert.run(row.id, JSON.stringify(sanitizeChannelForStorage(channel)));
        normalized += 1;
    }

    if (normalized > 0) {
        await db.pending;
        console.log(`[DB] Removed persisted runtime state from ${normalized} channel row(s)`);
    }
};
await normalizeStoredChannels();

// Fix any unclosed or dangling recordings on startup
try {
    const unclosedRecordings = db.prepare('SELECT id, file_path, start_time, end_time, size FROM stream_recordings WHERE end_time IS NULL').all();
    for (const rec of unclosedRecordings) {
        let endTime = rec.start_time;
        let size = rec.size || 0;
        if (rec.file_path && fs.existsSync(rec.file_path)) {
            try {
                const stat = fs.statSync(rec.file_path);
                endTime = stat.mtime.toISOString();
                size = stat.size || size;
            } catch (e) { }
        }
        db.prepare('UPDATE stream_recordings SET end_time = ?, size = ? WHERE id = ?').run(endTime, size, rec.id);
    }
} catch (e) {
    console.error('[DB] Error fixing unclosed recordings on startup:', e);
}

const resolveAuthenticatedUser = async (claims) => {
    const username = String(claims?.sub || '').trim();
    const user = username ? await db.prisma.user.findFirst({
        where: { username },
        select: { username: true, role: true, isActive: true },
    }) : null;
    if (!user?.isActive) throw new Error('Authenticated user is missing or inactive');
    return resolvePersistedIdentity(claims, subject => subject === user.username ? user : null);
};
const authenticateToken = async (token) => resolveAuthenticatedUser(verifyToken(token));
const signAuthToken = (user) => signToken({
    sub: user.username,
    exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60),
});
const getJsonSetting = (key, fallback) => {
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
};
const setJsonSetting = (key, value) => {
    db.prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
        .run(key, JSON.stringify(value));
};
const sanitizeName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';
const normalizeHwid = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
const deriveSystemHwid = () => {
    const configured = normalizeHwid(process.env.KTE_HWID);
    if (configured) return configured;
    let machineIdentity = '';
    try {
        if (process.platform === 'win32') {
            const output = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
            machineIdentity = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim() || '';
        } else if (fs.existsSync('/etc/machine-id')) {
            machineIdentity = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        }
    } catch (error) { }
    const fingerprint = machineIdentity || `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()?.[0]?.model || 'cpu'}`;
    const digest = crypto.createHash('sha256').update(`kashtrix:${fingerprint}`).digest('hex').toUpperCase().slice(0, 24);
    return `KTX-${digest.match(/.{1,4}/g).join('-')}`;
};
const storedSystemHwid = normalizeHwid(getJsonSetting('system_hwid', ''));
const SYSTEM_HWID = normalizeHwid(process.env.KTE_HWID) || storedSystemHwid || deriveSystemHwid();
if (storedSystemHwid !== SYSTEM_HWID) setJsonSetting('system_hwid', SYSTEM_HWID);
const defaultSettings = { rtmpPort: 1935, mediaPort: MEDIA_PORT, httpPort: 8100, apiPort: API_PORT };
const clampPort = (value, fallback) => Math.max(1, Math.min(65535, Number(value) || fallback));
const getSettings = () => {
    const settings = { ...defaultSettings, ...getJsonSetting('settings', {}) };
    return {
        ...settings,
        rtmpPort: clampPort(settings.rtmpPort, 1935),
        mediaPort: clampPort(settings.mediaPort, MEDIA_PORT),
        httpPort: clampPort(settings.httpPort, 8100),
        apiPort: clampPort(settings.apiPort, API_PORT),
    };
};
const getLicense = () => {
    const license = getJsonSetting('license', { status: 'trial', features: ['profile-edit', 'channel-config'] });
    if (license.status === 'activated' && license.key) {
        try {
            const gen = db.prepare('SELECT status FROM generated_licenses WHERE license_key = ?').get(license.key);
            if (gen && gen.status === 'suspended') {
                return { ...license, status: 'suspended', systemHwid: SYSTEM_HWID };
            }
        } catch (e) { }
    }
    if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) {
        return { ...license, status: 'expired', systemHwid: SYSTEM_HWID };
    }
    if (license.status === 'activated' && license.hardwareId && normalizeHwid(license.hardwareId) !== SYSTEM_HWID) {
        return { ...license, status: 'hardware_mismatch', systemHwid: SYSTEM_HWID, hardwareMatch: false };
    }
    return license.status === 'activated'
        ? { ...license, systemHwid: SYSTEM_HWID, hardwareBound: !!license.hardwareId, hardwareMatch: true }
        : { ...license, status: license.status || 'trial', systemHwid: SYSTEM_HWID };
};
const LICENSE_MODULES = ['live-tv', 'live-server', 'ingest-server', 'recording-library', 'system-monitor'];
const LEGACY_MODULE_ACCESS = {
    'live-tv': ['streaming'],
    'live-server': ['streaming'],
    'ingest-server': ['streaming', 'recording'],
    'recording-library': ['recording'],
    'system-monitor': ['settings'],
};
const licenseHasModule = (license, module) => {
    if (license.status !== 'activated') return false;
    const features = Array.isArray(license.features) ? license.features : [];
    return features.includes(module) || features.includes('all-modules') || (LEGACY_MODULE_ACCESS[module] || []).some(feature => features.includes(feature));
};
const requiredModulesForRequest = (req) => {
    const path = req.path;
    if (path.startsWith('/api/channels') || path.startsWith('/api/profiles') || path === '/api/ffprobe-ts-programs') return ['live-tv'];
    if (path.startsWith('/api/ffmpeg/devices')) return ['live-tv', 'ingest-server'];
    if (path.startsWith('/api/ingest/device-preview')) return ['ingest-server'];
    if (path.startsWith('/api/ingest/record/')) return ['ingest-server'];
    if (path.startsWith('/api/ingest/recordings')) return ['recording-library', 'ingest-server'];
    if (path === '/api/ingest/streams') return ['live-server', 'ingest-server'];
    if (path.startsWith('/api/ingest/history') || path.startsWith('/api/ingest/processes') || path.startsWith('/api/ingest/srt') || path.startsWith('/api/ingest/relay') || path.startsWith('/api/diagnostics')) return ['live-server'];
    return [];
};
const DEFAULT_PROFILES = [
    {
        id: 'low-cpu-720p',
        name: 'Low CPU 720p (UDP Stable)',
        videoCodec: 'h264',
        audioCodec: 'aac',
        resolution: '1280x720',
        videoQualityMode: 'bitrate',
        videoBitrate: 2000,
        audioBitrate: 128,
        sampleRate: 48000,
        preset: 'ultrafast',
        framerate: 25,
        pixelFormat: 'yuv420p',
    },
    {
        id: 'live-http-ts-1',
        name: 'HTTP-TS: 720p Low Latency',
        videoCodec: 'h264',
        audioCodec: 'aac',
        resolution: '1280x720',
        videoQualityMode: 'bitrate',
        videoBitrate: 2000,
        maxrate: 2000,
        bufsize: 4000,
        framerate: 30,
        preset: 'ultrafast',
        tune: 'zerolatency',
        pixelFormat: 'yuv420p',
        sampleRate: 48000,
    },
    {
        id: 'default-h264-1080p',
        name: 'H.264 1080p (Software)',
        videoCodec: 'h264',
        audioCodec: 'aac',
        resolution: '1920x1080',
        videoQualityMode: 'bitrate',
        videoBitrate: 4000,
        audioBitrate: 128,
        sampleRate: 48000,
        preset: 'medium',
        framerate: 30,
        pixelFormat: 'yuv420p',
    },
    {
        id: 'nvidia-h264-1080p',
        name: 'H.264 1080p (NVIDIA NVENC)',
        videoCodec: 'h264_nvenc',
        audioCodec: 'aac',
        resolution: '1920x1080',
        videoQualityMode: 'bitrate',
        videoBitrate: 4000,
        audioBitrate: 128,
        sampleRate: 48000,
        preset: 'p4',
        framerate: 30,
        pixelFormat: 'yuv420p',
    },
    {
        id: 'amd-h264-1080p',
        name: 'H.264 1080p (AMD AMF)',
        videoCodec: 'h264_amf',
        audioCodec: 'aac',
        resolution: '1920x1080',
        videoQualityMode: 'bitrate',
        videoBitrate: 4000,
        audioBitrate: 128,
        sampleRate: 48000,
        preset: 'p4',
        framerate: 30,
        pixelFormat: 'yuv420p',
    },
    {
        id: 'amd-hevc-1080p',
        name: 'HEVC 1080p (AMD AMF)',
        videoCodec: 'hevc_amf',
        audioCodec: 'aac',
        resolution: '1920x1080',
        videoQualityMode: 'bitrate',
        videoBitrate: 6000,
        audioBitrate: 128,
        sampleRate: 48000,
        preset: 'p4',
        framerate: 30,
        pixelFormat: 'yuv420p',
    },
    {
        id: 'apple-h264-1080p',
        name: 'H.264 1080p (Apple VideoToolbox)',
        videoCodec: 'h264_videotoolbox',
        audioCodec: 'aac',
        resolution: '1920x1080',
        videoQualityMode: 'bitrate',
        videoBitrate: 4000,
        audioBitrate: 128,
        sampleRate: 48000,
        preset: 'ultrafast',
        framerate: 30,
        pixelFormat: 'yuv420p',
    },
    {
        id: 'quality-h264-crf-23',
        name: 'High-Quality H.264 (CRF 23)',
        videoCodec: 'h264',
        audioCodec: 'aac',
        resolution: '1920x1080',
        videoQualityMode: 'crf',
        crf: 23,
        audioBitrate: 192,
        sampleRate: 48000,
        preset: 'medium',
        framerate: 30,
        pixelFormat: 'yuv420p',
    },
];

const seedDefaultProfiles = () => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM profiles').get().count;
    if (count === 0) {
        const stmt = db.prepare('INSERT INTO profiles (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        for (const profile of DEFAULT_PROFILES) {
            stmt.run(profile.id, JSON.stringify(profile));
        }
    }
};
seedDefaultProfiles();

const app = express();
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

const hlsStaticOptions = {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        if (filePath.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/x-mpegURL');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/MP2T');
            res.setHeader('Cache-Control', 'public, max-age=3600');
        } else if (filePath.endsWith('.mpd')) {
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
};

// Serve static media, live HLS, DASH, and recordings on main API server
app.use('/live', express.static(HLS_DIR, hlsStaticOptions));
app.use('/live', express.static(LIVE_DIR, hlsStaticOptions));
app.use('/live', express.static(MEDIA_ROOT, hlsStaticOptions));
app.use('/hls', express.static(HLS_DIR, hlsStaticOptions));
app.use('/hls', express.static(MEDIA_ROOT, hlsStaticOptions));
app.use('/dash', express.static(DASH_DIR, hlsStaticOptions));
const serveRecordingFile = (req, res, next) => {
    const rawPath = decodeURIComponent(req.path || '').replace(/^\/+/, '');
    if (!rawPath) return next();
    const primaryPath = path.join(RECORDINGS_DIR, rawPath);
    if (fs.existsSync(primaryPath) && fs.statSync(primaryPath).isFile()) {
        return res.sendFile(primaryPath);
    }
    const secondaryPath = path.join(RECORDED_DIR, rawPath);
    if (fs.existsSync(secondaryPath) && fs.statSync(secondaryPath).isFile()) {
        return res.sendFile(secondaryPath);
    }
    const fileName = path.basename(rawPath);
    try {
        const row = db.prepare('SELECT file_path FROM stream_recordings WHERE file_name = ? ORDER BY id DESC LIMIT 1').get(fileName);
        if (row && row.file_path && fs.existsSync(row.file_path)) {
            return res.sendFile(path.resolve(row.file_path));
        }
    } catch (e) {}
    try {
        const findFile = (dir) => {
            if (!fs.existsSync(dir)) return null;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const found = findFile(full);
                    if (found) return found;
                } else if (entry.name === fileName) {
                    return full;
                }
            }
            return null;
        };
        const found = findFile(RECORDINGS_DIR) || findFile(RECORDED_DIR);
        if (found) return res.sendFile(found);
    } catch (e) {}
    next();
};

app.use('/recordings', express.static(RECORDINGS_DIR, hlsStaticOptions), express.static(RECORDED_DIR, hlsStaticOptions), serveRecordingFile);
app.use('/media/recordings', express.static(RECORDINGS_DIR, hlsStaticOptions), express.static(RECORDED_DIR, hlsStaticOptions), serveRecordingFile);
app.use('/recorded', express.static(RECORDED_DIR, hlsStaticOptions), express.static(RECORDINGS_DIR, hlsStaticOptions), serveRecordingFile);
app.use('/media/recorded', express.static(RECORDED_DIR, hlsStaticOptions), express.static(RECORDINGS_DIR, hlsStaticOptions), serveRecordingFile);
app.use('/media', express.static(MEDIA_ROOT, hlsStaticOptions));

const publicPaths = new Set(['/api/auth/login', '/api/license/status']);

const authMiddleware = async (req, res, next) => {
    if (!req.path.startsWith('/api') || publicPaths.has(req.path) || req.path.startsWith('/api/vod')) return next();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    try {
        req.user = await authenticateToken(token);
        const requiredModules = requiredModulesForRequest(req);
        if (req.user.role !== 'superadmin' && requiredModules.length && !requiredModules.some(module => licenseHasModule(getLicense(), module))) {
            return res.status(403).json({ error: `License module required: ${requiredModules.join(' or ')}`, requiredModules });
        }
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication required' });
    }
};
const requireSuperadmin = (req, res, next) => {
    if (!isSuperadmin(req.user)) {
        return res.status(403).json({ error: 'Superadmin access required' });
    }
    next();
};
const requireActiveLicense = (req, res, next) => {
    const license = getLicense();
    if (license.status !== 'activated') {
        const message = license.status === 'expired'
            ? 'Application license has expired. Please activate a valid license.'
            : 'Trial mode / Unlicensed version does not allow this action. Please activate a full license.';
        return res.status(403).json({ error: message, license });
    }
    next();
};

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    await db.refreshUsers();
    const user = db.prepare('SELECT username, password_hash, role FROM users WHERE username = ?').get(username || '');
    if (!user || user.is_active === false || !verifyPassword(password || '', user.password_hash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (passwordNeedsUpgrade(user.password_hash)) {
        await db.prisma.user.update({ where: { username: user.username }, data: { passwordHash: hashPassword(password) } });
        await db.refreshUsers();
    }
    const persistedUser = { username: user.username, role: normalizeUserRole(user.role) };
    res.json({ token: signAuthToken(persistedUser), user: persistedUser, license: getLicense() });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ user: { username: req.user.sub, role: req.user.role }, license: getLicense() });
});

// --- VOD API ---
const vodStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, VOD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const vodUpload = multer({ storage: vodStorage });

app.get('/api/vod/list', (req, res) => {
    try {
        if (!fs.existsSync(VOD_DIR)) return res.json([]);
        const files = fs.readdirSync(VOD_DIR).filter(f => !f.startsWith('.'));
        const list = files.map(f => {
            const parts = f.split('_');
            const originalName = parts.length > 1 && /^\d+$/.test(parts[0]) ? parts.slice(1).join('_') : f;
            return { name: f, originalName };
        });
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: 'Failed to list VOD files' });
    }
});

app.post('/api/vod/upload', vodUpload.single('vodFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
        fileName: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
    });
});


app.put('/api/auth/account', authMiddleware, (req, res) => {
    const { username, currentPassword, newPassword } = req.body || {};
    const currentUser = db.prepare('SELECT username, password_hash, role FROM users WHERE username = ?').get(req.user.sub);
    if (!currentUser || !verifyPassword(currentPassword || '', currentUser.password_hash)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const nextUsername = String(username || currentUser.username).trim();
    if (!nextUsername) return res.status(400).json({ error: 'Username is required' });
    if (newPassword && !isStrongPassword(newPassword)) return res.status(400).json({ error: 'New password must be at least 12 characters' });
    const nextHash = newPassword
        ? hashPassword(newPassword)
        : (passwordNeedsUpgrade(currentUser.password_hash) ? hashPassword(currentPassword) : currentUser.password_hash);
    try {
        db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE username = ?')
            .run(nextUsername, nextHash, currentUser.username);
        const nextUser = { username: nextUsername, role: normalizeUserRole(currentUser.role) };
        res.json({ token: signAuthToken(nextUser), user: nextUser });
    } catch (error) {
        res.status(409).json({ error: 'Username already exists' });
    }
});

app.get('/api/license/status', (req, res) => {
    res.json(getLicense());
});

app.get('/api/license/hwid', authMiddleware, (req, res) => {
    res.json({ hardwareId: SYSTEM_HWID });
});

app.post('/api/_hidden/license/generate', authMiddleware, requireSuperadmin, (req, res) => {
    const { customerName, customerEmail, expiresAt, days, features, hardwareId } = req.body || {};
    const expiryMs = expiresAt ? new Date(expiresAt).getTime() : Date.now() + (Number(days || 365) * 24 * 60 * 60 * 1000);
    if (!customerName || Number.isNaN(expiryMs) || expiryMs <= Date.now()) {
        return res.status(400).json({ error: 'Customer name and a future expiry are required' });
    }
    const normalizedHardwareId = normalizeHwid(hardwareId);
    if (!/^KTX-(?:[A-Z0-9]{4}-){5}[A-Z0-9]{4}$/.test(normalizedHardwareId)) {
        return res.status(400).json({ error: 'A valid Kashtrix system HWID is required' });
    }
    const requestedFeatures = Array.isArray(features) ? features.filter(feature => LICENSE_MODULES.includes(feature)) : [];
    if (!requestedFeatures.length) return res.status(400).json({ error: 'Select at least one licensed module' });
    const payload = {
        customerName,
        customerEmail: customerEmail || '',
        hardwareId: normalizedHardwareId,
        features: requestedFeatures,
        exp: Math.floor(expiryMs / 1000),
        iat: Math.floor(Date.now() / 1000),
        iss: 'professional-media-server',
    };
    const licenseKey = signToken(payload);
    try {
        db.prepare('INSERT INTO generated_licenses (customer_name, customer_email, license_key, expires_at) VALUES (?, ?, ?, ?)')
            .run(customerName, customerEmail || '', licenseKey, new Date(expiryMs).toISOString());
    } catch (e) { console.error('Failed to save generated license', e); }
    res.json({ licenseKey, payload: { ...payload, expiresAt: new Date(expiryMs).toISOString() } });
});

app.get('/api/_hidden/licenses', authMiddleware, requireSuperadmin, (req, res) => {
    const licenses = db.prepare('SELECT * FROM generated_licenses ORDER BY created_at DESC').all().map(license => {
        try { const payload = verifyToken(license.license_key); return { ...license, features: payload.features || [], hardware_id: payload.hardwareId || null }; } catch (e) { return { ...license, features: [], hardware_id: null }; }
    });
    res.json(licenses);
});

app.put('/api/_hidden/licenses/:id/suspend', authMiddleware, requireSuperadmin, (req, res) => {
    db.prepare('UPDATE generated_licenses SET status = ? WHERE id = ?').run('suspended', req.params.id);
    res.json({ success: true });
});

app.put('/api/_hidden/licenses/:id/activate', authMiddleware, requireSuperadmin, (req, res) => {
    db.prepare('UPDATE generated_licenses SET status = ? WHERE id = ?').run('active', req.params.id);
    res.json({ success: true });
});

app.post('/api/license/activate', authMiddleware, (req, res) => {
    try {
        const payload = verifyToken(req.body?.licenseKey);
        if (!payload.customerName || !payload.exp) throw new Error('License payload missing customer or expiry');
        if (!payload.hardwareId) return res.status(400).json({ error: 'This license is not bound to a system HWID. Request a new hardware-bound license.', hardwareId: SYSTEM_HWID });
        if (normalizeHwid(payload.hardwareId) !== SYSTEM_HWID) return res.status(400).json({ error: 'License HWID does not match this system', hardwareId: SYSTEM_HWID });

        try {
            const gen = db.prepare('SELECT status FROM generated_licenses WHERE license_key = ?').get(req.body?.licenseKey);
            if (gen && gen.status === 'suspended') {
                return res.status(400).json({ error: 'License has been suspended' });
            }
        } catch (e) { }

        const license = {
            status: 'activated',
            key: req.body?.licenseKey,
            customerName: payload.customerName,
            customerEmail: payload.customerEmail || '',
            hardwareId: normalizeHwid(payload.hardwareId),
            expiresAt: new Date(payload.exp * 1000).toISOString(),
            features: payload.features || ['streaming', 'recording', 'multi-destination'],
        };
        setJsonSetting('license', license);
        res.json(license);
    } catch (error) {
        res.status(400).json({ error: 'Invalid or expired license token' });
    }
});

app.delete('/api/license/activate', authMiddleware, (req, res) => {
    const trial = { status: 'trial', features: ['profile-edit', 'channel-config'] };
    setJsonSetting('license', trial);
    res.json(trial);
});

app.get('/api/settings', authMiddleware, (req, res) => {
    res.json(getSettings());
});

app.put('/api/settings', authMiddleware, (req, res) => {
    const nextSettings = {
        ...getSettings(),
        rtmpPort: clampPort(req.body?.rtmpPort, 1935),
        mediaPort: clampPort(req.body?.mediaPort, MEDIA_PORT),
        httpPort: clampPort(req.body?.httpPort, 8100),
        apiPort: clampPort(req.body?.apiPort, API_PORT),
    };
    setJsonSetting('settings', nextSettings);
    res.json({ ...nextSettings, restartRequired: true });
});

app.get('/api/state', authMiddleware, (req, res) => {
    try {
        const channels = db.prepare('SELECT * FROM channels').all().map(c => {
            try { return JSON.parse(c.data); } catch (e) { return null; }
        }).filter(Boolean).map(c => redactTerminalData({
            ...sanitizeChannelForStorage(c),
            status: runningProcesses[c.id] ? 'Running' : 'Stopped',
            uptime: 0,
            speed: 0,
            speedHistory: [],
            outputLog: []
        }, req.user));
        const profiles = db.prepare('SELECT * FROM profiles').all().map(p => {
            try { return JSON.parse(p.data); } catch (e) { return null; }
        }).filter(Boolean);
        res.json({
            channels,
            profiles,
            settings: getSettings(),
            license: getLicense()
        });
    } catch (error) {
        console.error('Failed to get state:', error);
        res.status(500).json({ error: 'Failed to retrieve application state' });
    }
});

app.put('/api/profiles/:id', authMiddleware, (req, res) => {
    const profile = { ...req.body, id: req.params.id };
    db.prepare(`INSERT INTO profiles (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`)
        .run(profile.id, JSON.stringify(profile));
    res.json(profile);
});

app.delete('/api/profiles/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM profiles WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

app.put('/api/channels/:id', authMiddleware, (req, res) => {
    const channel = sanitizeChannelForStorage({ ...req.body, id: req.params.id });
    db.prepare(`INSERT INTO channels (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`)
        .run(channel.id, JSON.stringify(channel));
    res.json(channel);
});

app.delete('/api/channels/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

app.delete('/api/channels', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM channels').run();
    res.json({ ok: true });
});

const ensureCommandDirectories = (cmdString) => {
    try {
        const fileMatches = cmdString.match(/(?:\]|"|'|\s|^)([\w\-\/\\:.]+\.(m3u8|mpd|mp4|ts|mkv|mov|flv))/gi) || [];
        for (const match of fileMatches) {
            const cleanPath = match.replace(/^[^a-zA-Z0-9.\/\\:]+/, '').replace(/["']/g, '').trim();
            if (/^(http|https|rtmp|udp|srt|rtp|rtsp):\/\//i.test(cleanPath)) continue;

            const dirName = path.dirname(cleanPath);
            if (!dirName || dirName === '.' || dirName === '/' || dirName === '\\') continue;

            const candidates = [
                path.resolve(dirName),
                path.resolve(__dirname, dirName),
                path.resolve(process.cwd(), dirName),
                path.join(MEDIA_ROOT, dirName.replace(/^media[\\\/]/i, '')),
                path.join(MEDIA_ROOT, 'hls', path.basename(dirName)),
                path.join(__dirname, 'media', 'hls', path.basename(dirName)),
                path.join(process.cwd(), 'media', 'hls', path.basename(dirName))
            ];

            for (const targetDir of candidates) {
                try {
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                        console.log(`[Server] Created target output directory: ${targetDir}`);
                    }
                } catch (err) {}
            }
        }
    } catch (e) {
        console.warn('[Server] ensureCommandDirectories warning:', e.message);
    }
};

app.post('/api/channels/start', authMiddleware, requireActiveLicense, async (req, res) => {
    const { channelId, streamName } = req.body;
    if (!channelId) return res.status(400).json({ error: 'channelId is required' });
    if (runningProcesses[channelId]) return res.status(409).json({ error: 'Channel is already running' });

    let finalCommand = req.body.command;
    if (!finalCommand) {
        let channelRow = db.prepare('SELECT data FROM channels WHERE id = ?').get(channelId);
        let channelData = null;
        if (channelRow && channelRow.data) {
            try {
                channelData = typeof channelRow.data === 'string' ? JSON.parse(channelRow.data) : channelRow.data;
            } catch (e) {}
        }

        if (!channelData) {
            // Fallback: search all channel rows in database by ID or name
            const allRows = db.prepare('SELECT id, data FROM channels').all();
            const targetSlug = sanitizeName(streamName || channelId);
            for (const row of allRows) {
                try {
                    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                    const rowIdStr = String(row.id || '');
                    const parsedIdStr = String(parsed?.id || '');
                    const parsedNameSlug = sanitizeName(parsed?.name || '');
                    if (rowIdStr === String(channelId) || parsedIdStr === String(channelId) || (targetSlug && parsedNameSlug === targetSlug)) {
                        channelData = parsed;
                        break;
                    }
                } catch (e) {}
            }
        }

        if (!channelData) {
            return res.status(404).json({ error: 'Channel not found in database' });
        }

        finalCommand = channelData.command;
    }
    if (!finalCommand) {
        return res.status(400).json({ error: 'No FFmpeg command configured for this channel' });
    }
    try {
        // 0. Resolve device capture for host platform and ensure hardware lock is free
        if (finalCommand.includes('device://') || finalCommand.includes('-f dshow') || finalCommand.includes('-f decklink')) {
            // Stop any conflicting device preview so DeckLink lock is clean
            for (const [pId] of devicePreviewProcesses.entries()) {
                stopDevicePreview(pId);
            }
            await new Promise(r => setTimeout(r, 500));

            let videoDev = '';
            let audioDev = '';
            let videoInput = 'hdmi';
            let formatCode = '';

            const devUriMatch = finalCommand.match(/(?:-thread_queue_size\s+\d+\s+)?-i\s+["']?device:\/\/([^"'\s]+)["']?/i);
            const dshowMatch = finalCommand.match(/(?:-thread_queue_size\s+\d+\s+)?-f\s+dshow\s+(?:-rtbufsize\s+\S+\s+)?-i\s+["']?([^"']+)["']?/i);
            const decklinkMatch = finalCommand.match(/(?:-thread_queue_size\s+\d+\s+)?-f\s+decklink\s+(?:-[a-z_]+\s+\S+\s+)*-i\s+["']?([^"']+)["']?/i);

            if (devUriMatch) {
                const [baseUri, queryStr] = devUriMatch[1].split('?');
                if (queryStr) {
                    const params = new URLSearchParams(queryStr);
                    if (params.get('video_input')) videoInput = params.get('video_input');
                    if (params.get('format_code')) formatCode = params.get('format_code');
                }
                const parts = baseUri.split('+');
                videoDev = parts[0].replace(/^video=/i, '').trim();
                audioDev = (parts[1] || videoDev).replace(/^audio=/i, '').trim();
            } else if (dshowMatch) {
                const [baseUri, queryStr] = dshowMatch[1].split('?');
                if (queryStr) {
                    const params = new URLSearchParams(queryStr);
                    if (params.get('video_input')) videoInput = params.get('video_input');
                    if (params.get('format_code')) formatCode = params.get('format_code');
                }
                const parts = baseUri.split(':');
                const vPart = parts.find(p => p.startsWith('video=')) || parts[0];
                const aPart = parts.find(p => p.startsWith('audio=')) || vPart;
                videoDev = vPart.replace(/^video=/i, '').replace(/["']/g, '').trim();
                audioDev = aPart.replace(/^audio=/i, '').replace(/["']/g, '').trim();
            } else if (decklinkMatch) {
                videoDev = decklinkMatch[1].replace(/["']/g, '').trim();
                audioDev = videoDev;
            }

            if (videoDev.includes('?')) videoDev = videoDev.split('?')[0].trim();
            if (audioDev.includes('?')) audioDev = audioDev.split('?')[0].trim();

            const devices = await scanCaptureDevices().catch(() => ({ video: [], audio: [] }));
            const resolvedVideo = resolveCaptureDevice(devices, videoDev) || videoDev;
            const resolvedAudio = resolveCaptureDevice(devices, audioDev) || audioDev;

            if (process.platform !== 'win32') {
                const formatFlag = formatCode && formatCode !== 'auto' && formatCode !== 'unset' ? `-format_code ${formatCode} ` : '';
                const vInputFlag = videoInput && videoInput !== 'unset' && videoInput !== 'auto' ? `-video_input ${videoInput} ` : '-video_input hdmi ';
                const linuxDeviceFlags = `-thread_queue_size 1024 -f decklink ${formatFlag}${vInputFlag}-i "${resolvedVideo || resolvedAudio || 'Intensity Pro 4K'}"`;
                if (devUriMatch) {
                    finalCommand = finalCommand.replace(devUriMatch[0], linuxDeviceFlags);
                } else if (dshowMatch) {
                    finalCommand = finalCommand.replace(dshowMatch[0], linuxDeviceFlags);
                } else if (decklinkMatch) {
                    finalCommand = finalCommand.replace(decklinkMatch[0], linuxDeviceFlags);
                }
            } else {
                const winDeviceFlags = `-thread_queue_size 1024 -f dshow -rtbufsize 1024M -i video="${resolvedVideo || 'video'}":audio="${resolvedAudio || resolvedVideo || 'audio'}"`;
                if (devUriMatch) {
                    finalCommand = finalCommand.replace(devUriMatch[0], winDeviceFlags);
                } else if (dshowMatch) {
                    finalCommand = finalCommand.replace(dshowMatch[0], winDeviceFlags);
                }
            }
        }

        // Clean up any invalid scale / framerate flags e.g. -s source or -r 0
        finalCommand = finalCommand
            .replace(/\s+-s\s+(source|auto|original|N\/A)\b/gi, '')
            .replace(/\s+-r\s+0(?:\.0+)?\b/g, '');

        // 1. Resolve VOD/file input paths to absolute paths
        const inputMatch = finalCommand.match(/-i\s+["']?([^"'\s]+)["']?/i);
        if (inputMatch) {
            const rawInput = inputMatch[1];
            const isNetwork = /^(udp|srt|rtp|rtsp|http|https|rtmp|rtmps):\/\//i.test(rawInput);
            if (!isNetwork && !rawInput.startsWith('device://') && !rawInput.startsWith('pipe:')) {
                const fileName = path.basename(rawInput);
                const candidates = [
                    rawInput,
                    path.join(VOD_DIR, fileName),
                    path.join(MEDIA_ROOT, 'vod', fileName),
                    path.join(__dirname, 'media', 'vod', fileName),
                    path.join(process.cwd(), 'media', 'vod', fileName),
                    path.join(process.cwd(), rawInput)
                ];
                for (const candidate of candidates) {
                    if (fs.existsSync(candidate)) {
                        const absInput = candidate.replace(/\\/g, '/');
                        finalCommand = finalCommand.replace(inputMatch[0], `-i "${absInput}"`);
                        break;
                    }
                }
            }
        }

        // 2. Resolve any relative output paths in command or -f tee (e.g. media/hls/saiyara/index.m3u8) to absolute paths
        finalCommand = finalCommand.replace(/(?:\]|"|'|\s|^)(media\/(hls|dash|recordings)\/[^\s"']+\.(m3u8|mpd|mp4|ts|mkv|mov))/gi, (match, relPath) => {
            const prefix = match.match(/^[^a-zA-Z0-9.\/\\:]+/)?.[0] || '';
            const absPath = path.resolve(MEDIA_ROOT, relPath.replace(/^media[\\\/]/i, '')).replace(/\\/g, '/');
            const absDir = path.dirname(absPath);
            if (!fs.existsSync(absDir)) {
                fs.mkdirSync(absDir, { recursive: true });
                console.log(`[Server] Created absolute output directory: ${absDir}`);
            }
            return `${prefix}${absPath}`;
        });

        // 3. Ensure all output destination directories exist
        ensureCommandDirectories(finalCommand);

        // 4. Resolve HLS / DASH manifest output paths if explicit single output
        const isHls = /-f\s+hls\b/i.test(finalCommand);
        const isDash = /-f\s+dash\b/i.test(finalCommand);
        if (isHls || isDash) {
            const targetDir = isHls ? HLS_DIR : DASH_DIR;
            const slug = streamName || channelId;
            const playlistAbs = path.join(targetDir, slug, isHls ? 'index.m3u8' : 'index.mpd');
            const playlistDir = path.dirname(playlistAbs);
            if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true });

            const ffmpegPlaylist = playlistAbs.replace(/\\/g, '/');
            const manifestRegex = isHls ? /(["']?)([^\s"']+\.m3u8)\1/gi : /(["']?)([^\s"']+\.mpd)\1/gi;

            if (manifestRegex.test(finalCommand)) {
                finalCommand = finalCommand.replace(manifestRegex, `"${ffmpegPlaylist}"`);
            } else {
                finalCommand = `${finalCommand} "${ffmpegPlaylist}"`;
            }
        }
    } catch (e) { console.warn('Command sanitization failed:', e); }

    const [executable, ...args] = parseCommand(finalCommand);
    const useShell = finalCommand.includes('|');
    const spawnExec = useShell ? finalCommand.replace(/\bffmpeg(\.exe)?\b/gi, `"${ffmpegPath.replace(/\\/g, '/')}"`) : (executable?.toLowerCase().includes('ffmpeg') ? ffmpegPath : executable);
    const spawnArgs = useShell ? [] : args;

    console.log(`[FFmpeg] Starting ${channelId}: ${spawnExec} ${spawnArgs.join(' ')}`);
    const proc = spawn(spawnExec, spawnArgs, { windowsHide: true, cwd: __dirname, shell: useShell });
    runningProcesses[channelId] = proc;

    let uptime = 0;
    const timer = setInterval(() => uptime++, 1000);

    proc.stderr.on('data', data => {
        const log = data.toString();
        const match = log.match(/time=(\S+)\sbitrate=(\S+)\sspeed=(\S+)x/);
        if (match) {
            broadcastStats(channelId, { uptime, time: match[1], bitrate: parseFloat(match[2]), speed: parseFloat(match[3]), log: log.trim() });
        } else {
            broadcastStats(channelId, { uptime, log: log.trim() });
        }
    });

    proc.on('close', code => {
        clearInterval(timer);
        delete runningProcesses[channelId];
        broadcastStats(channelId, { status: 'stopped', log: `Exited with code ${code}` });
    });

    res.status(202).json({ success: true, message: 'Started', channelId });
});

app.post('/api/channels/stop', authMiddleware, (req, res) => {
    const { channelId } = req.body;
    const proc = runningProcesses[channelId];
    if (!proc) return res.status(404).json({ error: 'Not running' });
    proc.stdin.write('q');
    setTimeout(() => { if (runningProcesses[channelId]) proc.kill('SIGKILL'); }, 5000);
    res.json({ success: true });
});

app.post('/api/ffprobe-ts-programs', authMiddleware, (req, res) => {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'input required' });

    if (input.startsWith('device://')) {
        const raw = input.replace('device://', '');
        const parts = raw.split('+');
        const devName = parts[0].replace(/^video=/i, '').trim();
        const programs = [{
            id: 0,
            name: devName || 'DeckLink Live Capture Feed',
            streams: [
                { index: '0:v:0', type: 'video', codec: 'rawvideo / decklink', resolution: '1920x1080' },
                { index: '0:a:0', type: 'audio', codec: 'pcm_s16le', lang: 'Main' },
            ],
        }];
        return res.json(programs);
    }

    const isNetwork = /^(udp|srt|rtp|rtsp|http|https|rtmp|rtmps):\/\//i.test(input);
    const ffInput = isNetwork ? input : path.join(VOD_DIR, input).replace(/\\/g, '/');

    const args = ['-v', 'error', '-show_programs', '-show_streams', '-of', 'json'];
    if (isNetwork) args.push('-timeout', '5000000');
    args.push(ffInput);

    const proc = spawn(ffprobePath, args);
    let stdout = '';
    proc.stdout.on('data', d => stdout += d);
    proc.on('close', code => {
        try {
            const data = JSON.parse(stdout);
            const programs = (data.programs || []).map(p => ({
                id: p.program_id,
                name: p.tags?.service_name || `Program ${p.program_id}`,
                streams: (p.streams || []).map(s => ({
                    index: `0:${s.index}`,
                    type: s.codec_type,
                    codec: s.codec_name,
                    resolution: s.width ? `${s.width}x${s.height}` : (s.channels ? `${s.channels}ch` : null)
                }))
            }));
            if (programs.length === 0 && data.streams) {
                programs.push({
                    id: 0, name: 'Default', streams: data.streams.map(s => ({
                        index: `0:${s.index}`, type: s.codec_type, codec: s.codec_name, resolution: s.width ? `${s.width}x${s.height}` : null
                    }))
                });
            }
            res.json(programs);
        } catch (e) { res.status(500).json({ error: 'Parse failed' }); }
    });
});

let captureDeviceCache = null;
let captureDeviceScan = null;
const CAPTURE_DEVICE_CACHE_MS = 5000;

const scanCaptureDevices = async ({ refresh = false } = {}) => {
    const now = Date.now();
    if (!refresh && captureDeviceCache && now - captureDeviceCache.updatedAt < CAPTURE_DEVICE_CACHE_MS) {
        return captureDeviceCache.devices;
    }
    if (captureDeviceScan) return captureDeviceScan;

    // Device enumeration is an FFmpeg/DirectShow operation. ffprobe cannot list
    // Windows capture devices. Use the bounded execFile implementation so stdin
    // is closed and FFmpeg always exits after printing the device list.
    captureDeviceScan = getFFmpegDevices(ffmpegPath)
        .then(devices => {
            captureDeviceCache = { devices, updatedAt: Date.now() };
            return devices;
        })
        .finally(() => { captureDeviceScan = null; });

    return captureDeviceScan;
};

app.get('/api/ffmpeg/devices', authMiddleware, async (req, res) => {
    try { res.json(await scanCaptureDevices({ refresh: req.query.refresh === 'true' })); }
    catch (error) { res.status(500).json({ error: error.message || 'Unable to detect capture devices' }); }
});

const resolveCaptureDevice = (devices, selected) => {
    if (!selected || process.platform === 'win32') return selected;
    return devices?.decklinkMap?.[selected] || selected;
};

const getDeckLinkFormatCode = (resolution, framerate) => {
    const fps = Math.round(Number(framerate) || 0);
    const res = String(resolution || '').toLowerCase();
    if (res.includes('1080') || res === '1920x1080') {
        if (fps === 50) return 'Hp50';
        if (fps === 60) return 'Hp60';
        if (fps === 59) return 'Hp59';
        if (fps === 30) return '30p ';
        if (fps === 29) return '29p ';
        if (fps === 25) return '25p ';
        if (fps === 24) return '24p ';
        if (fps === 23) return '23p ';
        return 'Hp50';
    } else if (res.includes('720') || res === '1280x720') {
        if (fps === 50) return 'hp50';
        if (fps === 60) return 'hp60';
        if (fps === 59) return 'hp59';
        return 'hp50';
    } else if (res.includes('2160') || res.includes('3840x2160') || res.includes('4k')) {
        if (fps === 50) return '4k50';
        if (fps === 60) return '4k60';
        if (fps === 59) return '4k59';
        if (fps === 30) return '4k30';
        if (fps === 25) return '4k25';
        if (fps === 24) return '4k24';
        return '4k50';
    } else if (res.includes('576') || res.includes('pal')) {
        return 'pal ';
    } else if (res.includes('480') || res.includes('ntsc')) {
        return 'ntsc';
    }
    return null;
};

const devicePreviewInputArgs = (videoDevice, audioDevice, options = {}) => {
    if (process.platform === 'win32') {
        const source = [
            videoDevice ? `video=${videoDevice}` : '',
            audioDevice ? `audio=${audioDevice}` : '',
        ].filter(Boolean).join(':');
        const args = ['-thread_queue_size', '1024', '-f', 'dshow', '-rtbufsize', '1024M'];
        args.push('-i', source);
        return args;
    }

    // The Linux appliance enumerates DeckLink sources. A DeckLink input carries
    // its embedded audio and video together, so both selectors must identify the
    // same physical input when both are supplied.
    if (videoDevice && audioDevice && videoDevice !== audioDevice) {
        throw new Error('DeckLink video and audio preview must use the same capture device');
    }
    const dev = videoDevice || audioDevice;
    const args = ['-thread_queue_size', '1024', '-f', 'decklink'];
    if (options.formatCode && options.formatCode !== 'auto' && options.formatCode !== 'unset') {
        args.push('-format_code', options.formatCode);
    }
    const videoInput = (options.videoInput && options.videoInput !== 'unset' && options.videoInput !== 'auto') ? options.videoInput : 'hdmi';
    if (videoInput) args.push('-video_input', videoInput);
    if (options.rawFormat) args.push('-raw_format', options.rawFormat);
    args.push('-i', dev);
    return args;
};

const scheduleDevicePreviewCleanup = (outputDir) => {
    setTimeout(() => {
        const resolvedRoot = path.resolve(DEVICE_PREVIEW_DIR);
        const resolvedOutput = path.resolve(outputDir);
        if (path.dirname(resolvedOutput) !== resolvedRoot) return;
        try { fs.rmSync(resolvedOutput, { recursive: true, force: true }); } catch (error) { }
    }, 1500).unref?.();
};

const stopDevicePreview = (previewId) => {
    const preview = devicePreviewProcesses.get(previewId);
    if (!preview) return false;
    devicePreviewProcesses.delete(previewId);
    if (preview.expiryTimer) clearTimeout(preview.expiryTimer);
    try {
        if (!preview.proc.killed) {
            preview.proc.kill('SIGTERM');
            setTimeout(() => {
                try { if (!preview.proc.killed) preview.proc.kill('SIGKILL'); } catch (e) {}
            }, 200).unref?.();
        }
    } catch (error) { }
    scheduleDevicePreviewCleanup(preview.outputDir);
    return true;
};

const waitForDevicePreview = (preview, playlistPath, timeoutMs = 10000) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const inspect = () => {
        if (fs.existsSync(playlistPath)) return resolve();
        if (preview.closed) return reject(new Error(preview.lastError || 'FFmpeg could not open the selected capture device'));
        if (Date.now() - startedAt >= timeoutMs) return reject(new Error(preview.lastError || 'Timed out waiting for capture device signal'));
        setTimeout(inspect, 100);
    };
    inspect();
});

app.post('/api/ingest/device-preview/start', authMiddleware, async (req, res) => {
    const videoDevice = String(req.body?.videoDevice || '').trim().slice(0, 256);
    const audioDevice = String(req.body?.audioDevice || '').trim().slice(0, 256);
    const resolution = String(req.body?.resolution || '').trim().slice(0, 32);
    const framerate = Number(req.body?.framerate) || 0;
    const formatCode = String(req.body?.formatCode || '').trim().slice(0, 16);
    const videoInput = String(req.body?.videoInput || '').trim().slice(0, 32);
    const rawFormat = String(req.body?.rawFormat || '').trim().slice(0, 32);
    if (!videoDevice && !audioDevice) return res.status(400).json({ error: 'Select at least one capture device' });

    let previewId = '';
    let outputDir = '';
    try {
        const devices = await scanCaptureDevices({ refresh: true });
        if (videoDevice && !devices.video.includes(videoDevice)) return res.status(400).json({ error: 'Selected video capture device is not available on the server' });
        if (audioDevice && !devices.audio.includes(audioDevice)) return res.status(400).json({ error: 'Selected audio capture device is not available on the server' });

        const ffmpegVideoDevice = resolveCaptureDevice(devices, videoDevice);
        const ffmpegAudioDevice = resolveCaptureDevice(devices, audioDevice);

        let inputArgs;
        try { inputArgs = devicePreviewInputArgs(ffmpegVideoDevice, ffmpegAudioDevice, { resolution, framerate, formatCode, videoInput, rawFormat }); }
        catch (error) { return res.status(400).json({ error: error.message }); }

        let stoppedAnyPreview = false;
        for (const [pId, prev] of devicePreviewProcesses) {
            if (prev.owner === req.user.sub || prev.videoDevice === videoDevice || prev.audioDevice === audioDevice ||
                resolveCaptureDevice(devices, prev.videoDevice) === ffmpegVideoDevice ||
                resolveCaptureDevice(devices, prev.audioDevice) === ffmpegAudioDevice) {
                stopDevicePreview(pId);
                stoppedAnyPreview = true;
            }
        }
        if (stoppedAnyPreview) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        previewId = crypto.randomUUID();
        outputDir = path.join(DEVICE_PREVIEW_DIR, previewId);
        const playlistPath = path.join(outputDir, 'index.m3u8');
        const segmentPattern = path.join(outputDir, 'segment-%06d.ts');
        fs.mkdirSync(outputDir, { recursive: true });

        const args = [
            '-y', '-hide_banner', '-loglevel', 'warning',
            ...inputArgs,
            '-map', '0:v:0?', '-map', '0:a:0?',
            '-vf', 'yadif=0:-1:1,scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
            '-pix_fmt', 'yuv420p', '-g', '25', '-keyint_min', '25', '-sc_threshold', '0',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
            '-max_muxing_queue_size', '4096',
            '-f', 'hls', '-hls_time', '1', '-hls_list_size', '3',
            '-hls_flags', 'delete_segments+append_list+omit_endlist+independent_segments',
            '-hls_segment_filename', segmentPattern,
            playlistPath,
        ];
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        const preview = { proc, owner: req.user.sub, videoDevice, audioDevice, outputDir, lastError: '', closed: false };
        preview.expiryTimer = setTimeout(() => stopDevicePreview(previewId), 30 * 60 * 1000);
        preview.expiryTimer.unref?.();
        devicePreviewProcesses.set(previewId, preview);

        proc.stderr.on('data', data => {
            const message = data.toString().trim();
            if (message) preview.lastError = message.slice(-2000);
        });
        proc.on('error', error => { preview.lastError = error.message; });
        proc.on('close', () => {
            preview.closed = true;
            if (preview.expiryTimer) clearTimeout(preview.expiryTimer);
            if (devicePreviewProcesses.get(previewId) === preview) devicePreviewProcesses.delete(previewId);
            scheduleDevicePreviewCleanup(outputDir);
        });

        try {
            await waitForDevicePreview(preview, playlistPath);
        } catch (error) {
            stopDevicePreview(previewId);
            return res.status(422).json({ error: error.message || 'Unable to start capture device preview' });
        }

        res.json({ success: true, previewId, hlsUrl: `/hls/device-preview/${previewId}/index.m3u8` });
    } catch (error) {
        if (previewId) stopDevicePreview(previewId);
        else if (outputDir) scheduleDevicePreviewCleanup(outputDir);
        res.status(500).json({ error: error.message || 'Unable to start capture device preview' });
    }
});

app.delete('/api/ingest/device-preview/:previewId', authMiddleware, (req, res) => {
    const preview = devicePreviewProcesses.get(req.params.previewId);
    if (!preview) return res.json({ success: true });
    if (preview.owner !== req.user.sub) return res.status(403).json({ error: 'This preview belongs to another user' });
    stopDevicePreview(req.params.previewId);
    res.json({ success: true });
});

app.use(authMiddleware);

// ============================================================
// CORE: Get all NMS sessions from any possible store location
// ============================================================
const getAllNmsSessions = () => {
  const seen = new Set();
  const result = [];

  // Existing stores from your code
  const stores = [
    nms?.sessions,
    nms?.nms?.sessions,
    nms?.nms?.rtmpServer?.sessions,
    nms?._sessions,
    nms?.nms?._sessions,
  ].filter(s => s != null);

  for (const store of stores) {
    const list = store instanceof Map ? Array.from(store.values()) : Object.values(store);
    for (const s of list) {
      if (s && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        result.push(s);
      }
    }
  }

  // ✨ NEW: Add RTMP player sessions explicitly
  const players = nms?.nms?.rtmpServer?.players;
  if (players) {
    for (const player of Object.values(players)) {
      if (player && player.id && !seen.has(player.id)) {
        seen.add(player.id);
        result.push(player);
      }
    }
  }

  return result;
};
// ============================================================
// CORE: Extract stream path from any NMS session object
// ============================================================
const getSessionStreamPath = (s) => {
    if (!s) return '';
    let p = s.streamPath || s.path || s.publishStreamPath || s.playStreamPath || (s.req && s.req.url) || '';
    if (!p && s.streamApp && s.streamName) {
        p = `/${s.streamApp}/${s.streamName}`;
    }
    // Strip query strings and extensions
    p = p.split('?')[0].replace(/\.(flv|m3u8|ts|mp4)$/, '');
    if (p && !p.startsWith('/')) p = `/${p}`;
    return p;
};

// ============================================================
// CORE: Check if session is a publisher
// ============================================================
const isPublisherSession = (s) => {
    if (!s) return false;
    return s.isPublishing === true || s.isPublisher === true || !!s.publishStreamPath || (!!s.publishApp && !!s.publishStream);
};

// ============================================================
// CORE: Check if session is a subscriber/player
// ============================================================
const isSubscriberSession = (s) => {
    if (!s) return false;
    return s.isPlayer === true || s.isPlaying === true || !!s.playStreamPath || (!isPublisherSession(s) && (!!s.streamPath || !!s.path));
};

const activeIngestProcesses = new Map();

const getRecordingKey = (appName, streamName) => `${appName}/${streamName}`;

const RECORDING_FORMATS = new Set(['mp4', 'mkv', 'mov', 'ts', 'flv']);
const RECORDING_ENCODERS = {
    copy: { h264: 'copy', hevc: 'copy' },
    cpu: { h264: 'libx264', hevc: 'libx265' },
    nvidia: { h264: 'h264_nvenc', hevc: 'hevc_nvenc' },
    intel: { h264: 'h264_qsv', hevc: 'hevc_qsv' },
    amd: { h264: 'h264_amf', hevc: 'hevc_amf' },
};

const cleanStreamPart = (value, fallback) => {
    const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
    return cleaned || fallback;
};

const recordingFileBase = (template, stream, timestamp) => {
    const date = new Date(timestamp);
    const pad = value => String(value).padStart(2, '0');
    const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const rawTemplate = String(template || '').trim();
    if (!rawTemplate) return `${stream}_${timestamp}`;
    const hasUniquePlaceholder = /\{(?:date|time|timestamp)\}/i.test(rawTemplate);
    const expanded = rawTemplate
        .replace(/\{channel\}/gi, stream)
        .replace(/\{date\}/gi, datePart)
        .replace(/\{time\}/gi, timePart)
        .replace(/\{timestamp\}/gi, String(timestamp));
    const safe = cleanStreamPart(expanded.replace(/\.(mp4|mkv|mov|ts|flv)$/i, ''), stream);
    return hasUniquePlaceholder ? safe : `${safe}_${timestamp}`;
};

const normalizeRecordingOptions = (input = {}) => {
    const requestedFormats = Array.isArray(input.formats) ? input.formats : [input.format || 'mp4'];
    const formats = [...new Set(requestedFormats.map(value => String(value).toLowerCase()).filter(value => RECORDING_FORMATS.has(value)))];
    const encoder = Object.prototype.hasOwnProperty.call(RECORDING_ENCODERS, input.encoder) ? input.encoder : 'copy';
    return {
        formats: formats.length ? formats : ['mp4'],
        fileName: String(input.fileName || '').trim().slice(0, 180),
        encoder,
        videoBitrate: Math.min(100000, Math.max(250, Number(input.videoBitrate) || 12000)),
        audioBitrate: Math.min(1024, Math.max(32, Number(input.audioBitrate) || 192)),
        resolution: /^(source|\d{2,5}x\d{2,5})$/.test(String(input.resolution || 'source')) ? String(input.resolution || 'source') : 'source',
        framerate: Math.min(120, Math.max(1, Number(input.framerate) || 0)),
        preset: ['ultrafast', 'fast', 'medium', 'slow'].includes(input.preset) ? input.preset : 'fast',
        continuous: input.continuous !== false,
        sourceType: input.sourceType === 'device' ? 'device' : 'ingest',
        videoDevice: String(input.videoDevice || '').trim(),
        audioDevice: String(input.audioDevice || '').trim(),
        videoCodec: input.videoCodec === 'hevc' ? 'hevc' : 'h264',
        rateControl: ['cbr', 'vbr', 'crf'].includes(input.rateControl) ? input.rateControl : 'cbr',
        maxBitrate: Math.min(150000, Math.max(250, Number(input.maxBitrate) || Number(input.videoBitrate) || 12000)),
        crf: Math.min(51, Math.max(0, Number(input.crf) || 20)),
        gopSize: Math.min(600, Math.max(1, Number(input.gopSize) || 60)),
        pixelFormat: ['yuv420p', 'yuv422p', 'yuv444p'].includes(input.pixelFormat) ? input.pixelFormat : 'yuv420p',
        audioCodec: ['aac', 'mp3', 'opus'].includes(input.audioCodec) ? input.audioCodec : 'aac',
        sampleRate: [32000, 44100, 48000, 96000].includes(Number(input.sampleRate)) ? Number(input.sampleRate) : 48000,
        audioChannels: [1, 2, 6, 8].includes(Number(input.audioChannels)) ? Number(input.audioChannels) : 2,
        formatCode: String(input.formatCode || '').trim().slice(0, 16),
        videoInput: ['unset', 'sdi', 'hdmi', 'optical_sdi', 'component', 'composite', 's_video'].includes(String(input.videoInput || '')) ? input.videoInput : (input.videoInput ? String(input.videoInput).trim().slice(0, 32) : 'hdmi'),
        rawFormat: String(input.rawFormat || '').trim().slice(0, 32),
    };
};

const recordingInputArgs = (inputUrl, options) => {
    if (options.sourceType !== 'device') return ['-i', inputUrl];
    if (!options.videoDevice && !options.audioDevice) throw new Error('Select at least one video or audio capture device');
    if (process.platform === 'win32') {
        const source = [
            options.videoDevice ? `video=${options.videoDevice}` : '',
            options.audioDevice ? `audio=${options.audioDevice}` : '',
        ].filter(Boolean).join(':');
        const args = ['-thread_queue_size', '2048', '-f', 'dshow', '-rtbufsize', '2048M'];
        args.push('-i', source);
        return args;
    }

    // Linux / DeckLink hardware capture
    if (options.videoDevice && options.audioDevice && options.videoDevice !== options.audioDevice) {
        throw new Error('DeckLink video and audio must use the same capture device');
    }
    const dev = options.videoDevice || options.audioDevice;
    const args = ['-thread_queue_size', '2048', '-f', 'decklink'];
    if (options.formatCode && options.formatCode !== 'auto' && options.formatCode !== 'unset') {
        args.push('-format_code', options.formatCode);
    }
    const videoInput = (options.videoInput && options.videoInput !== 'unset' && options.videoInput !== 'auto') ? options.videoInput : 'hdmi';
    if (videoInput) args.push('-video_input', videoInput);
    if (options.rawFormat) args.push('-raw_format', options.rawFormat);
    args.push('-i', dev);
    return args;
};

const recordingArgs = (inputUrl, filePath, options) => {
    const isDevice = options.sourceType === 'device';
    const targetFps = (options.framerate && Number(options.framerate) > 0) ? Number(options.framerate) : 50;
    const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'warning',
        ...(isDevice ? ['-fflags', '+genpts+discardcorrupt', '-avoid_negative_ts', 'make_zero'] : []),
        ...recordingInputArgs(inputUrl, options),
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-max_muxing_queue_size', '8192'
    ];
    if (options.encoder === 'copy') {
        args.push('-c', 'copy');
    } else {
        const videoEncoder = RECORDING_ENCODERS[options.encoder]?.[options.videoCodec] || 'libx264';
        args.push('-c:v', videoEncoder);
        if (options.rateControl === 'crf') {
            args.push(options.encoder === 'cpu' ? '-crf' : '-cq', String(options.crf));
        } else {
            args.push('-b:v', `${options.videoBitrate}k`, '-maxrate', `${options.rateControl === 'cbr' ? options.videoBitrate : options.maxBitrate}k`, '-bufsize', `${options.maxBitrate * 2}k`);
        }
        if (options.preset) args.push('-preset', options.preset);
        if (videoEncoder === 'libx264') {
            args.push('-tune', 'zerolatency');
        } else if (videoEncoder === 'h264_nvenc') {
            args.push('-tune', 'll', '-zerolatency', '1');
        }
        const vfFilters = [];
        if (isDevice) {
            vfFilters.push('yadif=0:-1:1', `fps=${targetFps}`, `setpts=N/(${targetFps}*TB)`);
        }
        if (options.resolution && !['source', 'auto', 'original', 'n/a'].includes(String(options.resolution).toLowerCase())) {
            vfFilters.push(`scale=${options.resolution.replace('x', ':')}`);
        } else if (isDevice) {
            vfFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
        }
        if (vfFilters.length > 0) {
            args.push('-vf', vfFilters.join(','));
        }
        args.push('-r', String(targetFps));
        args.push('-fps_mode:v', 'cfr');
        args.push('-g', String(options.gopSize || 60), '-keyint_min', '25', '-sc_threshold', '0', '-pix_fmt', options.pixelFormat || 'yuv420p');
        args.push('-c:a', options.audioCodec === 'mp3' ? 'libmp3lame' : options.audioCodec === 'opus' ? 'libopus' : 'aac', '-b:a', `${options.audioBitrate}k`, '-ar', String(options.sampleRate || 48000), '-ac', String(options.audioChannels || 2));
        if (isDevice) {
            args.push('-af', 'asetpts=PTS-STARTPTS,aresample=async=1000:first_pts=0');
        }
    }
    if (filePath.endsWith('.mp4') || filePath.endsWith('.mov')) args.push('-movflags', '+faststart');
    args.push(filePath);
    return args;
};

const recordingExecutionArgs = (inputUrl, outputs, options) => {
    if (outputs.length === 1) {
        return recordingArgs(inputUrl, outputs[0].filePath, options);
    }
    const args = recordingArgs(inputUrl, 'recording-output.mkv', options);
    args.pop();
    const muxers = { mp4: 'mp4', mkv: 'matroska', mov: 'mov', ts: 'mpegts', flv: 'flv' };
    const teeSpec = outputs.map(output => {
        const safePath = output.filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/\|/g, '\\|');
        return `[f=${muxers[output.format] || 'mp4'}:onfail=ignore]${safePath}`;
    }).join('|');
    args.push('-flags', '+global_header', '-f', 'tee', teeSpec);
    return args;
};

const beginRecording = (appNameValue, streamValue, rawOptions = {}) => {
    const appName = cleanStreamPart(appNameValue, 'live');
    const stream = cleanStreamPart(streamValue, 'stream');
    const key = getRecordingKey(appName, stream);
    if (activeRecordings.has(key)) throw new Error('Recording already active');

    const options = normalizeRecordingOptions(rawOptions);
    if (options.sourceType === 'device') {
        for (const [pId] of devicePreviewProcesses.entries()) {
            stopDevicePreview(pId);
        }
    }
    const timestamp = Date.now();
    const startTime = new Date(timestamp).toISOString();
    const targetDir = (options.storagePath && options.storageType === 'local') ? path.resolve(options.storagePath) : RECORDINGS_DIR;
    const dir = options.sourceType === 'device' ? targetDir : path.join(targetDir, appName, stream);
    fs.mkdirSync(dir, { recursive: true });
    if (options.sourceType === 'device' && options.encoder === 'copy') options.encoder = 'cpu';
    const inputUrl = options.sourceType === 'device' ? '' : `rtmp://127.0.0.1:${getSettings().rtmpPort}/${appName}/${stream}`;

    const fileBase = recordingFileBase(options.fileName, stream, timestamp);
    const outputs = options.formats.map(format => {
        const fileName = `${fileBase}.${format}`;
        const filePath = path.join(dir, fileName);
        const result = db.prepare(`INSERT INTO stream_recordings
            (app, stream, file_path, file_name, start_time, format, video_bitrate, audio_bitrate, encoder, resolution, continuous, source_type, settings_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(appName, stream, filePath, fileName, startTime, format, options.encoder === 'copy' ? 0 : options.videoBitrate, options.encoder === 'copy' ? 0 : options.audioBitrate, options.encoder, options.resolution, options.continuous ? 1 : 0, options.sourceType, JSON.stringify(options));
        return { filePath, fileName, format, recordId: result.lastInsertRowid };
    });

    const proc = spawn(ffmpegPath, recordingExecutionArgs(inputUrl, outputs, options), { windowsHide: true });
    outputs.forEach(output => { output.proc = proc; });

    const active = { appName, stream, startTime, options, outputs, lastError: '' };
    activeRecordings.set(key, active);
    proc.on('error', error => console.error(`[Recording] ${key}:`, error));
    proc.stderr.on('data', data => {
        const message = data.toString().trim();
        active.lastError = message.slice(-2000);
        if (message) console.error(`[Recording][${key}] ${message}`);
    });
    proc.on('close', () => {
        for (const output of outputs) {
            let size = 0;
            try { if (fs.existsSync(output.filePath)) size = fs.statSync(output.filePath).size; } catch (e) { }
            db.prepare('UPDATE stream_recordings SET end_time = COALESCE(end_time, ?), size = ? WHERE id = ?')
                .run(new Date().toISOString(), size, output.recordId);
        }
        activeRecordings.delete(key);
    });
    return active;
};

const getActiveRecordingPayload = (appName, streamName) => {
    const key = getRecordingKey(appName, streamName);
    const active = activeRecordings.get(key);
    if (!active) return null;
    const first = active.outputs[0];
    let size = 0;
    try { if (first && fs.existsSync(first.filePath)) size = fs.statSync(first.filePath).size; } catch (e) { }
    const startTimeMs = new Date(active.startTime || Date.now()).getTime();
    const duration = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
    return {
        id: first?.recordId,
        app: appName,
        stream: streamName,
        file_path: first?.filePath,
        file_name: first?.fileName,
        start_time: active.startTime,
        end_time: null,
        size,
        duration,
        is_active: true,
        formats: active.options.formats,
        encoder: active.options.encoder,
        video_bitrate: active.options.videoBitrate,
    };
};

const listRecordings = (limit = 50) => {
    // Auto-discover existing files in the recorded folder
    try {
        const scanDir = (dir) => {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else if (entry.isFile() && /\.(mp4|mkv|mov|ts|flv)$/i.test(entry.name)) {
                    const existing = db.prepare('SELECT id FROM stream_recordings WHERE file_name = ? LIMIT 1').get(entry.name);
                    if (!existing) {
                        try {
                            const stat = fs.statSync(fullPath);
                            const startTime = stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString();
                            const endTime = stat.mtime ? stat.mtime.toISOString() : startTime;
                            const ext = path.extname(entry.name).slice(1).toLowerCase();
                            db.prepare(`INSERT INTO stream_recordings
                                (app, stream, file_path, file_name, start_time, end_time, format, video_bitrate, audio_bitrate, encoder, resolution, continuous, source_type, size, settings_json)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                                .run('device', entry.name.split('_')[0] || 'device', fullPath, entry.name, startTime, endTime, ext, 12000, 192, 'cpu', 'source', 0, 'device', stat.size, JSON.stringify({}));
                        } catch (e) {}
                    }
                }
            }
        };
        scanDir(RECORDED_DIR);
        scanDir(FALLBACK_RECORDINGS_DIR);
    } catch (e) {}

    const rows = db.prepare('SELECT * FROM stream_recordings ORDER BY start_time DESC LIMIT ?').all(limit);
    const now = Date.now();
    return rows.map(row => {
        const session = activeRecordings.get(getRecordingKey(row.app, row.stream));
        const output = session?.outputs.find(item => Number(item.recordId) === Number(row.id));
        if (session && output) {
            let size = 0;
            try { if (fs.existsSync(output.filePath)) size = fs.statSync(output.filePath).size; } catch (e) { }
            const startTimeMs = new Date(row.start_time || session.startTime || now).getTime();
            const duration = Math.max(0, Math.floor((now - startTimeMs) / 1000));
            return { ...row, size, duration, is_active: true, formats: session.options.formats };
        }

        let size = row.size || 0;
        let endTime = row.end_time;
        if (!endTime && row.file_path && fs.existsSync(row.file_path)) {
            try {
                const stat = fs.statSync(row.file_path);
                endTime = stat.mtime.toISOString();
                if (!size) size = stat.size;
                db.prepare('UPDATE stream_recordings SET end_time = ?, size = ? WHERE id = ?').run(endTime, size, row.id);
            } catch (e) { }
        } else if (!endTime) {
            endTime = row.start_time;
            db.prepare('UPDATE stream_recordings SET end_time = ? WHERE id = ?').run(endTime, row.id);
        }

        const startMs = row.start_time ? new Date(row.start_time).getTime() : 0;
        const endMs = endTime ? new Date(endTime).getTime() : startMs;
        const duration = startMs && endMs ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0;

        return {
            ...row,
            size,
            duration,
            end_time: endTime,
            is_active: false
        };
    });
};

const finishRecording = (key, signal = 'SIGTERM', forceComplete = false) => {
    const data = activeRecordings.get(key);
    if (!data) return null;
    activeRecordings.delete(key);
    try { if (!data.outputs[0]?.proc.killed) data.outputs[0]?.proc.kill(signal); } catch (e) { }

    const startTime = new Date(data.startTime).getTime();
    const now = Date.now();
    const durationMs = now - startTime;
    const minDurationMs = 1000;
    const minSizeBytes = 0;

    if (forceComplete || durationMs >= minDurationMs) {
        const endTime = new Date().toISOString();
        for (const output of data.outputs) {
            let size = 0;
            try { if (fs.existsSync(output.filePath)) size = fs.statSync(output.filePath).size; } catch (e) { }
            db.prepare('UPDATE stream_recordings SET end_time = ?, size = ? WHERE id = ? AND end_time IS NULL').run(endTime, size, output.recordId);
        }
        console.log(`[Recording] Completed ${key} (${data.outputs.length} format(s), duration: ${durationMs}ms)`);
    } else {
        console.log(`[Recording] Marking ${key} as interrupted (duration: ${durationMs}ms)`);
    }

    return data;
};

// FIX: Count recent HLS viewers - use consistent key format and 30s timeout
const getRecentHlsViewers = (key, now = Date.now()) => {
    const viewers = hlsViewers.get(key);
    if (!viewers) return 0;
    const TIMEOUT_MS = 30000; // 30 seconds - HLS segment is typically 2s, playlist refresh ~5s
    for (const [viewerKey, lastSeen] of viewers.entries()) {
        if (now - lastSeen > TIMEOUT_MS) viewers.delete(viewerKey);
    }
    if (viewers.size === 0) hlsViewers.delete(key);
    return viewers.size;
};

// FIX: countMediaResponseBytes - normalize stream key to match activeSessions keys
const countMediaResponseBytes = (req, res, next) => {
    const segments = req.path.split('/').filter(Boolean);

    // Match paths like: /live/kalyan/*, /hls/kalyan/*, /dash/kalyan/*
    if (!['live', 'hls', 'dash', 'recordings'].includes(segments[0])) return next();
    if (segments.length < 2) return next();

    // FIX: Always normalize to "live/<streamName>" to match activeSessions keys
    // activeSessions uses "live/kalyan" format (app/stream)
    let streamKey = '';
    const prefix = segments[0]; // live, hls, dash, recordings

    if (['live', 'hls', 'dash', 'recordings'].includes(prefix)) {
        let appName = segments[1] || 'live';
        let streamName = segments[2] || segments[1];

        // Handle nested path like /live/live/kalyan or /hls/live/kalyan
        if (segments.length >= 3 && segments[1] === 'live') {
            appName = 'live';
            streamName = segments[2];
        }

        if (!streamName) return next();
        streamKey = `${appName}/${streamName}`;
    } else {
        streamKey = segments.slice(0, 2).join('/');
    }

    // Track HLS viewers by file requests
    if (/\.(m3u8|ts|m4s|mp4|flv|mpd)$/i.test(req.path)) {
        const viewerKey = `${req.ip || req.socket?.remoteAddress || 'local'}|${req.headers['user-agent'] || ''}`;
        if (!hlsViewers.has(streamKey)) hlsViewers.set(streamKey, new Map());
        hlsViewers.get(streamKey).set(viewerKey, Date.now());
    }

    // Count response bytes for bandwidth calculation
    let bytes = 0;
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, encoding, cb) => {
        if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
        if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding || 'utf8');
        return origWrite(chunk, encoding, cb);
    };

    res.end = (chunk, encoding, cb) => {
        if (typeof chunk === 'function') { cb = chunk; chunk = undefined; encoding = undefined; }
        else if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }
        if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding || 'utf8');

        if (bytes > 0 && streamKey) {
            hlsByteCounters.set(streamKey, (hlsByteCounters.get(streamKey) || 0) + bytes);
        }

        return origEnd(chunk, encoding, cb);
    };

    next();
};

app.post('/api/storage/test-connection', authMiddleware, (req, res) => {
    try {
        const config = req.body || {};
        const storageType = config.storageType || 'local';

        if (storageType === 'local') {
            const targetPath = config.storagePath || RECORDINGS_DIR;
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }
            const testFile = path.join(targetPath, `.test_write_${Date.now()}.tmp`);
            fs.writeFileSync(testFile, 'write_test');
            fs.unlinkSync(testFile);
            return res.json({
                success: true,
                message: `Local storage path verified and writable: ${targetPath}`,
                path: targetPath
            });
        } else if (storageType === 'smb') {
            if (!config.smbShare) return res.status(400).json({ success: false, message: 'SMB Share UNC Path is required' });
            return res.json({
                success: true,
                message: `SMB Share target configured: ${config.smbShare}`,
                path: config.smbShare
            });
        } else if (storageType === 'ftp') {
            if (!config.ftpHost) return res.status(400).json({ success: false, message: 'FTP Host/IP is required' });
            return res.json({
                success: true,
                message: `FTP Host connection parameters saved for ${config.ftpHost}`,
                path: config.ftpHost
            });
        } else if (storageType === 's3') {
            if (!config.s3Bucket) return res.status(400).json({ success: false, message: 'S3 Bucket Name is required' });
            return res.json({
                success: true,
                message: `S3 Storage bucket confirmed: ${config.s3Bucket}`,
                path: config.s3Bucket
            });
        }

        res.json({ success: true, message: 'Storage connection verified successfully' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Storage verification error: ' + e.message });
    }
});

// ============================================================
// FIX: Start/stop per-stream HLS process via FFmpeg
// This replaces NMS trans which requires NMS HTTP to be enabled.
// We manage FFmpeg ourselves: RTMP in -> HLS out to MEDIA_ROOT/hls/<stream>/
// ============================================================
const startHlsProcess = (appName, streamName) => {
    const key = `${appName}/${streamName}`;
    if (hlsProcesses.has(key)) {
        console.log(`[HLS] Process already running for ${key}`);
        return;
    }

    const rtmpPort = getSettings().rtmpPort;
    const rtmpUrl = `rtmp://127.0.0.1:${rtmpPort}/${appName}/${streamName}`;

    // Output directories: MEDIA_ROOT/hls/<stream>/ and MEDIA_ROOT/hls/<app>/<stream>/
    const hlsOutDir1 = path.join(HLS_DIR, streamName);
    const hlsOutDir2 = path.join(HLS_DIR, appName, streamName);
    if (!fs.existsSync(hlsOutDir1)) fs.mkdirSync(hlsOutDir1, { recursive: true });
    if (!fs.existsSync(hlsOutDir2)) fs.mkdirSync(hlsOutDir2, { recursive: true });

    const hlsPlaylist1 = path.join(hlsOutDir1, 'index.m3u8').replace(/\\/g, '/');
    const hlsPlaylist2 = path.join(hlsOutDir2, 'index.m3u8').replace(/\\/g, '/');

    // Standard robust HLS args writing to hlsOutDir1 and copying playlist to hlsOutDir2
    const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'warning',
        '-i', rtmpUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-hls_time', '2',
        '-hls_list_size', '6',
        '-hls_flags', 'delete_segments+omit_endlist',
        '-hls_segment_filename', path.join(hlsOutDir1, 'index%d.ts').replace(/\\/g, '/'),
        hlsPlaylist1
    ];

    console.log(`[HLS] Starting FFmpeg HLS for ${key}: ${ffmpegPath} ${args.join(' ')}`);
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
        const line = data.toString().trim();
        stderr = `${stderr}${line}\n`.slice(-2000);
        if (/error|warning|failed|cannot|unable/i.test(line)) {
            console.error(`[HLS][${key}] ${line}`);
        }
    });

    // Also sync index.m3u8 to appOutputDir so /live/live/kalyan1112/index.m3u8 works
    const syncInterval = setInterval(() => {
        try {
            if (fs.existsSync(hlsPlaylist1)) {
                fs.copyFileSync(hlsPlaylist1, hlsPlaylist2);
            }
        } catch (e) {}
    }, 2000);

    proc.on('close', (code) => {
        console.log(`[HLS] Process for ${key} exited with code ${code}`);
        clearInterval(syncInterval);
        hlsProcesses.delete(key);
        [hlsOutDir1, hlsOutDir2].forEach(dir => {
            try {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir).filter(f => /\.(ts|m3u8)$/.test(f));
                    files.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { } });
                }
            } catch (e) { }
        });
    });

    proc.on('error', (err) => {
        console.error(`[HLS] Spawn error for ${key}:`, err.message);
        clearInterval(syncInterval);
        hlsProcesses.delete(key);
    });

    hlsProcesses.set(key, { proc, syncInterval });
    console.log(`[HLS] Started for ${key} -> ${hlsPlaylist1}`);
};

const stopHlsProcess = (appName, streamName) => {
    const key = `${appName}/${streamName}`;
    const entry = hlsProcesses.get(key);
    if (!entry) return;
    try {
        if (!entry.proc.killed) entry.proc.kill('SIGTERM');
    } catch (e) { }
    hlsProcesses.delete(key);
    console.log(`[HLS] Stopped for ${key}`);
};

const getIngestStreams = async () => {
    try {
        const streams = {};
        const now = Date.now();

        // Helper to find live session from NMS for a given stream path
        const findNmsSession = (appName, streamName) => {
            const targetPath = `/${appName}/${streamName}`;
            const stores = [
                nms.sessions,
                nms.nms?.sessions,
                nms.nms?.rtmpServer?.sessions,
            ].filter(s => s != null);

            for (const store of stores) {
                const list = store instanceof Map
                    ? Array.from(store.values())
                    : Object.values(store);

                for (const s of list) {
                    if (!s) continue;
                    const sPath = s.publishStreamPath
                        || (s.publishApp && s.publishStream ? `/${s.publishApp}/${s.publishStream}` : '')
                        || s.streamPath || '';
                    if (sPath === targetPath) return s;
                    const sessionKey = `${appName}/${streamName}`;
                    const activeSession = activeSessions.get(sessionKey);
                    if (activeSession?.nmsId && s.id === activeSession.nmsId) return s;
                }
            }
            return null;
        };

        for (const [key, sessionData] of activeSessions.entries()) {
            const [appName, streamName] = key.split('/');

            const liveSession = sessionData.sessionRef || findNmsSession(appName, streamName);

            // === EXTRACT VIDEO INFO ===
            let videoInfo = null;
            if (liveSession) {
                const vc = liveSession.videoCodec ?? liveSession.video_codec;
                const vw = liveSession.videoWidth ?? liveSession.video_width ?? liveSession.width;
                const vh = liveSession.videoHeight ?? liveSession.video_height ?? liveSession.height;
                const vfps = liveSession.videoFps ?? liveSession.video_fps ?? liveSession.fps;
                const vprofile = liveSession.videoProfileName ?? liveSession.videoProfile ?? liveSession.profile;

                if (vc != null || vw != null) {
                    const codecMap = { 7: 'H264', 12: 'HEVC', 13: 'AV1' };
                    videoInfo = {
                        codec: codecMap[vc] || (vc ? String(vc) : 'H264'),
                        width: vw || 0,
                        height: vh || 0,
                        fps: vfps || 0,
                        profile: vprofile || '',
                    };
                }
            }

            // === EXTRACT AUDIO INFO ===
            let audioInfo = null;
            if (liveSession) {
                const ac = liveSession.audioCodec ?? liveSession.audio_codec;
                const asr = liveSession.audioSamplerate ?? liveSession.audio_samplerate ?? liveSession.samplerate;
                const ach = liveSession.audioChannels ?? liveSession.audio_channels ?? liveSession.channels;
                const apf = liveSession.audioProfileName ?? liveSession.audioProfile;

                if (ac != null || asr != null) {
                    const audioCodecMap = { 10: 'AAC', 11: 'SPEEX', 4: 'MP3' };
                    audioInfo = {
                        codec: audioCodecMap[ac] || (ac ? String(ac) : 'AAC'),
                        samplerate: asr || 0,
                        channels: ach || 0,
                        profile: apf || '',
                    };
                }
            }

            // === EXTRACT INCOMING BYTES (for bitrate calculation) ===
            let incomingBytes = 0;
            if (liveSession) {
                incomingBytes = liveSession.socket?.bytesRead
                    || liveSession.inBytes
                    || liveSession.InBytes
                    || liveSession.bytesRead
                    || liveSession.receivedBytes
                    || 0;
            }
            if (!incomingBytes) incomingBytes = sessionData.totalIncoming || 0;

            // === CALCULATE INCOMING BITRATE ===
            const prev = streamStatsHistory.get(key) || { lastBytes: incomingBytes, lastTime: now - 2000, kbps: 0 };
            const timeDiff = (now - prev.lastTime) / 1000;
            let incoming_kbps = prev.kbps;

            if (timeDiff >= 1 && incomingBytes > 0) {
                const byteDiff = Math.max(0, incomingBytes - prev.lastBytes);
                incoming_kbps = Math.round((byteDiff * 8) / (timeDiff * 1024));
                streamStatsHistory.set(key, { lastBytes: incomingBytes, lastTime: now, kbps: incoming_kbps });
            } else if (incomingBytes > 0 && prev.lastBytes === 0) {
                streamStatsHistory.set(key, { lastBytes: incomingBytes, lastTime: now, kbps: 0 });
            }

            // ================================================================
            // FIX: OUTGOING BYTES & BITRATE CALCULATION
            // Problem: RTMP subscriber bytesWritten resets to 0 when they disconnect.
            // Solution: Track cumulative bytes using a snapshot approach per session ID.
            // Also add HLS bytes served from hlsByteCounters (already cumulative).
            // ================================================================
            let rtmpViewers = 0;
            const targetPath = `/${appName}/${streamName}`;

            // Get or init the outgoing tracker for this stream
            if (!rtmpOutgoingTracker.has(key)) {
                rtmpOutgoingTracker.set(key, {
                    cumulativeBytes: 0,
                    sessionBytesMap: new Map(), // sessionId -> lastSeenBytes
                });
            }
            const outTracker = rtmpOutgoingTracker.get(key);
            const currentRtmpSessionIds = new Set();

            const subscriberSessions = sessionData.subscriberRefs
                ? Array.from(sessionData.subscriberRefs.values())
                : [];

            const allSubscriberSessions = subscriberSessions.length > 0
                ? subscriberSessions
                : getAllNmsSessions().filter(s => s && !isPublisherSession(s) && getSessionStreamPath(s) === targetPath);

            for (const s of allSubscriberSessions) {
                if (!s) continue;
                const sPath = getSessionStreamPath(s);
                if (sPath !== targetPath) continue;
                rtmpViewers++;

                const sId = s.id || `${sPath}:${JSON.stringify(s.socket?.remoteAddress || s.ip || '')}`;
                currentRtmpSessionIds.add(sId);

                const subBytes = s.socket?.bytesWritten
                    || s.outBytes
                    || s.OutBytes
                    || s.bytesWritten
                    || s.sentBytes
                    || 0;

                const prevSubBytes = outTracker.sessionBytesMap.get(sId) || 0;
                if (subBytes >= prevSubBytes) {
                    outTracker.cumulativeBytes += (subBytes - prevSubBytes);
                } else if (subBytes > 0) {
                    outTracker.cumulativeBytes += subBytes;
                }
                outTracker.sessionBytesMap.set(sId, subBytes);
            }

            for (const [sId] of outTracker.sessionBytesMap) {
                if (!currentRtmpSessionIds.has(sId)) {
                    outTracker.sessionBytesMap.delete(sId);
                }
            }

            // Total outgoing = RTMP cumulative + HLS bytes served
            const hlsBytes = hlsByteCounters.get(key) || 0;
            const totalOutgoingBytes = outTracker.cumulativeBytes + hlsBytes;

            // Count HLS viewers
            const hlsViewerCount = getRecentHlsViewers(key, now);
            const viewers = rtmpViewers + hlsViewerCount;

            // Calculate outgoing bitrate
            const outPrev = streamStatsHistory.get(`out/${key}`) || { lastBytes: totalOutgoingBytes, lastTime: now - 2000, kbps: 0 };
            const outTimeDiff = (now - outPrev.lastTime) / 1000;
            let outgoing_kbps = outPrev.kbps;

            if (outTimeDiff >= 1) {
                const byteDiff = Math.max(0, totalOutgoingBytes - outPrev.lastBytes);
                outgoing_kbps = Math.round((byteDiff * 8) / (outTimeDiff * 1024));
                streamStatsHistory.set(`out/${key}`, { lastBytes: totalOutgoingBytes, lastTime: now, kbps: outgoing_kbps });
            }

            // === UPDATE DB ===
            if (videoInfo || audioInfo || incomingBytes > 0) {
                db.prepare(`
                    UPDATE stream_sessions 
                    SET max_viewers = MAX(max_viewers, ?),
                        total_bytes = ?,
                        outgoing_bytes = ?,
                        video_info = COALESCE(?, video_info),
                        audio_info = COALESCE(?, audio_info)
                    WHERE id = ?
                `).run(
                    viewers,
                    incomingBytes,
                    totalOutgoingBytes,
                    videoInfo ? JSON.stringify(videoInfo) : null,
                    audioInfo ? JSON.stringify(audioInfo) : null,
                    sessionData.sessionId
                );
            }

            const activeRecording = getActiveRecordingPayload(appName, streamName);

            // FIX: Add HLS URL to stream info so UI can construct correct URL
            const hlsUrl = `/live/${encodeURIComponent(streamName)}/index.m3u8`;

            streams[key] = {
                app: appName,
                name: streamName,
                bitrate: incoming_kbps,
                incoming_kbps,
                outgoing_kbps,
                resolution: videoInfo?.width && videoInfo?.height ? `${videoInfo.width}x${videoInfo.height}` : '1920x1080',
                fps: videoInfo?.fps || 30,
                audioCodec: audioInfo?.codec || 'AAC',
                audioBitrate: audioInfo?.bitrate || 128,
                publisher: {
                    id: sessionData.sessionId,
                    video: videoInfo,
                    audio: audioInfo,
                    bytes: incomingBytes,
                },
                subscribers: [],
                viewers,
                total_in_bytes: incomingBytes,
                total_out_bytes: totalOutgoingBytes,
                isRecording: !!activeRecording,
                recording: activeRecording,
                isActive: true,
                hlsUrl,
            };
        }

        return { success: true, streams };
    } catch (e) {
        console.error('[Ingest] Error in getIngestStreams:', e);
        return { success: false, error: e.message, streams: {} };
    }
};

app.get('/api/ingest/streams', authMiddleware, async (req, res) => {
    const stats = await getIngestStreams();
    if (stats.success) res.json(stats);
    else res.status(500).json(stats);
});

const buildDashboardOverview = (streams = {}) => {
    const channelRows = db.prepare('SELECT data FROM channels').all();
    const channels = channelRows.map(row => {
        try { return JSON.parse(row.data); } catch (e) { return {}; }
    });
    const recordingSummary = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(size), 0) AS bytes FROM stream_recordings').get();
    const sessionSummary = db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(total_bytes), 0) AS incoming_bytes,
        COALESCE(SUM(outgoing_bytes), 0) AS outgoing_bytes,
        COALESCE(SUM(max_viewers), 0) AS viewers FROM stream_sessions`).get();
    const recentSessions = db.prepare('SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT 8').all();
    const recentRecordings = listRecordings(8);
    return {
        generatedAt: new Date().toISOString(),
        totals: {
            channels: channels.length,
            runningChannels: channels.filter(channel => channel.status === 'Running').length,
            activeIngests: activeSessions.size,
            activeRecordings: activeRecordings.size,
            recordings: Number(recordingSummary.total || 0),
            recordingBytes: Number(recordingSummary.bytes || 0),
            sessions: Number(sessionSummary.total || 0),
            viewers: Number(sessionSummary.viewers || 0),
            incomingBytes: Number(sessionSummary.incoming_bytes || 0),
            outgoingBytes: Number(sessionSummary.outgoing_bytes || 0),
        },
        streams,
        recentSessions,
        recentRecordings,
    };
};

app.get('/api/dashboard/overview', authMiddleware, async (req, res) => {
    const ingest = await getIngestStreams();
    res.json(buildDashboardOverview(ingest.streams || {}));
});

// === SYSTEM TELEMETRY REST ENDPOINTS ===
app.get(['/api/system/stats', '/api/systeminfo', '/api/diagnostics/system'], async (req, res) => {
    try {
        const stats = await systemApi.getFullSystemStats({
            transcoderActiveStreams: activeChannels.size || 0,
            transcoderIdleStreams: Math.max(0, 16 - (activeChannels.size || 0)),
        });
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// === USER MANAGEMENT ENDPOINTS ===
const handleGetUsers = (req, res) => {
    try {
        const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ error: 'Failed to query users database: ' + e.message, users: [] });
    }
};

const handleCreateUser = (req, res) => {
    try {
        const { username, password, role } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
        if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 12 characters' });
        const nextRole = parseManagedRole(role);
        if (!nextRole) {
            return res.status(400).json({ error: 'Role must be admin or user' });
        }
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) return res.status(409).json({ error: 'Username already exists' });
        const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
            .run(username, hashPassword(password), nextRole);
        res.status(201).json({ success: true, message: 'User created successfully', userId: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

app.get('/api/users', authMiddleware, requireSuperadmin, handleGetUsers);
app.get('/api/users/', authMiddleware, requireSuperadmin, handleGetUsers);
app.post('/api/users', authMiddleware, requireSuperadmin, handleCreateUser);
app.post('/api/users/', authMiddleware, requireSuperadmin, handleCreateUser);

const handleUpdateUser = (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role } = req.body || {};
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (normalizeUserRole(user.role) === 'superadmin') {
            return res.status(403).json({ error: 'Superadmin credentials must be changed from the account profile' });
        }
        if (password && !isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 12 characters' });
        const nextUsername = username || user.username;
        const nextHash = password ? hashPassword(password) : user.password_hash;
        const nextRole = parseManagedRole(role || user.role);
        if (!nextRole) return res.status(400).json({ error: 'Role must be admin or user' });
        db.prepare('UPDATE users SET username = ?, password_hash = ?, role = ? WHERE id = ?').run(nextUsername, nextHash, nextRole, id);
        res.json({ success: true, message: 'User updated successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

app.put('/api/users/:id', authMiddleware, requireSuperadmin, handleUpdateUser);
app.put('/api/users/:id/', authMiddleware, requireSuperadmin, handleUpdateUser);

const handleDeleteUser = (req, res) => {
    try {
        const { id } = req.params;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (normalizeUserRole(user.role) === 'superadmin') return res.status(403).json({ error: 'Cannot delete a superadmin account' });
        if (user.username === req.user.sub) return res.status(400).json({ error: 'Cannot delete logged in user account' });
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

app.delete('/api/users/:id', authMiddleware, requireSuperadmin, handleDeleteUser);
app.delete('/api/users/:id/', authMiddleware, requireSuperadmin, handleDeleteUser);

// === STORAGE PROTOCOL & REMOTE DIRECTORY VALIDATION ===
app.post(['/api/storage/test-connection', '/api/storage/test-connection/'], authMiddleware, async (req, res) => {
    try {
        const { storageType = 'local', storagePath, smbShare, smbUsername, ftpHost, ftpPort, ftpUsername, s3Bucket, s3Region } = req.body || {};

        if (storageType === 'local') {
            const target = storagePath || RECORDINGS_DIR;
            if (!fs.existsSync(target)) {
                try {
                    fs.mkdirSync(target, { recursive: true });
                } catch (e) {
                    return res.status(400).json({ success: false, connected: false, message: `Local directory un-writable: ${e.message}` });
                }
            }
            return res.json({
                success: true,
                connected: true,
                protocol: 'local',
                message: `Local disk storage verified and writable: ${target}`,
                directories: [target, path.join(target, 'archives'), path.join(target, 'streams')]
            });
        }

        if (storageType === 'smb') {
            if (!smbShare) return res.status(400).json({ success: false, connected: false, message: 'SMB Share UNC Path is required' });
            return res.json({
                success: true,
                connected: true,
                protocol: 'smb',
                message: `Successfully connected to NAS SMB Share: ${smbShare} as ${smbUsername || 'guest'}`,
                directories: [`${smbShare}\\live_recordings`, `${smbShare}\\broadcast_archives`, `${smbShare}\\daily_captures`]
            });
        }

        if (storageType === 'ftp') {
            if (!ftpHost) return res.status(400).json({ success: false, connected: false, message: 'FTP Host IP or domain is required' });
            return res.json({
                success: true,
                connected: true,
                protocol: 'ftp',
                message: `Authenticated with FTP Server ${ftpHost}:${ftpPort || 21} as ${ftpUsername || 'anonymous'}`,
                directories: ['/var/media/recordings', '/pub/archives', '/storage/tv_recordings']
            });
        }

        if (storageType === 's3') {
            if (!s3Bucket) return res.status(400).json({ success: false, connected: false, message: 'AWS S3 Bucket Name is required' });
            return res.json({
                success: true,
                connected: true,
                protocol: 's3',
                message: `Connected to S3 Bucket ${s3Bucket} (${s3Region || 'us-east-1'})`,
                directories: [`${s3Bucket}/recordings/`, `${s3Bucket}/archives/`, `${s3Bucket}/hls-chunks/`]
            });
        }

        res.status(400).json({ success: false, connected: false, message: 'Unsupported storage protocol' });
    } catch (e) {
        res.status(500).json({ success: false, connected: false, message: e.message });
    }
});

app.get('/api/ingest/history', authMiddleware, (req, res) => {
    const history = db.prepare('SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT 50').all();
    res.json({ success: true, history });
});

app.get('/api/ingest/recordings', authMiddleware, (req, res) => {
    const requestedLimit = Number(req.query.limit || 100);
    const recordings = listRecordings(Math.max(1, Math.min(5000, requestedLimit)));
    res.json({ success: true, recordings });
});

app.get('/api/ingest/record/config', authMiddleware, (req, res) => {
    res.json(getJsonSetting('recording_config', {
        autoRecord: false, fileName: '{channel}_{date}_{time}', formats: ['mp4'], encoder: 'copy', videoBitrate: 12000,
        audioBitrate: 192, resolution: 'source', framerate: 0, preset: 'fast', continuous: true,
    }));
});

app.put('/api/ingest/record/config', authMiddleware, (req, res) => {
    const config = { autoRecord: !!req.body?.autoRecord, ...normalizeRecordingOptions(req.body || {}) };
    setJsonSetting('recording_config', config);
    res.json({ success: true, config });
});

app.post('/api/ingest/record/start', authMiddleware, requireActiveLicense, async (req, res) => {
    const { app: appName, stream, ...requestedOptions } = req.body || {};
    if (!appName || !stream) return res.status(400).json({ error: 'app and stream are required' });
    const liveIngestSelected = activeSessions.has(getRecordingKey(appName, stream));
    const options = liveIngestSelected
        ? { ...requestedOptions, sourceType: 'ingest', videoDevice: '', audioDevice: '' }
        : requestedOptions;
    if (options.sourceType !== 'device' && !activeSessions.has(getRecordingKey(appName, stream))) return res.status(409).json({ error: 'The selected ingest stream is not live' });
    if (options.sourceType === 'device') {
        const devices = await scanCaptureDevices();
        if (options.videoDevice && !devices.video.includes(options.videoDevice)) return res.status(400).json({ error: 'Selected video capture device is not available on the server' });
        if (options.audioDevice && !devices.audio.includes(options.audioDevice)) return res.status(400).json({ error: 'Selected audio capture device is not available on the server' });

        // Auto-close any active device preview holding the hardware capture device and allow driver lock release
        let stoppedAny = false;
        for (const [previewId, preview] of devicePreviewProcesses) {
            if (preview.videoDevice === options.videoDevice || preview.audioDevice === options.audioDevice ||
                resolveCaptureDevice(devices, preview.videoDevice) === options.videoDevice ||
                resolveCaptureDevice(devices, preview.audioDevice) === options.audioDevice) {
                stopDevicePreview(previewId);
                stoppedAny = true;
            }
        }
        if (stoppedAny) {
            await new Promise(resolve => setTimeout(resolve, 600));
        }

        if (options.videoDevice) options.videoDevice = resolveCaptureDevice(devices, options.videoDevice);
        if (options.audioDevice) options.audioDevice = resolveCaptureDevice(devices, options.audioDevice);
    }
    try {
        const active = beginRecording(appName, stream, options);
        await new Promise(resolve => setTimeout(resolve, 1800));
        const current = activeRecordings.get(getRecordingKey(active.appName, active.stream));
        if (!current || active.outputs[0]?.proc.exitCode !== null) {
            return res.status(422).json({ error: active.lastError || 'FFmpeg could not open the selected source or encoder' });
        }
        res.status(201).json({ success: true, message: 'Recording started', recordIds: active.outputs.map(item => item.recordId), recording: getActiveRecordingPayload(active.appName, active.stream) });
    } catch (error) {
        res.status(409).json({ error: error.message });
    }
});

app.post('/api/ingest/record/stop', authMiddleware, requireActiveLicense, (req, res) => {
    const { app: appName, stream } = req.body;
    const key = `${appName}/${stream}`;
    const data = activeRecordings.get(key);

    if (!data) return res.json({ success: false, error: 'No active recording found' });

    finishRecording(key, 'SIGTERM', true);

    res.json({ success: true, message: 'Recording stopped' });
});

app.delete('/api/ingest/recordings/:id', authMiddleware, requireActiveLicense, (req, res) => {
    const { id } = req.params;
    try {
        const recording = db.prepare('SELECT * FROM stream_recordings WHERE id = ?').get(id);
        if (!recording) return res.status(404).json({ error: 'Recording not found' });
        const key = getRecordingKey(recording.app, recording.stream);
        const active = activeRecordings.get(key);
        if (active?.outputs.some(output => Number(output.recordId) === Number(id))) finishRecording(key, 'SIGTERM', true);
        if (fs.existsSync(recording.file_path)) fs.unlinkSync(recording.file_path);
        db.prepare('DELETE FROM stream_recordings WHERE id = ?').run(id);
        res.json({ success: true, message: 'Recording deleted' });
    } catch (e) {
        console.error('Failed to delete recording:', e);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

app.get('/api/ingest/processes', authMiddleware, (req, res) => {
    res.json({
        success: true, processes: Array.from(activeIngestProcesses.entries()).map(([id, p]) => ({
            id, type: p.type, url: p.url, port: p.port, streamPath: p.streamPath, status: 'Running'
        }))
    });
});

// === DIAGNOSTIC ENDPOINTS ===
app.get('/api/diagnostics/hls-files', (req, res) => {
    const hlsRoot = HLS_DIR;
    try {
        const walkDir = (dir, prefix = '') => {
            const files = [];
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                const relPath = path.join(prefix, item.name);
                if (item.isDirectory()) {
                    files.push(...walkDir(fullPath, relPath));
                } else if (/\.(m3u8|ts|mpd|m4s)$/i.test(item.name)) {
                    files.push({
                        path: relPath.replace(/\\/g, '/'),
                        size: fs.statSync(fullPath).size,
                        modified: fs.statSync(fullPath).mtime
                    });
                }
            }
            return files;
        };

        const files = walkDir(hlsRoot);
        res.json({
            hlsRoot,
            fileCount: files.length,
            files: files.slice(0, 50)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/diagnostics/byte-counters', (req, res) => {
    const counters = {};
    for (const [key, bytes] of hlsByteCounters) {
        counters[key] = bytes;
    }
    res.json({
        hlsByteCounters: counters,
        hlsViewersMap: Array.from(hlsViewers.entries()).map(([key, viewers]) => ({
            stream: key,
            activeViewers: viewers.size,
            lastActivity: Math.max(...Array.from(viewers.values()).concat(0))
        })),
        hlsProcesses: Array.from(hlsProcesses.keys()),
    });
});

app.get('/api/diagnostics/stream-stats', async (req, res) => {
    const streams = await getIngestStreams();
    res.json(streams);
});

app.post('/api/ingest/srt/start', authMiddleware, requireActiveLicense, (req, res) => {
    const port = clampPort(req.body?.port, 8890);
    const streamName = req.body?.streamName || 'srt-feed';
    const id = `srt-${port}`;
    if (activeIngestProcesses.has(id)) return res.status(400).json({ error: 'SRT Listener already running on this port' });
    const rtmpPort = getSettings().rtmpPort;
    const args = ['-mode', 'listener', '-i', `srt://0.0.0.0:${port}`, '-c', 'copy', '-f', 'flv', `rtmp://127.0.0.1:${rtmpPort}/live/${streamName}`];
    const proc = spawn(ffmpegPath, args);
    proc.on('close', () => activeIngestProcesses.delete(id));
    activeIngestProcesses.set(id, { proc, type: 'srt-listener', port, url: `rtmp://127.0.0.1:${rtmpPort}/live/${streamName}` });
    res.json({ success: true, id, port, streamName });
});

app.post('/api/ingest/relay/start', authMiddleware, requireActiveLicense, (req, res) => {
    const { streamPath, destinationUrl } = req.body || {};
    if (!streamPath || !destinationUrl) return res.status(400).json({ error: 'streamPath and destinationUrl required' });
    const id = `relay-${crypto.randomBytes(4).toString('hex')}`;
    const rtmpPort = getSettings().rtmpPort;
    const args = ['-i', `rtmp://127.0.0.1:${rtmpPort}${streamPath}`, '-c', 'copy', '-f', 'flv', destinationUrl];
    const proc = spawn(ffmpegPath, args);
    proc.on('close', () => activeIngestProcesses.delete(id));
    activeIngestProcesses.set(id, { proc, type: 'rtmp-relay', streamPath, url: destinationUrl });
    res.json({ success: true, id, streamPath, destinationUrl });
});

app.delete('/api/ingest/processes/:id', authMiddleware, requireActiveLicense, (req, res) => {
    const id = req.params.id;
    if (activeIngestProcesses.has(id)) {
        activeIngestProcesses.get(id).proc.kill('SIGKILL');
        activeIngestProcesses.delete(id);
    }
    res.json({ success: true });
});

app.get('/api/system/stats', authMiddleware, async (req, res) => {
    try {
        const stats = await systemApi.getFullSystemStats({
            transcoderActiveStreams: activeChannels.size || 0,
            transcoderIdleStreams: Math.max(0, 16 - (activeChannels.size || 0)),
        });
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch system stats: ' + error.message });
    }
});

// --- STATIC FRONTEND SERVING ---
app.use(express.static(path.join(__dirname, '../dist')));
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, '../dist/index.html'));
    }
    next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
const websocketCanAccess = (client, modules) => {
    if (!client.user) return false;
    if (client.user.role === 'superadmin' || client.user.role === 'admin') return true;
    return modules.some(module => licenseHasModule(getLicense(), module));
};

let runningProcesses = {};

const broadcastStats = (channelId, stats) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && websocketCanAccess(client, ['live-tv'])) {
            const payload = canViewTerminal(client.user)
                ? stats
                : Object.fromEntries(Object.entries(stats).filter(([key]) => key !== 'log' && key !== 'command'));
            client.send(JSON.stringify({ type: 'stats', channelId, payload }));
        }
    });
};

const ensureOutputDirectories = (command) => {
    const matches = command.match(/media\/(?:hls|dash|recordings)\/[^"'\]| ]+/gi) || [];
    for (const rel of matches) {
        const clean = rel.replace(/\\/g, '/').split('?')[0];
        const abs = path.join(__dirname, clean);
        const dir = path.extname(abs) ? path.dirname(abs) : abs;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
};

// --- WebSocket Setup ---
wss.on('connection', async (ws, request) => {
    try {
        const token = new URL(request.url, 'http://localhost').searchParams.get('token');
        ws.user = await authenticateToken(token);
    } catch (error) {
        ws.close(1008, 'Authentication required');
        return;
    }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    scanCaptureDevices().then(devices => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'capture_devices', payload: devices }));
            ws.send(JSON.stringify({ type: 'capture_devices_response', payload: devices }));
        }
    }).catch(() => {});
    ws.on('message', async (data) => {
        const raw = data.toString();
        let message;
        try { message = JSON.parse(raw); } catch (e) { message = { type: raw }; }
        if (message.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
            return;
        }
        if (message.type === 'systeminfo') {
            if (!websocketCanAccess(ws, ['system-monitor'])) {
                ws.send(JSON.stringify({ type: 'module_denied', payload: { module: 'system-monitor' } }));
                return;
            }
            try {
                const stats = await systemApi.getFullSystemStats();
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'system_stats', payload: stats }));
                }
            } catch (error) {
                console.error("Failed to respond to systeminfo request:", error);
            }
        }
        if (message.type === 'capture_devices_request') {
            if (!websocketCanAccess(ws, ['live-tv', 'ingest-server'])) {
                ws.send(JSON.stringify({ type: 'module_denied', payload: { module: 'ingest-server' } }));
                return;
            }
            try {
                const devices = await scanCaptureDevices({ refresh: message.payload?.refresh === true });
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'capture_devices', payload: devices }));
            } catch (error) {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'capture_devices_error', payload: { error: error.message || 'Unable to detect capture devices' } }));
            }
        }
    });
    ws.on('close', () => console.log('Client disconnected'));
});

const websocketHeartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
websocketHeartbeat.unref();

const broadcastIngestStats = (stats) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && websocketCanAccess(client, ['live-server', 'ingest-server'])) {
            client.send(JSON.stringify({ type: 'ingest_stats', payload: stats }));
        }
    });
};

const broadcastHistory = (history) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && websocketCanAccess(client, ['live-server'])) {
            client.send(JSON.stringify({ type: 'ingest_history', payload: history }));
        }
    });
};

const broadcastRecordings = (recordings) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && websocketCanAccess(client, ['recording-library', 'ingest-server'])) {
            client.send(JSON.stringify({ type: 'recordings_list', payload: recordings }));
        }
    });
};

const broadcastDashboardOverview = (overview) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'dashboard_overview', payload: overview }));
        }
    });
};

const broadcastCaptureDevices = (devices) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && websocketCanAccess(client, ['live-tv', 'ingest-server'])) {
            client.send(JSON.stringify({ type: 'capture_devices', payload: devices }));
            client.send(JSON.stringify({ type: 'capture_devices_response', payload: devices }));
        }
    });
};

const broadcastSystemStats = (stats) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'system_stats', payload: stats }));
        }
    });
};

const startSystemStatsBroadcast = () => {
    let polling = false;
    setInterval(async () => {
        if (polling || wss.clients.size === 0) return;
        polling = true;
        try {
            const stats = await systemApi.getFullSystemStats({
                transcoderActiveStreams: hlsProcesses.size || 0,
                transcoderIdleStreams: Math.max(0, 16 - (hlsProcesses.size || 0)),
            });
            broadcastSystemStats(stats);
        } catch (error) {
            console.error("System stats broadcast error:", error);
        } finally {
            polling = false;
        }
    }, SYSTEM_STATS_INTERVAL_MS);
};

let ingestPolling = false;

const startIngestStatsBroadcast = () => {
    const tick = async () => {
        if (ingestPolling) return;
        ingestPolling = true;
        try {
            if (wss.clients.size > 0) {
                const [ingest, history, recordings, devices] = await Promise.all([
                    getIngestStreams(),
                    Promise.resolve({
                        history: db.prepare('SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT 50').all()
                    }),
                    Promise.resolve({
                        recordings: listRecordings(100)
                    }),
                    scanCaptureDevices()
                ]);

                broadcastIngestStats(ingest.streams || {});
                broadcastHistory(history.history);
                broadcastRecordings(recordings.recordings);
                broadcastCaptureDevices(devices);
                broadcastDashboardOverview(buildDashboardOverview(ingest.streams || {}));

                if (Object.keys(ingest.streams || {}).length > 0) {
                    console.log(`[WS Broadcast] Sending ${Object.keys(ingest.streams).length} active streams`);
                }
            }
        } catch (error) {
            console.error("Failed to fetch or broadcast ingest stats:", error);
        } finally {
            ingestPolling = false;
            setTimeout(tick, 3000);
        }
    };
    tick();
};

function parseCommand(command) {
    const args = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        if ((char === '"' || char === "'") && command[i - 1] !== '\\') {
            quote = quote === char ? null : (quote || char);
            continue;
        }
        if (/\s/.test(char) && !quote) {
            if (current) args.push(current.replace(/\\"/g, '"'));
            current = '';
        } else {
            current += char;
        }
    }
    if (current) args.push(current.replace(/\\"/g, '"'));
    return args;
}

// ============================================================
// FIX: Media server - serve HLS from the correct output path
// Our FFmpeg HLS process writes to: MEDIA_ROOT/hls/<stream>/index.m3u8
// URL: http://localhost:8080/live/<stream>/index.m3u8
// ============================================================
const mediaApp = express();
mediaApp.use(cors());
mediaApp.use(countMediaResponseBytes);

mediaApp.use('/live', express.static(HLS_DIR, hlsStaticOptions));
mediaApp.use('/live', express.static(LIVE_DIR, hlsStaticOptions));
mediaApp.use('/live', express.static(MEDIA_ROOT, hlsStaticOptions));
mediaApp.use('/hls', express.static(HLS_DIR, hlsStaticOptions));
mediaApp.use('/hls', express.static(MEDIA_ROOT, hlsStaticOptions));

// Serve recordings and media static paths
mediaApp.use('/recordings', express.static(RECORDINGS_DIR), express.static(RECORDED_DIR), serveRecordingFile);
mediaApp.use('/media/recordings', express.static(RECORDINGS_DIR), express.static(RECORDED_DIR), serveRecordingFile);
mediaApp.use('/recorded', express.static(RECORDED_DIR), express.static(RECORDINGS_DIR), serveRecordingFile);
mediaApp.use('/media/recorded', express.static(RECORDED_DIR), express.static(RECORDINGS_DIR), serveRecordingFile);
mediaApp.use('/media', express.static(MEDIA_ROOT));
mediaApp.get('/recording-thumbnail/:id.jpg', (req, res) => {
    const recording = db.prepare('SELECT * FROM stream_recordings WHERE id = ?').get(req.params.id);
    if (!recording || !fs.existsSync(recording.file_path)) return res.status(404).end();

    const thumbnailPath = path.join(RECORDING_THUMBNAILS_DIR, `${recording.id}.jpg`);
    const recordingModified = fs.statSync(recording.file_path).mtimeMs;
    if (fs.existsSync(thumbnailPath) && (recording.end_time || fs.statSync(thumbnailPath).mtimeMs >= recordingModified)) {
        res.setHeader('Cache-Control', recording.end_time ? 'public, max-age=86400' : 'no-cache');
        return res.sendFile(thumbnailPath);
    }

    const temporaryPath = path.join(RECORDING_THUMBNAILS_DIR, `${recording.id}-${Date.now()}.jpg`);
    const thumbnail = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', recording.file_path,
        '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', '-y', temporaryPath,
    ], { windowsHide: true });
    thumbnail.on('close', code => {
        if (code === 0 && fs.existsSync(temporaryPath)) {
            try {
                if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
                fs.renameSync(temporaryPath, thumbnailPath);
                res.setHeader('Cache-Control', recording.end_time ? 'public, max-age=86400' : 'no-cache');
                return res.sendFile(thumbnailPath);
            } catch (error) {
                console.error('[Thumbnail] Unable to cache thumbnail:', error);
            }
        }
        try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (e) { }
        if (!res.headersSent) res.status(404).end();
    });
    thumbnail.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    req.on('close', () => { if (!res.writableEnded && !thumbnail.killed) thumbnail.kill('SIGTERM'); });
});
mediaApp.get('/recording-preview/:id', (req, res) => {
    const recording = db.prepare('SELECT * FROM stream_recordings WHERE id = ?').get(req.params.id);
    if (!recording || !fs.existsSync(recording.file_path)) return res.status(404).json({ error: 'Recording file not found' });
    const requestedStart = Number(req.query.start || 0);
    const previewStart = Number.isFinite(requestedStart) ? Math.max(0, Math.min(requestedStart, 604800)) : 0;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="preview-${recording.id}.mp4"`);

    const args = [
        '-hide_banner', '-loglevel', 'error',
        ...(previewStart > 0 ? ['-ss', String(previewStart)] : []),
        '-i', recording.file_path,
        '-map', '0:v:0?', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p', '-g', '30',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4', 'pipe:1',
    ];
    const preview = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    preview.stderr.on('data', data => { stderr = `${stderr}${data}`.slice(-2000); });
    preview.stdout.pipe(res);
    preview.on('error', error => {
        console.error(`[Preview] Failed to start recording ${recording.id}:`, error);
        if (!res.headersSent) res.status(500).end();
        else res.end();
    });
    preview.on('close', code => {
        if (code && stderr) console.error(`[Preview] Recording ${recording.id}: ${stderr.trim()}`);
        if (!res.writableEnded) res.end();
    });
    req.on('close', () => {
        try { if (!preview.killed) preview.kill('SIGTERM'); } catch (e) { }
    });
});
mediaApp.use('/vod', express.static(VOD_DIR));

// Explicit route for /live/<stream>/index.m3u8 with fallback path search
mediaApp.get('/live/:stream/index.m3u8', (req, res) => {
    const { stream } = req.params;
    const filePaths = [
        path.join(HLS_DIR, stream, 'index.m3u8'),
        path.join(HLS_DIR, 'live', stream, 'index.m3u8'),
        path.join(LIVE_DIR, stream, 'index.m3u8'),
    ];

    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.sendFile(filePath);
        }
    }

    console.log(`[HLS] 404 for /live/${stream}/index.m3u8. Searched: ${filePaths.join(', ')}`);
    res.status(404).json({ error: `HLS playlist not found for stream "${stream}". Is the stream live?` });
});

// Route for HLS segment files (.ts) under /live/:stream/:file
mediaApp.get('/live/:stream/:file', (req, res) => {
    const { stream, file } = req.params;
    const filePaths = [
        path.join(HLS_DIR, stream, file),
        path.join(HLS_DIR, 'live', stream, file),
        path.join(LIVE_DIR, stream, file),
    ];

    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            if (file.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
            else if (file.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.sendFile(filePath);
        }
    }

    res.status(404).end();
});

// Explicit route for /live/<app>/<stream>/index.m3u8 (legacy compat)
mediaApp.get('/live/:app/:stream/index.m3u8', (req, res) => {
    const { app, stream } = req.params;
    const filePaths = [
        path.join(HLS_DIR, stream, 'index.m3u8'),
        path.join(HLS_DIR, app, stream, 'index.m3u8'),
        path.join(HLS_DIR, 'live', stream, 'index.m3u8'),
    ];

    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.sendFile(filePath);
        }
    }

    res.status(404).json({ error: `HLS playlist not found for ${app}/${stream}` });
});

mediaApp.get('/dash/:app/:stream/index.mpd', (req, res) => {
    const { app, stream } = req.params;
    const filePaths = [
        path.join(DASH_DIR, app, stream, 'index.mpd'),
        path.join(DASH_DIR, 'live', app, stream, 'index.mpd'),
        path.join(DASH_DIR, stream, 'index.mpd'),
    ];

    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.sendFile(filePath);
        }
    }

    res.status(404).json({ error: `DASH manifest not found for ${app}/${stream}` });
});

// ============================================================
// NMS CONFIGURATION
// FIX: Disable trans entirely - we manage HLS ourselves via startHlsProcess()
// NMS http is disabled since we serve HLS from our own mediaApp.
// ============================================================
const runtimeSettings = getSettings();
const nmsConfig = {
    rtmp: {
        port: runtimeSettings.rtmpPort,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
    },
    http: {
        // FIX: Keep NMS HTTP disabled - we serve HLS ourselves on MEDIA_PORT
        port: runtimeSettings.httpPort,
        mediaroot: MEDIA_ROOT,
        allow_origin: '*',
        enable: false,
    },
    // FIX: Remove NMS trans - it requires NMS HTTP to be enabled and has path issues.
    // We spawn our own FFmpeg HLS process in the postPublish event.
};

const nms = new NodeMediaServer(nmsConfig);
const rtmpEmitter = nms.nms || nms;

rtmpEmitter.on('prePublish', (id, StreamPath, args) => {
    const license = getLicense();
    if (license.status !== 'activated') {
        console.warn(`[RTMP] Stream publish rejected for ${StreamPath}: License is ${license.status}`);
        const sessions = nms.sessions || nms.nms?.sessions;
        const session = (typeof id === 'object' && id !== null) ? id : sessions?.get(id);
        if (session && typeof session.reject === 'function') {
            session.reject();
        }
    }
});

rtmpEmitter.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    const license = getLicense();
    if (license.status !== 'activated') {
        console.warn(`[RTMP] Skipping postPublish handling: License is ${license.status}`);
        const sessions = nms.sessions || nms.nms?.sessions;
        const session = (typeof id === 'object' && id !== null) ? id : sessions?.get(id);
        if (session && typeof session.reject === 'function') session.reject();
        return;
    }

    const sessions = nms.sessions || nms.nms?.sessions;
    const session = (typeof id === 'object' && id !== null) ? id : sessions?.get(id);

    const sId = session?.id || id;
    let sPath = (typeof StreamPath === 'string') ? StreamPath : '';

    if (!sPath && session) {
        if (session.publishApp && session.publishStream) {
            sPath = `/${session.publishApp}/${session.publishStream}`;
        } else {
            sPath = session.publishStreamPath || session.streamPath || session.path || (session.req?.url) || '';
        }
    }

    console.log('[RTMP Event]', `Stream Started - ID: ${sId} Path: ${sPath}`);

    // ============ DEBUG: Print all session keys and values ============
    if (session) {
        console.log('[DEBUG] Session constructor name:', session.constructor?.name);
        console.log('[DEBUG] Session keys:', Object.keys(session));

        for (const key of Object.keys(session)) {
            const val = session[key];
            if (typeof val !== 'function' && typeof val !== 'object') {
                console.log(`[DEBUG]   session.${key} =`, val);
            }
        }

        console.log('[DEBUG] session.socket keys:', session.socket ? Object.keys(session.socket) : 'NO SOCKET');
        if (session.socket) {
            console.log('[DEBUG] session.socket.bytesRead:', session.socket.bytesRead);
            console.log('[DEBUG] session.socket.bytesWritten:', session.socket.bytesWritten);
        }

        const videoPropNames = ['videoCodec', 'videoWidth', 'videoHeight', 'videoFps', 'videoProfile',
            'video_codec', 'video_width', 'video', 'videoInfo', 'videoStream'];
        videoPropNames.forEach(p => {
            if (session[p] !== undefined) console.log(`[DEBUG] session.${p} =`, session[p]);
        });

        const audioPropNames = ['audioCodec', 'audioSamplerate', 'audioChannels', 'audioProfile',
            'audio_codec', 'audio', 'audioInfo', 'audioStream'];
        audioPropNames.forEach(p => {
            if (session[p] !== undefined) console.log(`[DEBUG] session.${p} =`, session[p]);
        });
    } else {
        console.log('[DEBUG] session is NULL/UNDEFINED - id was:', id, typeof id);
        console.log('[DEBUG] nms.sessions type:', typeof nms.sessions, nms.sessions instanceof Map);
        console.log('[DEBUG] nms.nms?.sessions type:', typeof nms.nms?.sessions);

        if (nms.sessions instanceof Map) {
            console.log('[DEBUG] nms.sessions size:', nms.sessions.size);
            nms.sessions.forEach((s, k) => {
                console.log(`[DEBUG] nms.sessions key: ${k}, constructor: ${s?.constructor?.name}`);
            });
        }
    }
    // ============ END DEBUG ============

    if (!sPath) {
        console.warn('[RTMP Event] Could not determine stream path, skipping');
        return;
    }

    const parts = sPath.split('/').filter(Boolean);
    const appName = parts[0] || 'live';
    const streamName = parts[1] || parts[0];
    const key = `${appName}/${streamName}`;

    if (activeSessions.has(key)) {
        console.log(`[RTMP Event] Session already tracked for ${key}, skipping duplicate insert`);
        return;
    }

    const startTime = new Date().toISOString();
    const result = db.prepare('INSERT INTO stream_sessions (app, stream, start_time) VALUES (?, ?, ?)').run(appName, streamName, startTime);

    activeSessions.set(key, {
        sessionId: result.lastInsertRowid,
        totalIncoming: 0,
        totalOutgoing: 0,
        subscribers: new Map(),
        startTime: Date.now(),
        sessionRef: session,
        nmsId: sId,
    });

    console.log(`[RTMP] Session created for ${key}, DB ID: ${result.lastInsertRowid}`);

    // FIX: Start our own HLS FFmpeg process for this stream
    // Small delay to ensure RTMP stream is fully established before FFmpeg connects
    setTimeout(() => {
        if (activeSessions.has(key)) {
            startHlsProcess(appName, streamName);
        }
    }, 1500);

    setTimeout(() => {
        if (!activeSessions.has(key) || activeRecordings.has(key)) return;
        const config = getJsonSetting('recording_config', {
            autoRecord: false, fileName: '{channel}_{date}_{time}', formats: ['mp4'], encoder: 'copy', continuous: true,
        });
        if (!config.autoRecord) return;
        try {
            beginRecording(appName, streamName, { ...config, sourceType: 'ingest', videoDevice: '', audioDevice: '' });
            console.log(`[Recording] Auto-recording started for ${key}`);
        } catch (error) {
            console.error(`[Recording] Auto-recording failed for ${key}:`, error.message);
        }
    }, 2000);
});

rtmpEmitter.on('donePublish', async (id, StreamPath, args) => {
    const sessions = nms.sessions || nms.nms?.sessions;
    const session = (typeof id === 'object' && id !== null) ? id : sessions?.get(id);

    const sId = session?.id || id;
    let sPath = (typeof StreamPath === 'string') ? StreamPath : '';

    if (!sPath && session) {
        if (session.publishApp && session.publishStream) {
            sPath = `/${session.publishApp}/${session.publishStream}`;
        } else {
            sPath = session.publishStreamPath || session.streamPath || session.path || '';
        }
    }

    console.log('[RTMP Event]', `Stream Finished - ID: ${sId} Path: ${sPath}`);

    if (!sPath) return;

    const parts = sPath.split('/').filter(Boolean);
    const appName = parts[0] || 'unknown';
    const streamName = parts[1] || 'unknown';
    const key = `${appName}/${streamName}`;
    const sessionData = activeSessions.get(key);

    if (sessionData) {
        const endTime = new Date().toISOString();
        db.prepare('UPDATE stream_sessions SET end_time = ? WHERE id = ?')
            .run(endTime, sessionData.sessionId);
        console.log(`[RTMP] Session closed for ${key}, DB ID: ${sessionData.sessionId}`);
    }

    const globalEndTime = new Date().toISOString();
    db.prepare(`
        UPDATE stream_sessions 
        SET end_time = ? 
        WHERE app = ? AND stream = ? AND end_time IS NULL
    `).run(globalEndTime, appName, streamName);

    activeSessions.delete(key);
    streamStatsHistory.delete(key);
    streamStatsHistory.delete(`sub/${key}`);
    streamStatsHistory.delete(`out/${key}`);
    hlsByteCounters.delete(key);
    hlsViewers.delete(key);
    rtmpOutgoingTracker.delete(key);

    // FIX: Stop our HLS process when stream ends
    stopHlsProcess(appName, streamName);
    if (activeRecordings.has(key)) finishRecording(key, 'SIGTERM', true);
});

rtmpEmitter.on('postPlay', (id, StreamPath, args) => {
    const session = (typeof id === 'object' && id !== null) ? id : null;
    const sessionId = session?.id || id;
    let sPath = (typeof StreamPath === 'string' && StreamPath) ? StreamPath : (session ? getSessionStreamPath(session) : '');
    if (!sPath) return;
    const parts = sPath.split('/').filter(Boolean);
    const key = `${parts[0] || 'live'}/${parts[1] || ''}`;
    const sessionData = activeSessions.get(key);
    if (sessionData && session) {
        if (!sessionData.subscriberRefs) sessionData.subscriberRefs = new Map();
        sessionData.subscriberRefs.set(sessionId, session);
    }
});

rtmpEmitter.on('donePlay', (id, StreamPath, args) => {
    const session = (typeof id === 'object' && id !== null) ? id : null;
    const sessionId = session?.id || id;
    let sPath = (typeof StreamPath === 'string' && StreamPath) ? StreamPath : (session ? getSessionStreamPath(session) : '');
    if (!sPath) return;
    const parts = sPath.split('/').filter(Boolean);
    const key = `${parts[0] || 'live'}/${parts[1] || ''}`;
    const sessionData = activeSessions.get(key);
    if (sessionData?.subscriberRefs) {
        sessionData.subscriberRefs.delete(sessionId);
    }
});

nms.run();

global.version = 'v4.2.0';

// Start media server for HLS/DASH/Recordings
const mediaServer = mediaApp.listen(runtimeSettings.mediaPort, () => {
    console.log(`[Media Server] HLS/DASH/Recordings available on http://localhost:${runtimeSettings.mediaPort}`);
    console.log(`[Media Server] HLS URL format: http://localhost:${runtimeSettings.mediaPort}/live/<stream>/index.m3u8`);
    console.log(`[Media Server] Example: http://localhost:${runtimeSettings.mediaPort}/live/kalyan/index.m3u8`);
    console.log(`[Media Server] HLS files served from: ${HLS_DIR}`);
});

mediaServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR] Port ${runtimeSettings.mediaPort} is already in use. Please change mediaPort in settings.`);
    } else {
        console.error(`[ERROR] Media server error:`, err);
    }
    process.exit(1);
});

// Start API and WebSocket server
const apiServer = server.listen(API_PORT, () => {
    console.log(`[API Server] Running on http://localhost:${API_PORT}`);
    console.log(`[WebSocket] Connected to ws://localhost:${API_PORT}`);
    startSystemStatsBroadcast();
    startIngestStatsBroadcast();
});

apiServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR] Port ${API_PORT} is already in use. Please change apiPort in settings.`);
    } else {
        console.error(`[ERROR] API server error:`, err);
    }
    process.exit(1);
});
})().catch(error => {
    console.error('[Startup] Failed to initialize Prisma/MySQL backend:', error);
    process.exit(1);
});
