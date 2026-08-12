const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const { spawn } = require('child_process');
const crypto = require('crypto');

const cors = require('cors');

const fs = require('fs');

const path = require('path');

const { DatabaseSync } = require('node:sqlite');

const NodeMediaServer = require('node-media-server');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const multer = require('multer');

const systemApi = require('./systemInfoApi'); // Import system API functions

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

// --- CONFIGURATION ---

const MEDIA_PORT = 8080;

const API_PORT = 3005;

const DATA_DIR = path.join(__dirname, 'data');

const MEDIA_ROOT = path.join(process.cwd(), 'media');
const RECORDINGS_DIR = path.join(MEDIA_ROOT, 'recordings');

const DB_FILE = path.join(DATA_DIR, 'kte.sqlite');

const JWT_SECRET = process.env.KTE_JWT_SECRET || 'change-this-local-kte-secret';
const LICENSE_ADMIN_EMAIL = process.env.KTE_LICENSE_ADMIN_EMAIL || 'karnkalyan@gmail.com';
const LICENSE_ADMIN_PASSWORD = process.env.KTE_LICENSE_ADMIN_PASSWORD || 'kalyan_vickey';

const VOD_DIR = path.join(__dirname, 'media', 'vod');

// FIX: NMS v4 outputs HLS to MEDIA_ROOT/hls/<stream>/ (no 'live' subfolder by default)
// We handle both possible layouts
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');
const DASH_DIR = path.join(MEDIA_ROOT, 'dash');
const LIVE_DIR = path.join(MEDIA_ROOT, 'live');

