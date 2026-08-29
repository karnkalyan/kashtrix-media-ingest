const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getRecordingElapsedMs,
    setRecordingProcessPaused,
    setWindowsProcessPaused,
} = require('./recordingProcessControl');

test('Unix recording pause and resume use non-terminating process signals', async () => {
    const signals = [];
    const proc = { pid: 123, exitCode: null, signalCode: null, kill: signal => (signals.push(signal), true) };
    await setRecordingProcessPaused(proc, true, { platform: 'linux' });
    await setRecordingProcessPaused(proc, false, { platform: 'linux' });
    assert.deepEqual(signals, ['SIGSTOP', 'SIGCONT']);
});

test('Windows recording control invokes native suspend and resume through PowerShell', async () => {
    const scripts = [];
    const execFileImpl = (_file, args, _options, callback) => {
        scripts.push(args.at(-1));
        callback(null, '', '');
    };
    await setWindowsProcessPaused(456, true, execFileImpl);
    await setWindowsProcessPaused(456, false, execFileImpl);
    assert.match(scripts[0], /SetPaused\(456, \$true\)/);
    assert.match(scripts[1], /SetPaused\(456, \$false\)/);
});

test('recording elapsed time excludes completed and current pause intervals', () => {
    const startTime = '2026-08-29T00:00:00.000Z';
    const now = new Date(startTime).getTime() + 20_000;
    assert.equal(getRecordingElapsedMs({ startTime, totalPausedMs: 4_000 }, now), 16_000);
    assert.equal(getRecordingElapsedMs({ startTime, totalPausedMs: 4_000, isPaused: true, pauseStartedAt: now - 3_000 }, now), 13_000);
});
