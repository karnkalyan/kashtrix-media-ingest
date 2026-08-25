const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SecureLicenseRuntime, getSupportedModules } = require('./secureLicenseRuntime');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '0aa77b9e-602e-49b4-90cb-ed4ad80402b2';

const createOfflineFixture = async t => {
  const { exportSPKI, generateKeyPair, SignJWT } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('Ed25519');
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamops-license-'));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  const publicKeyPath = path.join(baseDir, 'license-public.pem');
  fs.writeFileSync(publicKeyPath, await exportSPKI(publicKey));
  const runtime = new SecureLicenseRuntime({
    baseDir,
    env: {
      KTX_LICENSE_SERVER_HOST: '127.0.0.1',
      KTX_LICENSE_TENANT_ID: TENANT_ID,
      KTX_LICENSE_APPLICATION_ID: APPLICATION_ID,
      KTX_LICENSE_CA_PATH: publicKeyPath,
      KTX_LICENSE_PUBLIC_KEY_PATH: publicKeyPath,
      KTX_LICENSE_STORAGE_DIR: path.join(baseDir, 'secure-license'),
    },
  });
  runtime.clientId = '33333333-3333-4333-8333-333333333333';
  const sign = ({ expiresIn = '1h' } = {}) => new SignJWT({
    typ: 'license',
    lic: 'LIC-OFFLINE-TEST',
    ten: TENANT_ID,
    app: APPLICATION_ID,
    prd: 'streamops',
    mod: ['STREAMOPS', 'INGEST_SERVER'],
    ent: { STREAMOPS: true, INGEST_SERVER: true, RECORDING_DEVICES: 2 },
    ev: 4,
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .setIssuer('secure-license-manager')
    .setAudience('licensed-app')
    .setJti('license-id')
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(expiresIn)
    .sign(privateKey);
  return { runtime, sign };
};

test('client advertises typed dynamic feature and limit capabilities', () => {
  const modules = getSupportedModules({});
  assert.equal(modules.find(module => module.code === 'RECORDING_DEVICES').type, 'integer');
  assert.equal(modules.find(module => module.code === 'TRANSCODE_QUEUE_ITEMS').unit, 'jobs');
  assert.ok(modules.some(module => module.code === 'STREAMOPS'));
  assert.ok(modules.some(module => module.code === 'VOD_PLAYOUT'));
});

test('HTTPS license URL is converted to a clean TLS socket endpoint', () => {
  const runtime = new SecureLicenseRuntime({
    baseDir: __dirname,
    env: {
      KTX_LICENSE_SERVER_URL: 'https://license.simulcast.com.np',
      KTX_LICENSE_SERVER_PORT: '7443',
      KTX_LICENSE_SERVERNAME: 'localhost',
    },
  });
  assert.equal(runtime.config.host, 'license.simulcast.com.np');
  assert.equal(runtime.config.port, 7443);
  assert.equal(runtime.config.servername, 'localhost');
  runtime.close();
});

test('invalid license URL is rejected as configuration', () => {
  const runtime = new SecureLicenseRuntime({
    baseDir: __dirname,
    env: { KTX_LICENSE_SERVER_URL: 'http://license.simulcast.com.np' },
  });
  assert.match(runtime.configurationError(), /only https:\/\/ URLs are supported/);
  runtime.close();
});

test('provisioning ID carries the client application, HWID, and module catalog', () => {
  const runtime = new SecureLicenseRuntime({
    baseDir: __dirname,
    env: {
      KTX_LICENSE_TENANT_ID: '11111111-1111-4111-8111-111111111111',
      KTX_LICENSE_APPLICATION_ID: '0aa77b9e-602e-49b4-90cb-ed4ad80402b2'
    }
  });
  runtime.hwid = 'a'.repeat(64);
  runtime.clientId = '33333333-3333-4333-8333-333333333333';
  const encoded = runtime.getProvisioningId().slice('KTX1.'.length);
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  assert.equal(payload.applicationId, '0aa77b9e-602e-49b4-90cb-ed4ad80402b2');
  assert.equal(payload.hwid, 'a'.repeat(64));
  assert.equal(payload.modules.find(module => module.code === 'RECORDING_DEVICES').type, 'integer');
});

test('a persisted signed license remains active offline until its expiry', async t => {
  const { runtime, sign } = await createOfflineFixture(t);
  const snapshot = await runtime.verifyOfflineLicense(await sign());
  runtime.applySnapshot(snapshot, { offline: true });

  assert.equal(runtime.getPublicStatus().status, 'activated');
  assert.equal(runtime.getPublicStatus().validationMode, 'offline');
  assert.equal(runtime.getPublicStatus().maxRecordingDevices, 2);

  runtime.handleConnectionLost(new Error('connect ECONNREFUSED'));
  assert.equal(runtime.getPublicStatus().status, 'activated');
  assert.match(runtime.getPublicStatus().reason, /remains active until expiry/i);
  runtime.close();
});

test('offline validation rejects an expired signed license', async t => {
  const { runtime, sign } = await createOfflineFixture(t);
  const error = await runtime.verifyOfflineLicense(await sign({ expiresIn: '-1s' })).catch(value => value);
  assert.match(error.message, /exp.*claim|expired/i);
  assert.equal(runtime.terminalEventForError(error), 'LICENSE_EXPIRED');
  runtime.close();
});

test('a server terminal event is remembered for the installed key', async t => {
  const { runtime, sign } = await createOfflineFixture(t);
  const key = await sign();
  await runtime.persistTerminalDenial(key, 'LICENSE_REVOKED', 'Revoked by administrator');
  const denial = await runtime.readTerminalDenial(key);
  assert.equal(denial.event, 'LICENSE_REVOKED');
  assert.equal(denial.reason, 'Revoked by administrator');
  runtime.close();
});
