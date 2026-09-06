const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { KashtrixTcpCommandServer } = require('./tcpCommandServer');

// Helper to send a command and receive response over TCP
const sendTcpCommand = (port, command) => {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
            socket.write(command.endsWith('\n') ? command : `${command}\n`);
        });

        let response = '';
        socket.on('data', (chunk) => {
            response += chunk.toString('utf8');
            // If we received at least one complete line, resolve
            if (response.includes('\n')) {
                socket.end();
            }
        });

        socket.on('end', () => resolve(response.trim()));
        socket.on('error', reject);
        setTimeout(() => {
            socket.destroy();
            resolve(response.trim());
        }, 3000);
    });
};

test('KashtrixTcpCommandServer responds to PING and HELP', async () => {
    const server = new KashtrixTcpCommandServer({
        port: 19991,
        host: '127.0.0.1',
    });
    await server.start();

    try {
        const pong = await sendTcpCommand(19991, 'PING');
        assert.equal(pong, 'PONG');

        const help = await sendTcpCommand(19991, 'HELP');
        assert.ok(help.includes('KASHTRIX STREAMOPS TCP CONTROL PROTOCOL'));
        assert.ok(help.includes('START'));
        assert.ok(help.includes('STOP'));
    } finally {
        await server.stop();
    }
});

test('KashtrixTcpCommandServer executes START and STOP recording commands', async () => {
    const startedCalls = [];
    const stoppedCalls = [];
    let mockRecordings = [];

    const server = new KashtrixTcpCommandServer({
        port: 19992,
        host: '127.0.0.1',
        startRecording: async (args) => {
            startedCalls.push(args);
            mockRecordings.push({ key: `${args.appName}/${args.stream}`, app: args.appName, stream: args.stream });
            return { success: true, key: `${args.appName}/${args.stream}` };
        },
        stopRecording: async (args) => {
            stoppedCalls.push(args);
            mockRecordings = mockRecordings.filter(r => r.key !== (args.key || `${args.appName}/${args.stream}`));
            return { success: true, key: args.key || `${args.appName || 'live'}/${args.stream || 'feed1'}` };
        },
        stopAllRecordings: async () => {
            const count = mockRecordings.length;
            mockRecordings = [];
            return { success: true, stoppedCount: count };
        },
        getActiveRecordings: () => mockRecordings,
    });
    await server.start();

    try {
        // Status with no recordings
        const emptyStatus = await sendTcpCommand(19992, 'STATUS');
        assert.equal(emptyStatus, 'NO_ACTIVE_RECORDINGS');

        // Start recording
        const startRes = await sendTcpCommand(19992, 'START live feed1 mp4');
        assert.ok(startRes.includes('OK: RECORDING_STARTED'));
        assert.ok(startRes.includes('live/feed1'));
        assert.equal(startedCalls.length, 1);
        assert.equal(startedCalls[0].appName, 'live');
        assert.equal(startedCalls[0].stream, 'feed1');

        // Status with active recording
        const activeStatus = await sendTcpCommand(19992, 'STATUS');
        assert.ok(activeStatus.includes('ACTIVE RECORDINGS (1)'));
        assert.ok(activeStatus.includes('live/feed1'));

        // Stop recording
        const stopRes = await sendTcpCommand(19992, 'STOP live feed1');
        assert.ok(stopRes.includes('OK: RECORDING_STOPPED'));
        assert.equal(stoppedCalls.length, 1);

        // Status after stop
        const postStopStatus = await sendTcpCommand(19992, 'STATUS');
        assert.equal(postStopStatus, 'NO_ACTIVE_RECORDINGS');
    } finally {
        await server.stop();
    }
});

