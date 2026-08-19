const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const {
    stopChildAndWait,
    registerRecordingPreview,
    stopRecordingPreviews,
    registerRecordingThumbnail,
    stopRecordingThumbnails,
    registerRecordingHttpReader,
    closeRecordingHttpReaders,
    acquireDeletionLock,
    releaseDeletionLock,
    isRecordingLocked,
    recordingPreviewProcesses,
    recordingThumbnailProcesses,
    recordingHttpReaders,
    deletingRecordings,
} = require('./recordingLifecycle');

describe('Recording Lifecycle & Leaked FD Prevention Test Suite', () => {
    const testDir = path.join(__dirname, '__test_recordings__');

    beforeEach(() => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        deletingRecordings.clear();
        recordingPreviewProcesses.clear();
        recordingThumbnailProcesses.clear();
        recordingHttpReaders.clear();
    });

    afterEach(() => {
        deletingRecordings.clear();
        recordingPreviewProcesses.clear();
        recordingThumbnailProcesses.clear();
        recordingHttpReaders.clear();
        try {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        } catch (_) {}
    });

    describe('1. stopChildAndWait Helper', () => {
        test('resolves immediately when proc is null or undefined', async () => {
            const res1 = await stopChildAndWait(null);
            assert.equal(res1, false);

            const res2 = await stopChildAndWait(undefined);
            assert.equal(res2, false);
        });

        test('resolves immediately when process is already dead (exitCode not null)', async () => {
            const dummyProc = new EventEmitter();
            dummyProc.pid = 12345;
            dummyProc.exitCode = 0;
            dummyProc.signalCode = null;
            dummyProc.killed = true;

            const res = await stopChildAndWait(dummyProc);
            assert.equal(res, true);
        });

        test('gracefully stops a running Node child process and awaits its close event', async () => {
            const child = spawn(process.execPath, ['-e', `
                process.on('SIGTERM', () => {
                    process.exit(0);
                });
                setInterval(() => {}, 1000);
            `], { stdio: ['pipe', 'pipe', 'pipe'] });

            assert.ok(child.pid);

            const stopped = await stopChildAndWait(child, { timeoutMs: 2000, signal: 'SIGTERM' });
            assert.equal(stopped, true);
            assert.ok(child.exitCode !== null || child.signalCode !== null || child.killed);
        });

        test('gracefully sends stdin "q\\n" if gracefulStdin is enabled before fallback', async () => {
            const child = spawn(process.execPath, ['-e', `
                process.stdin.on('data', (d) => {
                    if (d.toString().trim() === 'q') {
                        process.exit(0);
                    }
                });
                setInterval(() => {}, 1000);
            `], { stdio: ['pipe', 'pipe', 'pipe'] });

            const stopped = await stopChildAndWait(child, { timeoutMs: 2000, gracefulStdin: true });
            assert.equal(stopped, true);
            assert.ok(child.exitCode !== null || child.signalCode !== null || child.killed);
        });

        test('escalates to SIGKILL if child process does not exit within timeoutMs', async () => {
            const child = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);

            const stopped = await stopChildAndWait(child, { timeoutMs: 300, signal: 'SIGTERM' });
            assert.equal(stopped, true);
            assert.ok(child.exitCode !== null || child.signalCode !== null || child.killed);
        });

        test('handles concurrent calls on the same child without unhandled rejections', async () => {
            const child = spawn(process.execPath, ['-e', `
                process.on('SIGTERM', () => process.exit(0));
                setInterval(() => {}, 1000);
            `]);

            const [res1, res2] = await Promise.all([
                stopChildAndWait(child, { timeoutMs: 1500 }),
                stopChildAndWait(child, { timeoutMs: 1500 }),
            ]);

            assert.equal(res1, true);
            assert.equal(res2, true);
        });
    });

    describe('2. Deletion Locking & Rejection', () => {
        test('acquires and releases deletion locks correctly by id and file path', () => {
            const filePath = path.join(testDir, 'rec-1.mkv');
            const normalized = path.resolve(filePath);

            assert.equal(isRecordingLocked(1, filePath), false);

            const acquired = acquireDeletionLock(1, filePath);
            assert.equal(acquired, true);
            assert.equal(isRecordingLocked(1, filePath), true);
            assert.equal(isRecordingLocked('1', normalized), true);

            // Re-acquiring while locked should fail
            const duplicate = acquireDeletionLock(1, filePath);
            assert.equal(duplicate, false);

            // Releasing unlocks both id and file path
            releaseDeletionLock(1, filePath);
            assert.equal(isRecordingLocked(1, filePath), false);
        });

        test('locks recording by normalized path even if relative path given', () => {
            const filePath = path.join(testDir, 'rec-rel.mkv');
            const acquired = acquireDeletionLock('custom-id', filePath);
            assert.equal(acquired, true);

            const isLockedAbs = isRecordingLocked('other-id', path.resolve(filePath));
            assert.equal(isLockedAbs, true);

            releaseDeletionLock('custom-id', filePath);
            assert.equal(isRecordingLocked('custom-id', filePath), false);
        });
    });

    describe('3. Preview Processes Registration & Termination', () => {
        test('tracks multiple preview processes for a recording and terminates them all before delete', async () => {
            const filePath = path.join(testDir, 'stream.mkv');
            fs.writeFileSync(filePath, 'dummy video content');

            const preview1 = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);
            const preview2 = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);

            const dummyRes1 = new EventEmitter();
            dummyRes1.headersSent = false;
            dummyRes1.destroy = () => {};
            dummyRes1.end = () => {};
            const dummyReq1 = new EventEmitter();

            const dummyRes2 = new EventEmitter();
            dummyRes2.headersSent = false;
            dummyRes2.destroy = () => {};
            dummyRes2.end = () => {};
            const dummyReq2 = new EventEmitter();

            registerRecordingPreview(100, {
                id: 100,
                proc: preview1,
                res: dummyRes1,
                req: dummyReq1,
                filePath,
            });

            registerRecordingPreview(100, {
                id: 100,
                proc: preview2,
                res: dummyRes2,
                req: dummyReq2,
                filePath,
            });

            assert.equal(recordingPreviewProcesses.get('100')?.size, 2);

            // Stop all previews for recording 100
            await stopRecordingPreviews(100, filePath);

            assert.equal(recordingPreviewProcesses.get('100')?.size || 0, 0);
            assert.ok(preview1.exitCode !== null || preview1.signalCode !== null || preview1.killed);
            assert.ok(preview2.exitCode !== null || preview2.signalCode !== null || preview2.killed);
        });

        test('unregisters and kills preview process cleanly when client disconnects (req close)', async () => {
            const filePath = path.join(testDir, 'stream-client-close.mkv');
            const preview = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);

            const dummyReq = new EventEmitter();
            const dummyRes = new EventEmitter();
            dummyRes.headersSent = false;
            dummyRes.destroy = () => {};

            const unregister = registerRecordingPreview(200, {
                id: 200,
                proc: preview,
                res: dummyRes,
                req: dummyReq,
                filePath,
            });

            // Simulate the handler cleanup on request close
            let cleaned = false;
            const cleanup = () => {
                if (cleaned) return;
                cleaned = true;
                unregister();
                try { preview.kill('SIGTERM'); } catch (_) {}
            };
            dummyReq.on('close', cleanup);
            dummyRes.on('close', cleanup);

            assert.equal(recordingPreviewProcesses.get('200')?.size, 1);

            // Trigger client disconnect
            dummyReq.emit('close');

            // Give event loop a tick
            await new Promise(r => setTimeout(r, 200));

            assert.equal(recordingPreviewProcesses.get('200')?.size || 0, 0);
            assert.ok(preview.exitCode !== null || preview.signalCode !== null || preview.killed);
        });
    });

    describe('4. Thumbnail Processes Registration & Cleanup', () => {
        test('tracks and terminates thumbnail process and unlinks temporary file', async () => {
            const filePath = path.join(testDir, 'thumb-test.mkv');
            const tempThumb = path.join(testDir, 'thumb-temp.jpg');
            fs.writeFileSync(tempThumb, 'temp image');

            const thumbProc = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);
            const dummyRes = new EventEmitter();
            dummyRes.destroy = () => {};

            registerRecordingThumbnail(300, {
                id: 300,
                proc: thumbProc,
                res: dummyRes,
                req: new EventEmitter(),
                filePath,
                tempPath: tempThumb,
            });

            assert.equal(recordingThumbnailProcesses.get('300')?.size, 1);
            assert.equal(fs.existsSync(tempThumb), true);

            await stopRecordingThumbnails(300, filePath);

            assert.equal(recordingThumbnailProcesses.get('300')?.size || 0, 0);
            assert.ok(thumbProc.exitCode !== null || thumbProc.signalCode !== null || thumbProc.killed);
            assert.equal(fs.existsSync(tempThumb), false);
        });
    });

    describe('5. HTTP Reader Streams Tracking & Destruction', () => {
        test('registers active readStream and destroys it when closeRecordingHttpReaders is called', async () => {
            const filePath = path.join(testDir, 'download.mkv');
            fs.writeFileSync(filePath, 'binary media chunk data for download');

            const fileStream = fs.createReadStream(filePath);
            const dummyRes = new EventEmitter();
            dummyRes.destroy = () => {};
            const dummyReq = new EventEmitter();

            registerRecordingHttpReader(filePath, {
                req: dummyReq,
                res: dummyRes,
                fileStream,
            });

            const normKey = path.resolve(filePath);
            assert.equal(recordingHttpReaders.get(normKey)?.size, 1);

            let destroyed = false;
            fileStream.on('close', () => { destroyed = true; });

            await closeRecordingHttpReaders(filePath);

            assert.equal(recordingHttpReaders.get(normKey)?.size || 0, 0);
            assert.equal(fileStream.destroyed, true);
        });
    });

    describe('6. End-to-End Deletion Sequence Simulation', () => {
        test('proves unlink only executes AFTER active recorder, previews, and HTTP streams are closed', async () => {
            const filePath = path.join(testDir, 'Jana-Pairavi-Haraka_2026-08-18_12-41-33.mkv');
            fs.writeFileSync(filePath, 'mock 363GB recording contents');

            const recordingId = 777;

            // 1. Simulate active recorder process
            const recorderProc = spawn(process.execPath, ['-e', `
                process.on('SIGTERM', () => process.exit(0));
                setInterval(() => {}, 1000);
            `]);

            // 2. Simulate 2 active preview readers holding the file open
            const preview1 = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);
            const preview2 = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000);`]);

            const res1 = new EventEmitter();
            res1.destroy = () => {};
            res1.end = () => {};
            const res2 = new EventEmitter();
            res2.destroy = () => {};
            res2.end = () => {};

            registerRecordingPreview(recordingId, {
                id: recordingId,
                proc: preview1,
                res: res1,
                req: new EventEmitter(),
                filePath,
            });
            registerRecordingPreview(recordingId, {
                id: recordingId,
                proc: preview2,
                res: res2,
                req: new EventEmitter(),
                filePath,
            });

            // 3. Simulate active HTTP stream reader
            const readStream = fs.createReadStream(filePath);
            registerRecordingHttpReader(filePath, {
                req: new EventEmitter(),
                res: new EventEmitter(),
                fileStream: readStream,
            });

            // Execute full delete pipeline step by step as implemented in server.js
            assert.equal(fs.existsSync(filePath), true);

            // Step A: Acquire deletion lock
            const lockAcquired = acquireDeletionLock(recordingId, filePath);
            assert.equal(lockAcquired, true);

            // New requests during delete must be rejected with 409
            assert.equal(isRecordingLocked(recordingId, filePath), true);

            // Step B: Stop active recorder child process and await close
            await stopChildAndWait(recorderProc, { signal: 'SIGTERM', timeoutMs: 2000 });
            assert.ok(recorderProc.exitCode !== null || recorderProc.signalCode !== null || recorderProc.killed);

            // Step C: Stop all preview FFmpeg readers and await exit
            await stopRecordingPreviews(recordingId, filePath);
            assert.ok(preview1.exitCode !== null || preview1.signalCode !== null || preview1.killed);
            assert.ok(preview2.exitCode !== null || preview2.signalCode !== null || preview2.killed);

            // Step D: Stop thumbnail FFmpeg processes
            await stopRecordingThumbnails(recordingId, filePath);

            // Step E: Close HTTP download/playback streams
            await closeRecordingHttpReaders(filePath);
            assert.equal(readStream.destroyed, true);

            // Step F: All process handles closed -> safe to unlink
            fs.unlinkSync(filePath);
            assert.equal(fs.existsSync(filePath), false);

            // Step G: Release lock
            releaseDeletionLock(recordingId, filePath);
            assert.equal(isRecordingLocked(recordingId, filePath), false);
        });
    });

    describe('7. Storage Safety Thresholds & Configurable Capacity Calculations', () => {
        const systemApi = require('./systemInfoApi');

        test('returns storage stats with default 90% threshold and 500MB safety reserve', () => {
            const stats = systemApi.getRealStorageStats(testDir);
            assert.ok(stats);
            assert.equal(stats.safetyEnabled, true);
            assert.equal(stats.thresholdPercent, 90);
            assert.equal(stats.criticalThresholdPercent, 95);
            assert.equal(stats.minFreeMb, 500);
            assert.equal(typeof stats.canRecord, 'boolean');
            assert.equal(typeof stats.isFull, 'boolean');
        });

        test('permits disabling safety enforcement via storageSafetyEnabled: false', () => {
            const stats = systemApi.getRealStorageStats(testDir, { storageSafetyEnabled: false });
            assert.ok(stats);
            assert.equal(stats.safetyEnabled, false);
            assert.equal(stats.canRecord, true);
            assert.equal(stats.isFull, false);
            assert.equal(stats.isCritical, false);
        });

        test('respects custom threshold percentages (e.g. 80% limit, 85% critical)', () => {
            const stats = systemApi.getRealStorageStats(testDir, {
                storageSafetyEnabled: true,
                storageThresholdPercent: 80,
                storageCriticalThresholdPercent: 85,
                storageMinFreeMb: 1000,
            });
            assert.ok(stats);
            assert.equal(stats.safetyEnabled, true);
            assert.equal(stats.thresholdPercent, 80);
            assert.equal(stats.criticalThresholdPercent, 85);
            assert.equal(stats.minFreeMb, 1000);
        });
    });
});