// FIX: Per-stream HLS processes managed by us (since NMS http is disabled)
const hlsProcesses = new Map(); // streamKey -> { proc, pid }

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
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
if (!fs.existsSync(DASH_DIR)) fs.mkdirSync(DASH_DIR, { recursive: true });
if (!fs.existsSync(LIVE_DIR)) fs.mkdirSync(LIVE_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS generated_licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  license_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stream_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  stream TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time TEXT,
  max_viewers INTEGER DEFAULT 0,
  total_bytes INTEGER DEFAULT 0,
  outgoing_bytes INTEGER DEFAULT 0,
  video_info TEXT,
  audio_info TEXT
);
CREATE TABLE IF NOT EXISTS stream_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  stream TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time TEXT,
  size INTEGER DEFAULT 0
);
`);

// Migration for existing table
try { db.exec('ALTER TABLE stream_sessions ADD COLUMN outgoing_bytes INTEGER DEFAULT 0'); } catch (e) { }

// Fix any existing recordings with invalid end_time (before start_time)
try {
    const invalidRecordings = db.prepare(`
        SELECT id, start_time, end_time FROM stream_recordings
        WHERE end_time IS NOT NULL AND datetime(end_time) <= datetime(start_time)
    `).all();

    if (invalidRecordings.length > 0) {
        console.log(`[DB] Fixing ${invalidRecordings.length} recordings with invalid end_time`);
        for (const rec of invalidRecordings) {
            db.prepare('UPDATE stream_recordings SET end_time = NULL WHERE id = ?').run(rec.id);
        }
    }
} catch (e) {
    console.error('[DB] Error fixing invalid recordings:', e);
}

const hashPassword = (password) => crypto.createHash('sha256').update(`kte:${password}`).digest('hex');
const base64url = (input) => Buffer.from(input).toString('base64url');
const signToken = (payload) => {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
};
const verifyToken = (token) => {
    const [header, body, sig] = String(token || '').split('.');
    if (!header || !body || !sig) throw new Error('Invalid token');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid token signature');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired');
    return payload;
};
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
                return { ...license, status: 'suspended' };
            }
        } catch (e) { }
    }
    if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) {
        return { ...license, status: 'expired' };
    }
    return license.status === 'activated' ? license : { ...license, status: license.status || 'trial' };
};
const ensureDefaultUser = () => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    if (count === 0) {
        db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
            .run(process.env.KTE_DEFAULT_USERNAME || 'admin', hashPassword(process.env.KTE_DEFAULT_PASSWORD || 'admin123'), 'admin');
    }
};
ensureDefaultUser();

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

app.use(cors());

app.use(express.json());

const publicPaths = new Set(['/api/auth/login', '/api/license/status', '/api/ffmpeg/devices', '/api/_hidden/license/generate']);
const authMiddleware = (req, res, next) => {
    if (!req.path.startsWith('/api') || publicPaths.has(req.path) || req.path.startsWith('/api/vod')) return next();
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    try {
        req.user = verifyToken(token);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication required' });
    }
};
const requireActiveLicense = (req, res, next) => {
    const license = getLicense();
    if (license.status !== 'activated') {
        return res.status(403).json({ error: license.status === 'expired' ? 'Application license has expired' : 'Trial mode does not allow this action', license });
    }
    next();
};

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === 'karnkalyan@gmail.com' && password === 'kalyan_vickey') {
        const token = signToken({ sub: username, role: 'superadmin', exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) });
        return res.json({ token, user: { username, role: 'superadmin' }, license: getLicense() });
    }
    const user = db.prepare('SELECT username, password_hash, role FROM users WHERE username = ?').get(username || '');
    if (!user || user.password_hash !== hashPassword(password || '')) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = signToken({ sub: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) });
    res.json({ token, user: { username: user.username, role: user.role }, license: getLicense() });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ user: { username: req.user.sub, role: req.user.role }, license: getLicense() });
});

app.put('/api/auth/account', authMiddleware, (req, res) => {
    const { username, currentPassword, newPassword } = req.body || {};
    const currentUser = db.prepare('SELECT username, password_hash, role FROM users WHERE username = ?').get(req.user.sub);
    if (!currentUser || currentUser.password_hash !== hashPassword(currentPassword || '')) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const nextUsername = String(username || currentUser.username).trim();
    if (!nextUsername) return res.status(400).json({ error: 'Username is required' });
    const nextHash = newPassword ? hashPassword(newPassword) : currentUser.password_hash;
    try {
        db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE username = ?')
            .run(nextUsername, nextHash, currentUser.username);
        const token = signToken({ sub: nextUsername, role: currentUser.role, exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) });
        res.json({ token, user: { username: nextUsername, role: currentUser.role } });
    } catch (error) {
        res.status(409).json({ error: 'Username already exists' });
    }
});

app.get('/api/license/status', (req, res) => {
    res.json(getLicense());
});

app.post('/api/_hidden/license/generate', (req, res) => {
    const { adminEmail, adminPassword, customerName, customerEmail, expiresAt, days, features } = req.body || {};
    if (adminEmail !== LICENSE_ADMIN_EMAIL || adminPassword !== LICENSE_ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid license generator credentials' });
    }
    const expiryMs = expiresAt ? new Date(expiresAt).getTime() : Date.now() + (Number(days || 365) * 24 * 60 * 60 * 1000);
    if (!customerName || Number.isNaN(expiryMs) || expiryMs <= Date.now()) {
        return res.status(400).json({ error: 'Customer name and a future expiry are required' });
    }
    const payload = {
        customerName,
        customerEmail: customerEmail || '',
        features: Array.isArray(features) && features.length ? features : ['streaming', 'recording', 'multi-destination', 'settings'],
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

app.get('/api/_hidden/licenses', authMiddleware, (req, res) => {
    if (req.user.sub !== 'karnkalyan@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    const licenses = db.prepare('SELECT * FROM generated_licenses ORDER BY created_at DESC').all();
    res.json(licenses);
});

app.put('/api/_hidden/licenses/:id/suspend', authMiddleware, (req, res) => {
    if (req.user.sub !== 'karnkalyan@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    db.prepare('UPDATE generated_licenses SET status = ? WHERE id = ?').run('suspended', req.params.id);
    res.json({ success: true });
});

app.put('/api/_hidden/licenses/:id/activate', authMiddleware, (req, res) => {
    if (req.user.sub !== 'karnkalyan@gmail.com') return res.status(403).json({ error: 'Forbidden' });
    db.prepare('UPDATE generated_licenses SET status = ? WHERE id = ?').run('active', req.params.id);
    res.json({ success: true });
});

app.post('/api/license/activate', authMiddleware, (req, res) => {
    try {
        const payload = verifyToken(req.body?.licenseKey);
        if (!payload.customerName || !payload.exp) throw new Error('License payload missing customer or expiry');

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
        }).filter(Boolean).map(c => ({
            ...c,
            status: runningProcesses[c.id] ? 'Running' : 'Stopped'
        }));
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
    const channel = { ...req.body, id: req.params.id };
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

app.post('/api/channels/start', authMiddleware, requireActiveLicense, (req, res) => {
    const { channelId, command, streamName } = req.body;
    if (!channelId || !command) return res.status(400).json({ error: 'channelId and command are required' });
    if (runningProcesses[channelId]) return res.status(409).json({ error: 'Channel is already running' });

    let finalCommand = command;
    try {
        const isHls = /-f\s+hls\b/i.test(command);
        const isDash = /-f\s+dash\b/i.test(command);
        if (isHls || isDash) {
            ensureOutputDirectories(command);
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

    const [executable, args] = parseCommand(finalCommand);
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

    res.status(202).json({ message: 'Started', usedCommand: finalCommand });
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
    const isNetwork = /^(udp|srt|rtp|rtsp|http|https|rtmp|rtmps):\/\//i.test(input);
    const ffInput = isNetwork ? input : path.join(VOD_DIR, input).replace(/\\/g, '/');

    const args = ['-v', 'error', '-show_programs', '-show_streams', '-of', 'json'];
    if (isNetwork) args.push('-timeout', '5000000');
    args.push(ffInput);

    const proc = spawn('ffprobe', args);
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

app.get('/api/ffmpeg/devices', authMiddleware, (req, res) => {
    const proc = spawn(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', () => {
        const video = [], audio = [];
        let section = null;
        stderr.split('\n').forEach(line => {
            if (line.includes('video devices')) section = video;
            else if (line.includes('audio devices')) section = audio;
            const m = line.match(/"([^"]+)"/);
            if (m && section && !m[1].startsWith('@')) section.push(m[1]);
        });
        res.json({ video, audio });
    });
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

const getActiveRecordingPayload = (appName, streamName) => {
    const key = getRecordingKey(appName, streamName);
    const active = activeRecordings.get(key);
    if (!active) return null;
    let size = 0;
    try {
        if (fs.existsSync(active.filePath)) size = fs.statSync(active.filePath).size;
    } catch (e) { }
    return {
        id: active.recordId,
        app: appName,
        stream: streamName,
        file_path: active.filePath,
        file_name: active.fileName,
        start_time: active.startTime,
        end_time: null,
        size,
        is_active: true,
    };
};

const listRecordings = (limit = 50) => {
    const rows = db.prepare('SELECT * FROM stream_recordings ORDER BY start_time DESC LIMIT ?').all(limit);
    return rows.map(row => {
        const active = getActiveRecordingPayload(row.app, row.stream);
        if (active && Number(active.id) === Number(row.id)) return active;

        // Fix: Validate end_time is after start_time, otherwise treat as interrupted
        const startTime = new Date(row.start_time).getTime();
        const endTime = row.end_time ? new Date(row.end_time).getTime() : null;
        const isValidDuration = endTime && endTime > startTime;

        return {
            ...row,
            end_time: isValidDuration ? row.end_time : null,
            is_active: false
        };
    });
};

const finishRecording = (key, signal = 'SIGTERM', forceComplete = false) => {
    const data = activeRecordings.get(key);
    if (!data) return null;
    activeRecordings.delete(key);
    try {
        if (!data.proc.killed) data.proc.kill(signal);
    } catch (e) { }

    let size = 0;
    try {
        if (fs.existsSync(data.filePath)) size = fs.statSync(data.filePath).size;
    } catch (e) {
        console.error('Failed to read recording stats:', e);
    }

    const startTime = new Date(data.startTime).getTime();
    const now = Date.now();
    const durationMs = now - startTime;
    const minDurationMs = 1000;
    const minSizeBytes = 0;

    if (forceComplete || (size >= minSizeBytes && durationMs >= minDurationMs)) {
        db.prepare('UPDATE stream_recordings SET end_time = CURRENT_TIMESTAMP, size = ? WHERE id = ? AND end_time IS NULL')
            .run(size, data.recordId);
        console.log(`[Recording] Completed ${key} (size: ${size} bytes, duration: ${durationMs}ms)`);
    } else {
        console.log(`[Recording] Marking ${key} as interrupted (size: ${size} bytes, duration: ${durationMs}ms)`);
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

    // Output directory: MEDIA_ROOT/hls/<stream>/
    const hlsOutDir = path.join(HLS_DIR, streamName);
    if (!fs.existsSync(hlsOutDir)) fs.mkdirSync(hlsOutDir, { recursive: true });

    const hlsPlaylist = path.join(hlsOutDir, 'index.m3u8').replace(/\\/g, '/');

    const args = [
        '-y',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-i', rtmpUrl,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '6',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', path.join(hlsOutDir, 'seg%03d.ts').replace(/\\/g, '/'),
        hlsPlaylist,
    ];

    console.log(`[HLS] Starting FFmpeg HLS for ${key}: ${ffmpegPath} ${args.join(' ')}`);
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    proc.stderr.on('data', (data) => {
        const line = data.toString().trim();
        // Only log errors or key info, not every frame
        if (/error|warning|failed|cannot|unable/i.test(line)) {
            console.error(`[HLS][${key}] ${line}`);
        }
    });

    proc.on('close', (code) => {
        console.log(`[HLS] Process for ${key} exited with code ${code}`);
        hlsProcesses.delete(key);
        // Clean up old HLS segments
        try {
            const files = fs.readdirSync(hlsOutDir).filter(f => /\.(ts|m3u8)$/.test(f));
            files.forEach(f => {
                try { fs.unlinkSync(path.join(hlsOutDir, f)); } catch (e) { }
            });
        } catch (e) { }
    });

    proc.on('error', (err) => {
        console.error(`[HLS] Spawn error for ${key}:`, err);
        hlsProcesses.delete(key);
    });

    hlsProcesses.set(key, { proc });
    console.log(`[HLS] Started for ${key} -> ${hlsPlaylist}`);
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
            const hlsUrl = `http://localhost:${getSettings().mediaPort}/live/${streamName}/index.m3u8`;

            streams[key] = {
                app: appName,
                name: streamName,
                publisher: {
                    id: sessionData.sessionId,
                    video: videoInfo,
                    audio: audioInfo,
                    bytes: incomingBytes,
                },
                subscribers: [],
                viewers,
                incoming_kbps,
                outgoing_kbps,
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

app.get('/api/ingest/history', authMiddleware, (req, res) => {
    const history = db.prepare('SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT 50').all();
    res.json({ success: true, history });
});

app.get('/api/ingest/recordings', authMiddleware, (req, res) => {
    const recordings = listRecordings(100);
    res.json({ success: true, recordings });
});

app.post('/api/ingest/record/start', authMiddleware, (req, res) => {
    const { app: appName, stream } = req.body;
    const key = `${appName}/${stream}`;
    if (activeRecordings.has(key)) return res.json({ success: false, error: 'Recording already active' });

    const fileName = `${stream}_${Date.now()}.flv`;
    const dir = path.join(RECORDINGS_DIR, appName, stream);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, fileName);
    const rtmpUrl = `rtmp://localhost:${getSettings().rtmpPort}/${appName}/${stream}`;

    const proc = spawn(ffmpegPath, ['-y', '-i', rtmpUrl, '-c', 'copy', filePath], { windowsHide: true });
    const startTime = new Date().toISOString();
    const result = db.prepare('INSERT INTO stream_recordings (app, stream, file_path, file_name, start_time) VALUES (?, ?, ?, ?, ?)').run(appName, stream, filePath, fileName, startTime);

    activeRecordings.set(key, { proc, filePath, fileName, startTime, recordId: result.lastInsertRowid });

    proc.on('error', (err) => {
        console.error(`Recording error for ${key}:`, err);
        activeRecordings.delete(key);
    });
    proc.on('close', () => {
        const active = activeRecordings.get(key);
        if (!active || Number(active.recordId) !== Number(result.lastInsertRowid)) return;
        activeRecordings.delete(key);
        try {
            const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 0 };
            db.prepare('UPDATE stream_recordings SET end_time = CURRENT_TIMESTAMP, size = ? WHERE id = ? AND end_time IS NULL')
                .run(stats.size, result.lastInsertRowid);
        } catch (e) {
            console.error('Failed to update recording stats on close:', e);
        }
    });

    res.json({ success: true, message: 'Recording started', recordId: result.lastInsertRowid, recording: getActiveRecordingPayload(appName, stream) });
});

