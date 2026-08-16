const { PrismaClient } = require('@prisma/client');
const { normalizeUserRole } = require('./securityPolicy');

const toPrismaRole = role => ({ superadmin: 'SUPER_ADMIN', admin: 'ADMIN', user: 'USER' })[normalizeUserRole(role)];
const snakeUser = row => row && ({ id: row.id, username: row.username, password_hash: row.passwordHash, role: normalizeUserRole(row.role), created_at: row.createdAt });
const snakeLicense = row => row && ({ id: row.id, customer_name: row.customerName, customer_email: row.customerEmail, license_key: row.licenseKey, status: row.status, expires_at: row.expiresAt, created_at: row.createdAt });
const snakeSession = row => row && ({ id: row.id, app: row.app, stream: row.stream, start_time: row.startTime?.toISOString?.() || row.startTime, end_time: row.endTime?.toISOString?.() || row.endTime, max_viewers: row.maxViewers, total_bytes: Number(row.totalBytes), outgoing_bytes: Number(row.outgoingBytes), video_info: row.videoInfo, audio_info: row.audioInfo });
const snakeRecording = row => row && ({ id: row.id, app: row.app, stream: row.stream, file_path: row.filePath, file_name: row.fileName, start_time: row.startTime?.toISOString?.() || row.startTime, end_time: row.endTime?.toISOString?.() || row.endTime, size: Number(row.size), format: row.format, video_bitrate: row.videoBitrate, audio_bitrate: row.audioBitrate, encoder: row.encoder, resolution: row.resolution, continuous: row.continuous ? 1 : 0, source_type: row.sourceType, settings_json: row.settingsJson });

class PrismaStore {
  constructor() {
    this.prisma = new PrismaClient();
    this.data = { users: [], kv: [], profiles: [], channels: [], licenses: [], sessions: [], recordings: [] };
    this.pending = Promise.resolve();
  }

  async initialize() {
    await this.prisma.$connect();
    const [users, kv, profiles, channels, licenses, sessions, recordings] = await Promise.all([
      this.prisma.user.findMany().catch(() => []),
      this.prisma.kvStore.findMany().catch(() => []),
      this.prisma.transcodeProfile.findMany().catch(() => []),
      this.prisma.transcodeChannel.findMany().catch(() => []),
      this.prisma.generatedLicense.findMany().catch(() => []),
      this.prisma.streamSession.findMany().catch(() => []),
      this.prisma.streamRecording.findMany().catch(() => []),
    ]);
    this.data = {
      users: users.map(snakeUser),
      kv: kv.map(row => ({ key: row.key, value: row.value })),
      profiles: profiles.map(row => ({ id: row.id, data: row.data })),
      channels: channels.map(row => ({ id: row.id, data: row.data })),
      licenses: licenses.map(snakeLicense),
      sessions: sessions.map(snakeSession),
      recordings: recordings.map(snakeRecording)
    };
  }