test('KashtrixTcpCommandServer handles JSON commands and STOP_ALL', async () => {
    let mockRecordings = [
        { key: 'live/cam1', app: 'live', stream: 'cam1' },
        { key: 'live/cam2', app: 'live', stream: 'cam2' },
    ];

    const server = new KashtrixTcpCommandServer({
        port: 19993,
        host: '127.0.0.1',
        startRecording: async (args) => ({ success: true, key: `${args.appName}/${args.stream}` }),
        stopRecording: async (args) => ({ success: true, key: args.key || `${args.appName}/${args.stream}` }),
        stopAllRecordings: async () => {
            const count = mockRecordings.length;
            mockRecordings = [];
            return { success: true, stoppedCount: count };
        },
        getActiveRecordings: () => mockRecordings,
    });
    await server.start();

    try {
        // JSON PING
        const jsonPing = await sendTcpCommand(19993, JSON.stringify({ command: 'PING' }));
        const pingObj = JSON.parse(jsonPing);
        assert.equal(pingObj.success, true);
        assert.equal(pingObj.response, 'PONG');

        // JSON STATUS
        const jsonStatus = await sendTcpCommand(19993, JSON.stringify({ command: 'STATUS' }));
        const statusObj = JSON.parse(jsonStatus);
        assert.equal(statusObj.success, true);
        assert.equal(statusObj.activeCount, 2);

        // STOP_ALL via plain text
        const stopAllRes = await sendTcpCommand(19993, 'STOP_ALL');
        assert.ok(stopAllRes.includes('OK: STOPPED_ALL count=2'));
        assert.equal(mockRecordings.length, 0);
    } finally {
        await server.stop();
    }
});

test('KashtrixTcpCommandServer handles Easy OnAIR playout triggers (no newlines, CR only, null bytes, quotes)', async () => {
    let stoppedAllCount = 0;
    let stoppedSingleCalls = [];

    const server = new KashtrixTcpCommandServer({
        port: 19994,
        host: '127.0.0.1',
        stopRecording: async (args) => {
            stoppedSingleCalls.push(args);
            return { success: true, key: args.key || `${args.appName}/${args.stream}` };
        },
        stopAllRecordings: async () => {
            stoppedAllCount++;
            return { success: true, stoppedCount: 1 };
        },
        getActiveRecordings: () => [{ key: 'device/cam1', app: 'device', stream: 'cam1' }],
    });
    await server.start();

    // Helper that sends RAW bytes without appending any newline
    const sendRawTcp = (rawString, disconnectImmediately = false) => {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ port: 19994, host: '127.0.0.1' }, () => {
                socket.write(rawString);
                if (disconnectImmediately) {
                    socket.end(); // Immediate disconnect without waiting for response
                }
            });
            let data = '';
            socket.on('data', (chunk) => {
                data += chunk.toString('utf8');
                socket.end();
            });
            socket.on('close', () => resolve(data.trim()));
            socket.on('error', reject);
            setTimeout(() => { socket.destroy(); resolve(data.trim()); }, 1500);
        });
    };

    try {
        // 1. Bare "STOP_ALL" with 50ms auto-flush (reads response)
        const res1 = await sendRawTcp('STOP_ALL');
        assert.ok(res1.includes('OK: STOPPED_ALL'), `Expected OK: STOPPED_ALL, got: ${res1}`);
        assert.equal(stoppedAllCount, 1);

        // 2. "STOP ALL" with space and quotes '"STOP ALL"'
        const res2 = await sendRawTcp('"STOP ALL"');
        assert.ok(res2.includes('OK: STOPPED_ALL'), `Expected OK: STOPPED_ALL, got: ${res2}`);
        assert.equal(stoppedAllCount, 2);

        // 3. "STOP_ALL\r" (Mac / classic playout carriage return)
        const res3 = await sendRawTcp('STOP_ALL\r');
        assert.ok(res3.includes('OK: STOPPED_ALL'), `Expected OK: STOPPED_ALL, got: ${res3}`);
        assert.equal(stoppedAllCount, 3);

        // 4. "STOP_ALL\0" (Null-terminated C/Delphi string)
        const res4 = await sendRawTcp('STOP_ALL\0');
        assert.ok(res4.includes('OK: STOPPED_ALL'), `Expected OK: STOPPED_ALL, got: ${res4}`);
        assert.equal(stoppedAllCount, 4);

        // 5. Bare "STOP" when 1 recording is active
        const res5 = await sendRawTcp('STOP');
        assert.ok(res5.includes('OK: RECORDING_STOPPED'), `Expected OK: RECORDING_STOPPED, got: ${res5}`);
        assert.equal(stoppedSingleCalls.length, 1);

        // 6. Fire-and-forget: sends "STOP_ALL" and immediately disconnects without waiting
        await sendRawTcp('STOP_ALL', true);
        // Give server 50ms to finish disconnect flush
        await new Promise(r => setTimeout(r, 60));
        assert.equal(stoppedAllCount, 5);
    } finally {
        await server.stop();
    }
});