app.post('/api/ingest/record/stop', authMiddleware, (req, res) => {
    const { app: appName, stream } = req.body;
    const key = `${appName}/${stream}`;
    const data = activeRecordings.get(key);

    if (!data) return res.json({ success: false, error: 'No active recording found' });

    finishRecording(key, 'SIGTERM', true);

    res.json({ success: true, message: 'Recording stopped' });
});

app.delete('/api/ingest/recordings/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    try {
        const recording = db.prepare('SELECT * FROM stream_recordings WHERE id = ?').get(id);
        if (!recording) return res.status(404).json({ error: 'Recording not found' });
        const key = getRecordingKey(recording.app, recording.stream);
        const active = activeRecordings.get(key);
        if (active && Number(active.recordId) === Number(id)) finishRecording(key, 'SIGTERM', true);
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

app.post('/api/ingest/srt/start', authMiddleware, (req, res) => {
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

app.post('/api/ingest/relay/start', authMiddleware, (req, res) => {
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

app.delete('/api/ingest/processes/:id', authMiddleware, (req, res) => {
    const id = req.params.id;
    if (activeIngestProcesses.has(id)) {
        activeIngestProcesses.get(id).proc.kill('SIGKILL');
        activeIngestProcesses.delete(id);
    }
    res.json({ success: true });
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
const wss = new WebSocket.Server({ server });

let runningProcesses = {};

const broadcastStats = (channelId, stats) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'stats', channelId, payload: stats }));
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
wss.on('connection', ws => {
    console.log('Client connected to WebSocket');
    systemApi.getFullSystemStats()
        .then(stats => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'system_stats', payload: stats }));
            }
        })
        .catch(error => console.error("Failed to send initial system stats:", error));
    ws.on('close', () => console.log('Client disconnected'));
});

