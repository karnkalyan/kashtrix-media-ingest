const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { KashtrixFtpServer } = require('./ftpServer');

describe('Kashtrix Embedded FTP Server Test Suite', () => {
    const testDir = path.join(__dirname, 'scratch', 'ftp_test_' + Date.now());
    let ftpServer;
    const testPort = 21299;

    before(async () => {
        fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'sample_clip.mp4'), 'MOCK_VIDEO_DATA');
        fs.mkdirSync(path.join(testDir, 'recordings'), { recursive: true });
        fs.writeFileSync(path.join(testDir, 'recordings', 'rec_01.ts'), 'MOCK_TS_DATA');

        ftpServer = new KashtrixFtpServer(testDir, {
            port: testPort,
            getAuthSettings: () => ({
                authMode: 'anonymous',
                users: [
                    { username: 'media_admin', password: 'Password123!', role: 'admin', enabled: true, permissions: { read: true, write: true, delete: true, update: true } }
                ]
            })
        });

        await ftpServer.start();
    });

    after(async () => {
        if (ftpServer) ftpServer.stop();
        await new Promise(r => setTimeout(r, 50));
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch (_) {}
    });

    it('FTP server starts and accepts TCP connections with 220 banner', () => {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({ port: testPort, host: '127.0.0.1' }, () => {});
            let received = '';
            client.on('data', (chunk) => {
                received += chunk.toString();
                if (received.includes('220 ')) {
                    assert.ok(received.includes('Kashtrix StreamOps Enterprise FTP Server'));
                    client.end();
                    resolve();
                }
            });
            client.on('error', reject);
        });
    });

    it('FTP handles anonymous authentication and PWD', () => {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({ port: testPort, host: '127.0.0.1' });
            let step = 0;

            client.on('data', (chunk) => {
                const res = chunk.toString();
                if (step === 0 && res.includes('220')) {
                    step = 1;
                    client.write('USER anonymous\r\n');
                } else if (step === 1 && res.includes('331')) {
                    step = 2;
                    client.write('PASS guest@streamops.lan\r\n');
                } else if (step === 2 && res.includes('230')) {
                    step = 3;
                    client.write('PWD\r\n');
                } else if (step === 3 && res.includes('257')) {
                    assert.ok(res.includes('"/"'));
                    client.end();
                    resolve();
                }
            });
            client.on('error', reject);
        });
    });
});
