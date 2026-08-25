const test = require('node:test');
const assert = require('node:assert/strict');
const { MODULES, canonicalModule, getEntitlementLimit, getRecordingDeviceLimit, hasModule, toUiFeatures } = require('./licensePolicy');

test('secure module aliases normalize to one canonical entitlement', () => {
  assert.equal(canonicalModule('live-server'), MODULES.LIVE_SERVER);
  assert.equal(hasModule(['LIVE_SERVER'], 'live-server'), true);
  assert.equal(hasModule(['INGEST-SERVER'], MODULES.INGEST_SERVER), true);
  assert.deepEqual(toUiFeatures(['channels', 'LIVE_SERVER', 'INGEST_SERVER']), ['channels', 'live-server', 'ingest-server']);
});

test('numeric limits are derived from signed dynamic entitlement values', () => {
  assert.equal(getRecordingDeviceLimit({ INGEST_SERVER: true }), 0);
  assert.equal(getRecordingDeviceLimit({ RECORDING_DEVICES: 5 }), 5);
  assert.equal(getEntitlementLimit({ TRANSCODE_QUEUE_ITEMS: 17 }, MODULES.TRANSCODE_QUEUE_ITEMS), 17);
  assert.equal(getRecordingDeviceLimit({ RECORDING_DEVICES: -1 }), 0);
});
