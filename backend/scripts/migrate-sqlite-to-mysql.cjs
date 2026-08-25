const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(path.join(__dirname, '..', 'data', 'kte.sqlite'), { readOnly: true });
const date = value => value ? new Date(value) : undefined;
const bigint = value => BigInt(value || 0);

async function migrate() {
  for (const row of sqlite.prepare('SELECT * FROM users').all()) {
    await prisma.user.upsert({
      where: { username: row.username },
      update: { passwordHash: row.password_hash, role: row.role === 'user' ? 'USER' : 'ADMIN' },
      create: { username: row.username, email: `${row.username}@kashtrix.local`, passwordHash: row.password_hash, role: row.role === 'user' ? 'USER' : 'ADMIN' },
    });
  }
  for (const row of sqlite.prepare('SELECT * FROM kv_store').all()) {
    await prisma.kvStore.upsert({ where: { key: row.key }, update: { value: row.value }, create: { key: row.key, value: row.value } });
  }
  for (const row of sqlite.prepare('SELECT * FROM profiles').all()) {
    let name = row.id;
    try { name = JSON.parse(row.data).name || row.id; } catch {}
    await prisma.transcodeProfile.upsert({ where: { id: row.id }, update: { name, data: row.data }, create: { id: row.id, name, data: row.data } });
  }
  for (const row of sqlite.prepare('SELECT * FROM channels').all()) {
    let name = row.id;
    try { name = JSON.parse(row.data).name || row.id; } catch {}
    await prisma.transcodeChannel.upsert({ where: { id: row.id }, update: { name, data: row.data }, create: { id: row.id, name, data: row.data } });
  }
  for (const row of sqlite.prepare('SELECT * FROM stream_sessions').all()) {
    await prisma.streamSession.upsert({ where: { id: Number(row.id) }, update: {}, create: { id: Number(row.id), app: row.app, stream: row.stream, startTime: date(row.start_time), endTime: date(row.end_time), maxViewers: Number(row.max_viewers || 0), totalBytes: bigint(row.total_bytes), outgoingBytes: bigint(row.outgoing_bytes), videoInfo: row.video_info, audioInfo: row.audio_info } });
  }
  for (const row of sqlite.prepare('SELECT * FROM stream_recordings').all()) {
    await prisma.streamRecording.upsert({ where: { id: Number(row.id) }, update: {}, create: { id: Number(row.id), app: row.app, stream: row.stream, filePath: row.file_path, fileName: row.file_name, startTime: date(row.start_time), endTime: date(row.end_time), size: bigint(row.size), format: row.format || 'mp4', videoBitrate: Number(row.video_bitrate || 0), audioBitrate: Number(row.audio_bitrate || 0), encoder: row.encoder || 'copy', resolution: row.resolution, continuous: !!row.continuous, sourceType: row.source_type || 'ingest', settingsJson: row.settings_json } });
  }
  console.log('SQLite data migrated to MySQL through Prisma.');
}

migrate().finally(async () => { sqlite.close(); await prisma.$disconnect(); }).catch(error => { console.error(error); process.exit(1); });