const broadcastIngestStats = (stats) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'ingest_stats', payload: stats }));
        }
    });
};

const broadcastHistory = (history) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'ingest_history', payload: history }));
        }
    });
};

const broadcastRecordings = (recordings) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'recordings_list', payload: recordings }));
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
            const stats = await systemApi.getFullSystemStats();
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
                const [ingest, history, recordings] = await Promise.all([
                    getIngestStreams(),
                    Promise.resolve({
                        history: db.prepare('SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT 50').all()
                    }),
                    Promise.resolve({
                        recordings: listRecordings(100)
                    })
                ]);

                broadcastIngestStats(ingest.streams || {});
                broadcastHistory(history.history);
                broadcastRecordings(recordings.recordings);

                if (Object.keys(ingest.streams || {}).length > 0) {
                    console.log(`[WS Broadcast] Sending ${Object.keys(ingest.streams).length} active streams`);
                }
            }
        } catch (error) {
            console.error("Failed to fetch or broadcast ingest stats:", error);
        } finally {
            ingestPolling = false;
            setTimeout(tick, 2000);
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

// Primary: serve /live/<stream>/* from HLS_DIR/<stream>/
// e.g. GET /live/kalyan/index.m3u8 -> MEDIA_ROOT/hls/kalyan/index.m3u8
mediaApp.use('/live', express.static(HLS_DIR, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Cache-Control', 'public, max-age=60');
        }
    }
}));