test('KashtrixTcpCommandServer handles START with Preset name (e.g. START AP1 Final, PRESETS list)', async () => {
    const mockPresets = [
        {
            id: 'preset-ap1-final',
            name: 'AP1 Final',
            sourceType: 'ingest',
            selectedStreamKey: 'live/ap1',
            config: { format: 'mp4', resolution: '1920x1080', videoBitrate: 15000 }
        },
        {
            id: 'preset-decklink-master',
            name: 'DeckLink Master',
            sourceType: 'device',
            videoDevice: 'DeckLink Quad 1',
            config: { format: 'mov', videoBitrate: 50000 }
        }
    ];

    let startedPreset = null;

    const server = new KashtrixTcpCommandServer({
        port: 19995,
        host: '127.0.0.1',
        getRecordingPresets: async () => mockPresets,
        startRecordingByPreset: async (preset) => {
            startedPreset = preset;
            return { success: true, key: preset.selectedStreamKey || preset.name };
        },
    });
    await server.start();

    const sendTcp = (cmd) => {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ port: 19995, host: '127.0.0.1' }, () => {
                socket.write(`${cmd}\n`);
            });
            let data = '';
            socket.on('data', chunk => {
                data += chunk.toString('utf8');
                socket.end();
            });
            socket.on('close', () => resolve(data.trim()));
            socket.on('error', reject);
            setTimeout(() => { socket.destroy(); resolve(data.trim()); }, 2000);
        });
    };

    try {
        // 1. List presets
        const presetsList = await sendTcp('PRESETS');
        assert.ok(presetsList.includes('AP1 Final'));
        assert.ok(presetsList.includes('DeckLink Master'));

        // 2. Start by direct preset name: "START AP1 Final"
        const startRes1 = await sendTcp('START AP1 Final');
        assert.ok(startRes1.includes('OK: RECORDING_STARTED'));
        assert.ok(startRes1.includes('preset="AP1 Final"'));
        assert.equal(startedPreset?.id, 'preset-ap1-final');

        // 3. Start with PRESET keyword: "START PRESET DeckLink Master"
        const startRes2 = await sendTcp('START PRESET DeckLink Master');
        assert.ok(startRes2.includes('OK: RECORDING_STARTED'));
        assert.ok(startRes2.includes('preset="DeckLink Master"'));
        assert.equal(startedPreset?.id, 'preset-decklink-master');

        // 4. Invalid preset name gives helpful list
        const invalidRes = await sendTcp('START PRESET NonExistentPreset');
        assert.ok(invalidRes.includes('ERROR: Preset "NonExistentPreset" not found'));
        assert.ok(invalidRes.includes('Available presets'));

        // 5. JSON START with preset
        const jsonRes = await sendTcp(JSON.stringify({ command: 'START', preset: 'AP1 Final' }));
        const jsonObj = JSON.parse(jsonRes);
        assert.equal(jsonObj.success, true);
    } finally {
        await server.stop();
    }
});