  persist(task) {
    this.pending = this.pending.then(task).catch(error => console.error('[Prisma Persistence Error]', error.message || error));
    return this.pending;
  }

  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    return {
      all: (...args) => this.all(normalized, args),
      get: (...args) => this.get(normalized, args),
      run: (...args) => this.run(normalized, args),
    };
  }

  all(sql, args) {
    if (sql.includes('from users')) return [...this.data.users];
    if (sql.includes('from profiles')) return [...this.data.profiles];
    if (sql.includes('from channels')) return [...this.data.channels];
    if (sql.includes('from generated_licenses')) return [...this.data.licenses].sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (sql.includes('from stream_sessions')) return [...this.data.sessions].sort((a,b) => new Date(b.start_time || 0) - new Date(a.start_time || 0)).slice(0, sql.includes('limit 8') ? 8 : 100);
    if (sql.includes('from stream_recordings')) {
      let rows = [...this.data.recordings];
      if (sql.includes('where end_time is not null')) {
        rows = rows.filter(row => row.end_time != null);
      }
      const limit = args[0] || (sql.includes('limit 8') ? 8 : undefined);
      return rows.sort((a,b) => new Date(b.start_time || 0) - new Date(a.start_time || 0)).slice(0, limit);
    }
    return [];
  }

  get(sql, args) {
    if (sql.includes('count(*)') && sql.includes('from users')) return { count: this.data.users.length };
    if (sql.includes('count(*)') && sql.includes('from profiles')) return { count: this.data.profiles.length };
    if (sql.includes('from users where username')) return this.data.users.find(row => row.username === args[0]);
    if (sql.includes('from users where id')) return this.data.users.find(row => Number(row.id) === Number(args[0]));
    if (sql.includes('from kv_store')) return this.data.kv.find(row => row.key === args[0]);
    if (sql.includes('from generated_licenses where license_key')) return this.data.licenses.find(row => row.license_key === args[0]);
    if (sql.includes('from stream_recordings where id')) return this.data.recordings.find(row => Number(row.id) === Number(args[0]));
    if (sql.includes('count(*)') && sql.includes('stream_recordings')) return { total: this.data.recordings.length, bytes: this.data.recordings.reduce((sum,row) => sum + Number(row.size || 0), 0) };
    if (sql.includes('count(*)') && sql.includes('stream_sessions')) return { total: this.data.sessions.length, incoming_bytes: this.data.sessions.reduce((sum,row) => sum + Number(row.total_bytes || 0), 0), outgoing_bytes: this.data.sessions.reduce((sum,row) => sum + Number(row.outgoing_bytes || 0), 0), viewers: this.data.sessions.reduce((sum,row) => sum + Number(row.max_viewers || 0), 0) };
    return undefined;
  }

  run(sql, args) {
    if (sql.startsWith('insert into users')) {
      const [username, password_hash, role] = args;
      const id = Math.max(0, ...this.data.users.map(r => Number(r.id) || 0)) + 1;
      const normalizedRole = normalizeUserRole(role);
      const newUser = { id, username, password_hash, role: normalizedRole, created_at: new Date() };
      this.data.users.push(newUser);
      this.persist(() => this.prisma.user.create({
        data: { id, username, email: `${username}@kashtrix.local`, passwordHash: password_hash, role: toPrismaRole(normalizedRole) }
      }));
      return { lastInsertRowid: id };
    }

    if (sql.startsWith('update users set')) {
      let row = null;
      if (sql.includes('where username =')) {
        const targetUsername = args[args.length - 1];
        row = this.data.users.find(r => r.username === targetUsername);
        if (row) {
          if (args.length >= 2) row.username = args[0];
          if (args.length >= 3) row.password_hash = args[1];
        }
      } else {
        const targetId = Number(args[args.length - 1]);
        row = this.data.users.find(r => Number(r.id) === targetId);
        if (row) {
          if (args.length >= 2) row.username = args[0];
          if (args.length >= 3) row.password_hash = args[1];
          if (args.length >= 4) row.role = normalizeUserRole(args[2]);
        }
      }
      if (row) {
        this.persist(() => this.prisma.user.update({
          where: { id: row.id },
          data: { username: row.username, passwordHash: row.password_hash, role: toPrismaRole(row.role) }
        }).catch(e => console.error('[Prisma] update user error:', e.message)));
      }
      return {};
    }

    if (sql.startsWith('delete from users')) {
      const targetId = Number(args[0]);
      this.data.users = this.data.users.filter(r => Number(r.id) !== targetId);
      this.persist(() => this.prisma.user.delete({ where: { id: targetId } }).catch(e => console.error('[Prisma] delete user error:', e.message)));
      return {};
    }

    if (sql.startsWith('insert into kv_store')) {
      const [key, value] = args;
      const row = this.data.kv.find(r => r.key === key);
      row ? row.value = value : this.data.kv.push({ key, value });
      this.persist(() => this.prisma.kvStore.upsert({ where: { key }, update: { value }, create: { key, value } }));
      return {};
    }

    if (sql.startsWith('insert into profiles')) {
      const [id, data] = args;
      const row = this.data.profiles.find(r => r.id === id);
      row ? row.data = data : this.data.profiles.push({ id, data });
      let name = id; try { name = JSON.parse(data).name || id; } catch {}
      this.persist(() => this.prisma.transcodeProfile.upsert({ where: { id }, update: { name, data }, create: { id, name, data } }));
      return {};
    }

    if (sql.startsWith('delete from profiles')) {
      const id = args[0];
      this.data.profiles = this.data.profiles.filter(r => r.id !== id);
      this.persist(() => this.prisma.transcodeProfile.delete({ where: { id } }).catch(() => {}));
      return {};
    }

    if (sql.startsWith('insert into channels')) {
      const [id, data] = args;
      const row = this.data.channels.find(r => r.id === id);
      row ? row.data = data : this.data.channels.push({ id, data });
      let name = id; try { name = JSON.parse(data).name || id; } catch {}
      this.persist(() => this.prisma.transcodeChannel.upsert({ where: { id }, update: { name, data }, create: { id, name, data } }));
      return {};
    }

    if (sql.startsWith('delete from channels where')) {
      const id = args[0];
      this.data.channels = this.data.channels.filter(r => r.id !== id);
      this.persist(() => this.prisma.transcodeChannel.delete({ where: { id } }).catch(() => {}));
      return {};
    }

    if (sql === 'delete from channels') {
      this.data.channels = [];
      this.persist(() => this.prisma.transcodeChannel.deleteMany().catch(() => {}));
      return {};
    }

    if (sql.startsWith('insert into generated_licenses')) {
      const [customer_name, customer_email, license_key, expires_at] = args;
      const id = Math.max(0, ...this.data.licenses.map(r => Number(r.id) || 0)) + 1;
      const row = { id, customer_name, customer_email, license_key, status: 'active', expires_at, created_at: new Date() };
      this.data.licenses.push(row);
      this.persist(() => this.prisma.generatedLicense.create({ data: { id, customerName: customer_name, customerEmail: customer_email, licenseKey: license_key, expiresAt: new Date(expires_at) } }));
      return { lastInsertRowid: id };
    }

    if (sql.startsWith('update generated_licenses')) {
      const [status, id] = args;
      const row = this.data.licenses.find(r => Number(r.id) === Number(id));
      if (row) row.status = status;
      this.persist(() => this.prisma.generatedLicense.update({ where: { id: Number(id) }, data: { status } }).catch(() => {}));
      return {};
    }

    if (sql.startsWith('insert into stream_recordings')) {
      const [app, stream, file_path, file_name, start_time, format, video_bitrate, audio_bitrate, encoder, resolution, continuous, source_type, settings_json] = args;
      const id = Math.max(0, ...this.data.recordings.map(r => Number(r.id) || 0)) + 1;
      const row = { id, app, stream, file_path, file_name, start_time, end_time: null, size: 0, format, video_bitrate, audio_bitrate, encoder, resolution, continuous, source_type, settings_json };
      this.data.recordings.push(row);
      this.persist(() => this.prisma.streamRecording.create({
        data: { id, app, stream, filePath: file_path, fileName: file_name, startTime: new Date(start_time), format, videoBitrate: Number(video_bitrate), audioBitrate: Number(audio_bitrate), encoder, resolution, continuous: !!continuous, sourceType: source_type, settingsJson: settings_json }
      }));
      return { lastInsertRowid: id };
    }

    if (sql.startsWith('delete from stream_recordings')) {
      const id = Number(args[0]);
      this.data.recordings = this.data.recordings.filter(r => Number(r.id) !== id);
      this.persist(() => this.prisma.streamRecording.delete({ where: { id } }).catch(() => {}));
      return {};
    }

    if (sql.startsWith('update stream_recordings set end_time = null')) {
      const id = Number(args[0]);
      const row = this.data.recordings.find(r => Number(r.id) === id);
      if (row) row.end_time = null;
      this.persist(() => this.prisma.streamRecording.update({ where: { id }, data: { endTime: null } }).catch(() => {}));
      return {};
    }

    if (sql.startsWith('update stream_recordings set end_time')) {
      const hasCoalesce = sql.includes('coalesce');
      const [end, size, idValue] = args;
      const id = Number(idValue);
      const row = this.data.recordings.find(r => Number(r.id) === id);
      if (row) {
        if (!hasCoalesce || !row.end_time) row.end_time = end;
        row.size = Number(size);
      }
      this.persist(() => this.prisma.streamRecording.update({ where: { id }, data: { endTime: new Date(end), size: BigInt(size) } }).catch(() => {}));
      return {};
    }

    if (sql.startsWith('insert into stream_sessions')) {
      const [app, stream, start_time] = args;
      const id = Math.max(0, ...this.data.sessions.map(r => Number(r.id) || 0)) + 1;
      this.data.sessions.push({ id, app, stream, start_time, end_time: null, max_viewers: 0, total_bytes: 0, outgoing_bytes: 0, video_info: null, audio_info: null });
      this.persist(() => this.prisma.streamSession.create({ data: { id, app, stream, startTime: new Date(start_time) } }));
      return { lastInsertRowid: id };
    }

    if (sql.startsWith('update stream_sessions set max_viewers')) {
      const [viewers, total, outgoing, video, audio, idValue] = args;
      const id = Number(idValue);
      const row = this.data.sessions.find(r => Number(r.id) === id);
      if (row) Object.assign(row, { max_viewers: Math.max(row.max_viewers || 0, Number(viewers)), total_bytes: Number(total), outgoing_bytes: Number(outgoing), video_info: video, audio_info: audio });
      this.persist(() => this.prisma.streamSession.update({ where: { id }, data: { maxViewers: row.max_viewers, totalBytes: BigInt(total), outgoingBytes: BigInt(outgoing), videoInfo: video, audioInfo: audio } }).catch(() => {}));
      return {};
    }

    if (sql.startsWith('update stream_sessions set end_time')) {
      const [end, idValue] = args;
      if (sql.includes('where id')) {
        const id = Number(idValue);
        const row = this.data.sessions.find(r => Number(r.id) === id);
        if (row) row.end_time = end;
        this.persist(() => this.prisma.streamSession.update({ where: { id }, data: { endTime: new Date(end) } }).catch(() => {}));
      } else {
        this.data.sessions.filter(r => !r.end_time).forEach(r => r.end_time = end);
        this.persist(() => this.prisma.streamSession.updateMany({ where: { endTime: null }, data: { endTime: new Date(end) } }).catch(() => {}));
      }
      return {};
    }

    console.warn(`[PrismaStore] Unhandled SQL query (fallback executed): ${sql}`);
    return {};
  }
}

module.exports = PrismaStore;
