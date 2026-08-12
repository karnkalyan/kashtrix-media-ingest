const NodeMediaServer = require('node-media-server');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const loadEnvFile = () => {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
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

const readSettings = () => {
  const defaults = { rtmpPort: 1935, httpPort: 8000 };
  const dbFile = path.join(__dirname, 'data', 'kte.sqlite');
  if (!fs.existsSync(dbFile)) return defaults;
  try {
    const db = new DatabaseSync(dbFile);
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('settings');
    db.close();
    return row ? { ...defaults, ...JSON.parse(row.value) } : defaults;
  } catch (error) {
    console.warn('Unable to read RTMP settings, using defaults:', error.message);
    return defaults;
  }
};

// Create the media directory if it doesn't exist
const mediaRoot = './media';
if (!fs.existsSync(mediaRoot)) {
  fs.mkdirSync(mediaRoot);
  console.log(`Created media directory: ${mediaRoot}`);
}

const settings = readSettings();

const config = {
  // Set logType to 4 for the most verbose logging
  logType: 4, 
  rtmp: {
    port: Number(settings.rtmpPort) || 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: Number(settings.httpPort) || 8000,
    mediaroot: mediaRoot,
    allow_origin: '*'
  },
  trans: {
    ffmpeg: ffmpegPath, // Use the path from @ffmpeg-installer
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]'
      }
    ]
  }
};

const nms = new NodeMediaServer(config);

// Log when a stream attempts to publish
nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

// Capture and log debug messages, especially from FFmpeg
nms.on('ffDebugMessage', (id, message) => {
  console.log('[FFmpeg Debug]', `id=${id} message=${message}`);
});

nms.run();

console.log('Node Media Server started...');
console.log('FFmpeg path is:', ffmpegPath);
console.log('Media root is:', mediaRoot);
console.log('Config is:', JSON.stringify(config, null, 2));
