const { PrismaClient } = require('@prisma/client');
const { normalizeUserRole } = require('./securityPolicy');

const toPrismaRole = role => ({
  superadmin: 'SUPER_ADMIN', admin: 'ADMIN', user: 'USER', operator: 'USER', archive: 'USER',
})[normalizeUserRole(role)] || 'USER';

const snakeUser = row => row && ({
  id: row.id, username: row.username, password_hash: row.passwordHash,
  role: normalizeUserRole(row.lastName || row.role), is_active: row.isActive !== false, created_at: row.createdAt,
});

const snakeSession = row => row && ({
  id: row.id, app: row.app, stream: row.stream,
  start_time: row.startTime?.toISOString?.() || row.startTime,
  end_time: row.endTime?.toISOString?.() || row.endTime,
  max_viewers: row.maxViewers, total_bytes: Number(row.totalBytes),
  outgoing_bytes: Number(row.outgoingBytes), video_info: row.videoInfo, audio_info: row.audioInfo,
});

const snakeRecording = row => row && ({
  id: row.id, app: row.app, stream: row.stream, file_path: row.filePath, file_name: row.fileName,
  start_time: row.startTime?.toISOString?.() || row.startTime,
  end_time: row.endTime?.toISOString?.() || row.endTime,
  size: Number(row.size), duration: Number(row.duration) || 0, format: row.format,
  video_bitrate: row.videoBitrate, audio_bitrate: row.audioBitrate, encoder: row.encoder,
  resolution: row.resolution, continuous: row.continuous ? 1 : 0,
  source_type: row.sourceType, settings_json: row.settingsJson,
});

class PrismaStore {
  constructor() {
    this.prisma = new PrismaClient();
    this.data = { users: [], kv: [], profiles: [], channels: [], sessions: [], recordings: [] };
  }

  async initialize() {
    await this.prisma.$connect();
    await this.prisma.kvStore.deleteMany({ where: { key: { in: ['license', 'system_hwid'] } } }).catch(() => {});
    const [users, kv, profiles, channels, sessions, recordings] = await Promise.all([
      this.prisma.user.findMany(), this.prisma.kvStore.findMany(), this.prisma.transcodeProfile.findMany(),
      this.prisma.transcodeChannel.findMany(), this.prisma.streamSession.findMany(), this.prisma.streamRecording.findMany(),
    ]);
    this.data = {
      users: users.map(snakeUser), kv: kv.map(row => ({ key: row.key, value: row.value })),
      profiles: profiles.map(row => ({ id: row.id, name: row.name, data: row.data })),
      channels: channels.map(row => ({ id: row.id, name: row.name, data: row.data })),
      sessions: sessions.map(snakeSession), recordings: recordings.map(snakeRecording),
    };
  }

  async refreshUsers() {
    this.data.users = (await this.prisma.user.findMany()).map(snakeUser);
    return this.data.users;
  }

  listUsers() { return [...this.data.users]; }
  findUserByUsername(username) { return this.data.users.find(row => row.username === username); }
  findUserById(id) { return this.data.users.find(row => Number(row.id) === Number(id)); }

  async createUser({ username, passwordHash, role }) {
    const normRole = normalizeUserRole(role);
    const user = await this.prisma.user.create({
      data: {
        username,
        email: `${username}@kashtrix.local`,
        passwordHash,
        role: toPrismaRole(normRole),
        lastName: normRole,
      },
    });
    const row = snakeUser(user);
    this.data.users.push(row);
    return row;
  }