// Also serve DASH from DASH_DIR
mediaApp.use('/dash', express.static(DASH_DIR, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mpd')) {
            res.setHeader('Content-Type', 'application/dash+xml');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Also serve /hls/* directly from HLS_DIR (alternative URL)
mediaApp.use('/hls', express.static(HLS_DIR));

// Serve recordings
mediaApp.use('/recordings', express.static(RECORDINGS_DIR));
mediaApp.use('/recordings', express.static(path.join(__dirname, 'media', 'recordings')));

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

rtmpEmitter.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

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

    const result = db.prepare('INSERT INTO stream_sessions (app, stream) VALUES (?, ?)').run(appName, streamName);

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
        db.prepare('UPDATE stream_sessions SET end_time = CURRENT_TIMESTAMP WHERE id = ?')
            .run(sessionData.sessionId);
        console.log(`[RTMP] Session closed for ${key}, DB ID: ${sessionData.sessionId}`);
    }

    db.prepare(`
        UPDATE stream_sessions 
        SET end_time = CURRENT_TIMESTAMP 
        WHERE app = ? AND stream = ? AND end_time IS NULL
    `).run(appName, streamName);

    activeSessions.delete(key);
    streamStatsHistory.delete(key);
    streamStatsHistory.delete(`sub/${key}`);
    streamStatsHistory.delete(`out/${key}`);
    hlsByteCounters.delete(key);
    hlsViewers.delete(key);
    rtmpOutgoingTracker.delete(key);

    // FIX: Stop our HLS process when stream ends
    stopHlsProcess(appName, streamName);
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