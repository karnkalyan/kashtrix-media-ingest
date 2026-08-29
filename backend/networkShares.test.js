const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePrimaryIp, getNetworkShareInfo, DEFAULT_NETWORK_SHARE_USERS } = require('./networkShares');

test('resolvePrimaryIp resolves customIp when provided', () => {
    const ip = resolvePrimaryIp(null, '10.1.2.56');
    assert.equal(ip, '10.1.2.56');
});

test('resolvePrimaryIp resolves host header IP when available', () => {
    const req = { headers: { host: '10.1.2.56:3000' } };
    const ip = resolvePrimaryIp(req);
    assert.equal(ip, '10.1.2.56');
});

test('getNetworkShareInfo generates accurate SMB, FTP, Mac and Linux paths for anonymous mode', () => {
    const info = getNetworkShareInfo(null, { customIp: '10.1.2.56', authMode: 'anonymous' });
    assert.equal(info.primaryIp, '10.1.2.56');
    assert.equal(info.smb.parentPath, '\\\\10.1.2.56\\media');
    assert.equal(info.smb.recordingsPath, '\\\\10.1.2.56\\recordings');
    assert.equal(info.smb.macUrl, 'smb://10.1.2.56/media');
    assert.equal(info.smb.anonymous, true);
    assert.equal(info.ftp.url, 'ftp://10.1.2.56/media');
    assert.equal(info.ftp.anonymous, true);
    assert.equal(info.authMode, 'anonymous');
});

test('getNetworkShareInfo supports authenticated mode and roles', () => {
    const customUsers = [
        {
            id: 'nsu-1',
            username: 'editor_user',
            password: 'secret_password',
            role: 'write',
            permissions: { read: true, write: true, delete: false, update: true },
            enabled: true
        }
    ];
    const info = getNetworkShareInfo(null, { customIp: '10.1.2.56', authMode: 'authenticated', users: customUsers });
    assert.equal(info.authMode, 'authenticated');
    assert.equal(info.smb.authRequired, true);
    assert.equal(info.smb.activeUser.username, 'editor_user');
    assert.equal(info.smb.activeUser.role, 'write');
    assert.equal(info.ftp.username, 'editor_user');
});
