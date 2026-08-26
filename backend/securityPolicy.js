const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const requireEnv = (name, minLength = 1, env = process.env) => {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`[Security] Required environment variable ${name} is missing or empty`);
  if (/^(SET_|GENERATE_)/i.test(value) || value.length < minLength) {
    throw new Error(`[Security] Required environment variable ${name} is not securely configured`);
  }
  return value;
};

const normalizeUserRole = role => {
  const normalized = String(role || 'user').trim().toLowerCase().replace(/[_-]/g, '');
  if (normalized === 'superadmin') return 'superadmin';
  if (normalized === 'admin') return 'admin';
  if (normalized === 'operator') return 'operator';
  if (normalized === 'archive') return 'archive';
  return 'user';
};

const parseManagedRole = role => {
  const normalized = String(role || '').trim().toLowerCase();
  if (['admin', 'user', 'operator', 'archive'].includes(normalized)) return normalized;
  return null;
};

const resolvePersistedIdentity = (claims, findUser) => {
  const username = String(claims?.sub || '').trim();
  if (!username) throw new Error('Token subject is missing');
  const user = findUser(username);
  if (!user) throw new Error('Authenticated user no longer exists');
  return { sub: user.username, role: normalizeUserRole(user.role), exp: claims.exp };
};

const isSuperadmin = user => normalizeUserRole(user?.role) === 'superadmin';
const canViewTerminal = isSuperadmin;
const redactTerminalData = (channel, user) => canViewTerminal(user)
  ? channel
  : { ...channel, command: '', outputLog: [] };

const createTokenCodec = secret => {
  const base64url = input => Buffer.from(input).toString('base64url');
  const signToken = payload => {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  };
  const verifyToken = token => {
    const [header, body, sig] = String(token || '').split('.');
    if (!header || !body || !sig) throw new Error('Invalid token');
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const suppliedBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      throw new Error('Invalid token signature');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired');
    return payload;
  };
  return { signToken, verifyToken };
};

const legacyPasswordHash = password => crypto.createHash('sha256').update(`kte:${password}`).digest('hex');
const isStrongPassword = password => String(password || '').trim().length >= 4;
const passwordNeedsUpgrade = hash => !/^\$2[aby]\$/.test(String(hash || ''));
const hashPassword = password => bcrypt.hashSync(String(password || ''), 12);
const verifyPassword = (password, storedHash) => {
  const hash = String(storedHash || '');
  if (!hash) return false;
  if (!passwordNeedsUpgrade(hash)) return bcrypt.compareSync(String(password || ''), hash);
  const supplied = Buffer.from(legacyPasswordHash(String(password || '')));
  const expected = Buffer.from(hash);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

module.exports = {
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
};
