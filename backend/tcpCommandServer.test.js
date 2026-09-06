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
