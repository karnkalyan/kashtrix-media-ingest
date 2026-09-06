const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTokenCodec,
  resolvePersistedIdentity,
  normalizeUserRole,
} = require('./securityPolicy');

const secret = 'b'.repeat(32);
const codec = createTokenCodec(secret);

test('access and refresh tokens are correctly formatted and typed', () => {
  const user = { username: 'studio_director', role: 'admin' };
  const now = Math.floor(Date.now() / 1000);

  const accessToken = codec.signToken({
    sub: user.username,
    type: 'access',
    exp: now + 7200,
  });

  const refreshToken = codec.signToken({
    sub: user.username,
    type: 'refresh',
    exp: now + (30 * 86400),
  });

  const verifiedAccess = codec.verifyToken(accessToken);
  assert.equal(verifiedAccess.sub, 'studio_director');
  assert.equal(verifiedAccess.type, 'access');
  assert.ok(verifiedAccess.exp > now + 7000);

  const verifiedRefresh = codec.verifyToken(refreshToken);
  assert.equal(verifiedRefresh.sub, 'studio_director');
  assert.equal(verifiedRefresh.type, 'refresh');
  assert.ok(verifiedRefresh.exp > now + 2500000);
});

test('refresh tokens cannot be used to authorize protected operations', () => {
  const user = { username: 'ingest_operator', role: 'operator' };
  const refreshToken = codec.signToken({
    sub: user.username,
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const claims = codec.verifyToken(refreshToken);
  assert.throws(() => {
    resolvePersistedIdentity(claims, () => ({ id: 1, username: 'ingest_operator', role: 'OPERATOR', isActive: true }));
  }, /Invalid token type for authorization/);
});

test('access tokens authorize protected operations with persisted role', () => {
  const user = { username: 'ingest_operator', role: 'operator' };
  const accessToken = codec.signToken({
    sub: user.username,
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 7200,
  });

  const claims = codec.verifyToken(accessToken);
  const identity = resolvePersistedIdentity(claims, () => ({ id: 1, username: 'ingest_operator', role: 'OPERATOR', isActive: true }));
  assert.equal(identity.sub, 'ingest_operator');
  assert.equal(identity.role, 'operator');
  assert.equal(identity.type, 'access');
});

test('expired refresh tokens fail verification closed', () => {
  const expiredToken = codec.signToken({
    sub: 'operator',
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
  });

  assert.throws(() => {
    codec.verifyToken(expiredToken);
  }, /Token expired/);
});

test('tampered refresh tokens fail signature verification', () => {
  const validToken = codec.signToken({
    sub: 'operator',
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const tampered = validToken.slice(0, -4) + 'zzzz';
  assert.throws(() => {
    codec.verifyToken(tampered);
  }, /Invalid token signature/);
});
