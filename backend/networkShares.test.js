const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePrimaryIp, getNetworkShareInfo } = require('./networkShares');

test('resolvePrimaryIp resolves customIp when provided', () => {
    const ip = resolvePrimaryIp(null, '10.1.2.56');
    assert.equal(ip, '10.1.2.56');
});

test('resolvePrimaryIp resolves host header IP when available', () => {
    const req = { headers: { host: '10.1.2.56:3000' } };
    const ip = resolvePrimaryIp(req);
    assert.equal(ip, '10.1.2.56');
});

test('getNetworkShareInfo generates accurate SMB, FTP and HTTP paths', () => {
    const info = getNetworkShareInfo(null, '10.1.2.56');
    assert.equal(info.primaryIp, '10.1.2.56');
    assert.equal(info.smb.parentPath, '\\\\10.1.2.56\\media');
    assert.equal(info.smb.recordingsPath, '\\\\10.1.2.56\\recordings');
    assert.equal(info.smb.anonymous, true);
    assert.equal(info.ftp.url, 'ftp://10.1.2.56/media');
    assert.equal(info.ftp.anonymous, true);
});