  async updateUser(id, { username, passwordHash, role }) {
    if (!this.findUserById(id)) return null;
    const normRole = role !== undefined ? normalizeUserRole(role) : undefined;
    const user = await this.prisma.user.update({
      where: { id: Number(id) },
      data: {
        ...(username !== undefined ? { username, email: `${username}@kashtrix.local` } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        ...(normRole !== undefined ? { role: toPrismaRole(normRole), lastName: normRole } : {}),
      },
    });
    const row = snakeUser(user);
    this.data.users = this.data.users.map(item => Number(item.id) === Number(id) ? row : item);
    return row;
  }

  async deleteUser(id) {
    await this.prisma.user.delete({ where: { id: Number(id) } });
    this.data.users = this.data.users.filter(row => Number(row.id) !== Number(id));
  }

  async getChannels() {
    const rows = await this.prisma.transcodeChannel.findMany();
    this.data.channels = rows.map(row => ({ id: row.id, name: row.name, data: row.data }));
    return rows.map(row => {
      try { return JSON.parse(row.data); } catch (_) { return { id: row.id, name: row.name }; }
    });
  }

  async saveChannel(channel) {
    if (!channel?.id) throw new Error('Channel id is required');
    const id = String(channel.id), name = String(channel.name || id), data = JSON.stringify(channel);
    await this.prisma.transcodeChannel.upsert({ where: { id }, update: { name, data }, create: { id, name, data } });
    const row = this.data.channels.find(item => item.id === id);
    if (row) Object.assign(row, { name, data }); else this.data.channels.push({ id, name, data });
  }

  async deleteChannel(id) {
    await this.prisma.transcodeChannel.delete({ where: { id: String(id) } }).catch(() => {});
    this.data.channels = this.data.channels.filter(row => row.id !== String(id));
  }

  async getProfiles() {
    const rows = await this.prisma.transcodeProfile.findMany();
    this.data.profiles = rows.map(row => ({ id: row.id, name: row.name, data: row.data }));
    return rows.map(row => {
      try { return JSON.parse(row.data); } catch (_) { return { id: row.id, name: row.name }; }
    });
  }

  async seedProfiles(profiles) {
    if (await this.prisma.transcodeProfile.count()) return;
    await this.prisma.$transaction(profiles.map(profile => this.prisma.transcodeProfile.create({
      data: { id: String(profile.id), name: String(profile.name || profile.id), data: JSON.stringify(profile) },
    })));
    await this.getProfiles();
  }

  async saveProfile(profile) {
    if (!profile?.id) throw new Error('Profile id is required');
    const id = String(profile.id), name = String(profile.name || id), data = JSON.stringify(profile);
    await this.prisma.transcodeProfile.upsert({ where: { id }, update: { name, data }, create: { id, name, data } });
    const row = this.data.profiles.find(item => item.id === id);
    if (row) Object.assign(row, { name, data }); else this.data.profiles.push({ id, name, data });
  }

  async deleteProfile(id) {
    await this.prisma.transcodeProfile.delete({ where: { id: String(id) } }).catch(() => {});
    this.data.profiles = this.data.profiles.filter(row => row.id !== String(id));
  }

  async getKv(key) {
    const row = await this.prisma.kvStore.findUnique({ where: { key } });
    return row?.value ?? this.data.kv.find(item => item.key === key)?.value ?? null;
  }

  async setKv(key, value) {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await this.prisma.kvStore.upsert({ where: { key }, update: { value: stringValue }, create: { key, value: stringValue } });
    const row = this.data.kv.find(item => item.key === key);
    if (row) row.value = stringValue; else this.data.kv.push({ key, value: stringValue });
  }

  listRecordings(limit = 100) {
    return [...this.data.recordings].sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0)).slice(0, limit);
  }
  findRecordingById(id) { return this.data.recordings.find(row => Number(row.id) === Number(id)); }
  findRecordingByFileName(fileName) { return [...this.data.recordings].reverse().find(row => row.file_name === fileName); }
  findRecordingByPath(filePath) { return this.data.recordings.find(row => row.file_path === filePath); }

  async createRecording(input) {
    const existing = this.findRecordingByFileName(input.fileName) || this.findRecordingByPath(input.filePath);
    if (existing) return existing;
    const created = await this.prisma.streamRecording.create({
      data: {
        app: input.app, stream: input.stream, filePath: input.filePath, fileName: input.fileName,
        startTime: new Date(input.startTime), endTime: input.endTime ? new Date(input.endTime) : null,
        size: BigInt(input.size || 0), duration: Number(input.duration) || 0, format: input.format || 'mp4',
        videoBitrate: Number(input.videoBitrate) || 0, audioBitrate: Number(input.audioBitrate) || 0,
        encoder: input.encoder || 'copy', resolution: input.resolution || null, continuous: !!input.continuous,
        sourceType: input.sourceType || 'ingest', settingsJson: input.settingsJson || null,
      },
    });
    const row = snakeRecording(created);
    this.data.recordings.push(row);
    return row;
  }

  async updateRecording(id, updates, options = {}) {
    const existing = this.findRecordingById(id);
    if (!existing || (options.onlyIfOpen && existing.end_time)) return existing || null;
    const data = {};
    if (updates.endTime !== undefined) data.endTime = updates.endTime ? new Date(updates.endTime) : null;
    if (updates.size !== undefined) data.size = BigInt(updates.size || 0);
    if (updates.duration !== undefined) data.duration = Number(updates.duration) || 0;
    if (updates.settingsJson !== undefined) data.settingsJson = updates.settingsJson || null;
    const updated = await this.prisma.streamRecording.update({ where: { id: Number(id) }, data });
    const row = snakeRecording(updated);
    this.data.recordings = this.data.recordings.map(item => Number(item.id) === Number(id) ? row : item);
    return row;
  }

  async deleteRecording(id) {
    await this.prisma.streamRecording.delete({ where: { id: Number(id) } }).catch(() => {});
    this.data.recordings = this.data.recordings.filter(row => Number(row.id) !== Number(id));
  }

  listSessions(limit = 100) {
    return [...this.data.sessions].sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0)).slice(0, limit);
  }

  async createSession({ app, stream, startTime }) {
    const created = await this.prisma.streamSession.create({ data: { app, stream, startTime: new Date(startTime) } });
    const row = snakeSession(created);
    this.data.sessions.push(row);
    return row;
  }

  async updateSession(id, updates) {
    const existing = this.data.sessions.find(row => Number(row.id) === Number(id));
    if (!existing) return null;
    const data = {};
    if (updates.endTime !== undefined) data.endTime = updates.endTime ? new Date(updates.endTime) : null;
    if (updates.maxViewers !== undefined) data.maxViewers = Math.max(Number(existing.max_viewers) || 0, Number(updates.maxViewers) || 0);
    if (updates.totalBytes !== undefined) data.totalBytes = BigInt(updates.totalBytes || 0);
    if (updates.outgoingBytes !== undefined) data.outgoingBytes = BigInt(updates.outgoingBytes || 0);
    if (updates.videoInfo != null) data.videoInfo = updates.videoInfo;
    if (updates.audioInfo != null) data.audioInfo = updates.audioInfo;
    const updated = await this.prisma.streamSession.update({ where: { id: Number(id) }, data });
    const row = snakeSession(updated);
    this.data.sessions = this.data.sessions.map(item => Number(item.id) === Number(id) ? row : item);
    return row;
  }

  async closeSessionsByStream(app, stream, endTime) {
    await this.prisma.streamSession.updateMany({ where: { app, stream, endTime: null }, data: { endTime: new Date(endTime) } });
    this.data.sessions.filter(row => row.app === app && row.stream === stream && !row.end_time)
      .forEach(row => { row.end_time = endTime; });
  }

  async createAuditLog({ userId, username, userRole, action, targetId, type = 'SYSTEM', details, ipAddress, status = 'SUCCESS' }) {
    try {
      const jsonDetails = typeof details === 'object' ? JSON.stringify({
        username: username || 'system',
        userRole: userRole || 'system',
        status,
        ...details,
      }) : (details || '');

      const record = await this.prisma.auditLog.create({
        data: {
          userId: userId ? Number(userId) : undefined,
          action: String(action || 'UNKNOWN'),
          targetId: targetId ? String(targetId) : undefined,
          type: ['AUTH', 'CONNECTION', 'PLAYBACK_ERROR', 'SYSTEM'].includes(type) ? type : 'SYSTEM',
          details: jsonDetails,
          ipAddress: ipAddress ? String(ipAddress) : undefined,
        },
      });
      return record;
    } catch (err) {
      console.error('[AuditLog] Failed to persist audit entry:', err.message);
      return null;
    }
  }

  async listAuditLogs({ page = 1, limit = 50, type, entityType, action, username, status, search, startDate, endDate } = {}) {
    try {
      const take = Math.min(100, Math.max(1, Number(limit) || 50));
      const skip = Math.max(0, (Number(page) - 1) * take);
      const filterType = type || entityType;

      const where = {};
      if (filterType && filterType !== 'all' && filterType !== 'ALL') where.type = filterType;
      if (action && action !== 'all' && action !== 'ALL') where.action = { contains: action };
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }
      if (search && search.trim()) {
        where.OR = [
          { action: { contains: search.trim() } },
          { targetId: { contains: search.trim() } },
          { details: { contains: search.trim() } },
        ];
      }

      const [total, rows] = await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { user: { select: { id: true, username: true, role: true, lastName: true } } },
        }),
      ]);

      const logs = rows.map(r => {
        let parsed = {};
        try { parsed = JSON.parse(r.details || '{}'); } catch (_) { parsed = { raw: r.details }; }
        const createdAtIso = r.createdAt?.toISOString?.() || r.createdAt;
        const normRole = parsed.userRole || normalizeUserRole(r.user?.lastName || r.user?.role) || 'system';
        const entityTypeVal = r.type || 'SYSTEM';
        const targetIdVal = r.targetId || null;
        const ipVal = r.ipAddress || parsed.ipAddress || '';
        const userAgentVal = parsed.userAgent || '';
        return {
          id: r.id,
          userId: r.userId,
          user_id: r.userId,
          username: parsed.username || r.user?.username || 'system',
          userRole: normRole,
          user_role: normRole,
          action: r.action,
          targetId: targetIdVal,
          entityId: targetIdVal,
          entity_id: targetIdVal,
          type: entityTypeVal,
          entityType: entityTypeVal,
          entity_type: entityTypeVal,
          status: parsed.status || 'SUCCESS',
          details: parsed,
          ipAddress: ipVal,
          ip_address: ipVal,
          userAgent: userAgentVal,
          user_agent: userAgentVal,
          createdAt: createdAtIso,
          created_at: createdAtIso,
        };
      });

      let filteredLogs = logs;
      if (username && username !== 'all') {
        filteredLogs = filteredLogs.filter(l => l.username?.toLowerCase() === username.toLowerCase());
      }
      if (status && status !== 'all') {
        filteredLogs = filteredLogs.filter(l => l.status?.toLowerCase() === status.toLowerCase());
      }

      return {
        total,
        page: Number(page) || 1,
        totalPages: Math.ceil(total / take) || 1,
        logs: filteredLogs,
      };
    } catch (err) {
      console.error('[AuditLog] Failed to list audit entries:', err.message);
      return { total: 0, page: 1, totalPages: 1, logs: [] };
    }
  }
}

module.exports = PrismaStore;
