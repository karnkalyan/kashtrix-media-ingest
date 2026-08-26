const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canViewTerminal,
  createTokenCodec,
  hashPassword,
  isStrongPassword,
  isSuperadmin,
  parseManagedRole,
  passwordNeedsUpgrade,
  redactTerminalData,
  requireEnv,
  resolvePersistedIdentity,
  verifyPassword,
} = require('./securityPolicy');

test('required secrets fail closed without revealing values', () => {
  assert.throws(() => requireEnv('KTE_JWT_SECRET', 32, {}), /KTE_JWT_SECRET is missing or empty/);
  assert.throws(() => requireEnv('KTE_JWT_SECRET', 32, { KTE_JWT_SECRET: 'short' }), /not securely configured/);
  assert.throws(() => requireEnv('KTE_JWT_SECRET', 32, { KTE_JWT_SECRET: 'GENERATE_A_RANDOM_SECRET' }), /not securely configured/);
});

test('forged or tampered JWT signatures fail', () => {
  const codec = createTokenCodec('a'.repeat(32));
  const token = codec.signToken({ sub: 'operator', role: 'superadmin' });
  assert.throws(() => codec.verifyToken(`${token.slice(0, -1)}x`), /Invalid token signature/);
});

test('JWT role claims are ignored in favor of persisted MySQL role', () => {
  const identity = resolvePersistedIdentity(
    { sub: 'operator', role: 'superadmin' },
    username => ({ username, role: 'USER' }),
  );
  assert.equal(identity.role, 'user');
});

test('admin and user payloads cannot assign superadmin', () => {
  assert.equal(parseManagedRole('admin'), 'admin');
  assert.equal(parseManagedRole('user'), 'user');
  assert.equal(parseManagedRole('operator'), 'operator');
  assert.equal(parseManagedRole('archive'), 'archive');
  assert.equal(parseManagedRole('superadmin'), null);
  assert.equal(parseManagedRole('SUPER_ADMIN'), null);
  assert.equal(isSuperadmin({ role: 'admin' }), false);
  assert.equal(isSuperadmin({ role: 'operator' }), false);
  assert.equal(isSuperadmin({ role: 'archive' }), false);
  assert.equal(isSuperadmin({ role: 'user' }), false);
  assert.equal(isSuperadmin({ role: 'SUPER_ADMIN' }), true);
});

test('terminal data is visible only to persisted superadmin role', () => {
  const channel = { command: 'ffmpeg secret', outputLog: ['private'], name: 'channel' };
  assert.deepEqual(redactTerminalData(channel, { role: 'admin' }), { ...channel, command: '', outputLog: [] });
  assert.deepEqual(redactTerminalData(channel, { role: 'user' }), { ...channel, command: '', outputLog: [] });
  assert.equal(canViewTerminal({ role: 'SUPER_ADMIN' }), true);
  assert.deepEqual(redactTerminalData(channel, { role: 'SUPER_ADMIN' }), channel);
});

test('new passwords are salted and legacy hashes can be upgraded', () => {
  const hash = hashPassword('a unique test password');
  assert.equal(passwordNeedsUpgrade(hash), false);
  assert.equal(verifyPassword('a unique test password', hash), true);
  assert.equal(isStrongPassword('ab'), false);
  assert.equal(isStrongPassword('1234'), true);
  assert.equal(isStrongPassword('long-enough-password'), true);
});
