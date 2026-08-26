const MODULES = Object.freeze({
  CHANNELS: 'CHANNELS',
  LIVE_SERVER: 'LIVE_SERVER',
  INGEST_SERVER: 'INGEST_SERVER',
  STREAMOPS: 'STREAMOPS',
  VOD_PLAYOUT: 'VOD_PLAYOUT',
  RECORDING_DEVICES: 'RECORDING_DEVICES',
  TRANSCODE_QUEUE_ITEMS: 'TRANSCODE_QUEUE_ITEMS',
  MUX: 'MUX',
  MPTS_MUX: 'MPTS_MUX',
});

const canonicalModule = value => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const normalizeModules = modules => [...new Set(
  (Array.isArray(modules) ? modules : []).map(canonicalModule).filter(Boolean)
)].sort();

const hasModule = (modules, moduleCode) => normalizeModules(modules).includes(canonicalModule(moduleCode));

const normalizeEntitlements = entitlements => Object.fromEntries(Object.entries(
  entitlements && typeof entitlements === 'object' && !Array.isArray(entitlements) ? entitlements : {}
).map(([code, value]) => [canonicalModule(code), value]).filter(([code, value]) => code && (typeof value === 'boolean' || (Number.isInteger(value) && value >= 0))));

const getEntitlementLimit = (entitlements, code) => {
  const value = normalizeEntitlements(entitlements)[canonicalModule(code)];
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

const getRecordingDeviceLimit = entitlements => getEntitlementLimit(entitlements, MODULES.RECORDING_DEVICES);

const toUiFeatures = modules => {
  const normalized = normalizeModules(modules);
  const features = [];
  if (normalized.includes(MODULES.CHANNELS)) features.push('channels');
  if (normalized.includes(MODULES.LIVE_SERVER)) features.push('live-server');
  if (normalized.includes(MODULES.INGEST_SERVER)) features.push('ingest-server');
  if (normalized.includes(MODULES.STREAMOPS)) features.push('streamops');
  if (normalized.includes(MODULES.VOD_PLAYOUT)) features.push('vod-playout');
  if (normalized.includes(MODULES.TRANSCODE_QUEUE_ITEMS)) features.push('transcode');
  if (normalized.includes(MODULES.MUX) || normalized.includes(MODULES.MPTS_MUX) || normalized.includes(MODULES.STREAMOPS)) features.push('mux');
  return features;
};

module.exports = {
  MODULES,
  canonicalModule,
  getRecordingDeviceLimit,
  getEntitlementLimit,
  hasModule,
  normalizeModules,
  normalizeEntitlements,
  toUiFeatures,
};
