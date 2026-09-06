const net = require('net');

class KashtrixTcpCommandServer {
    constructor(options = {}) {
        this.port = Number(options.port || process.env.TCP_CONTROL_PORT || 9999);
        this.host = options.host || '0.0.0.0';
        this.startRecording = options.startRecording || (async () => ({ success: false, error: 'startRecording not configured' }));
        this.stopRecording = options.stopRecording || (async () => ({ success: false, error: 'stopRecording not configured' }));
        this.stopAllRecordings = options.stopAllRecordings || (async () => ({ success: false, error: 'stopAllRecordings not configured' }));
        this.getActiveRecordings = options.getActiveRecordings || (() => []);
        this.logger = options.logger || console;
        this.server = null;
        this.connections = new Set();
        this.isListening = false;
    }

    start() {
        return new Promise((resolve, reject) => {
            if (this.server) return resolve(this);

            const server = net.createServer((socket) => this.handleClient(socket));
            this.server = server;

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    this.logger.error(`[TCP Command Server] Port ${this.port} is already in use. Please check TCP_CONTROL_PORT.`);
                } else {
                    this.logger.error('[TCP Command Server] Server error:', err.message);
                }
                if (!this.isListening) reject(err);
            });

            server.listen(this.port, this.host, () => {
                this.isListening = true;
                this.logger.log(`[TCP Command Server] Listening on tcp://${this.host}:${this.port} (CLI & Automation Control)`);
                resolve(this);
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.server) return resolve();
            for (const socket of this.connections) {
                try { socket.destroy(); } catch (_) {}
            }
            this.connections.clear();
            this.server.close(() => {
                this.isListening = false;
                this.server = null;
                this.logger.log('[TCP Command Server] Stopped successfully.');
                resolve();
            });
        });
    }

    handleClient(socket) {
        this.connections.add(socket);
        const clientAddress = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || '0'}`;
        this.logger.log(`[TCP Command Server] Client connected from ${clientAddress}`);

        let buffer = '';

        socket.on('data', async (chunk) => {
            buffer += chunk.toString('utf8');
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (line.length > 0) {
                    try {
                        await this.processCommand(socket, line, clientAddress);
                    } catch (err) {
                        this.logger.error('[TCP Command Server] Command execution error:', err);
                        if (!socket.destroyed) {
                            socket.write(`ERROR: Internal error processing command: ${err.message}\r\n`);
                        }
                    }
                }
            }
        });

        socket.on('error', (err) => {
            if (err.code !== 'ECONNRESET') {
                this.logger.warn(`[TCP Command Server] Socket error (${clientAddress}):`, err.message);
            }
        });

        socket.on('close', () => {
            this.connections.delete(socket);
        });
    }

    async processCommand(socket, rawLine, clientAddress) {
        const line = rawLine.trim();
        if (!line) return;

        // Check for JSON command payload
        if (line.startsWith('{') && line.endsWith('}')) {
            try {
                const payload = JSON.parse(line);
                const result = await this.handleJsonCommand(payload, clientAddress);
                if (!socket.destroyed) {
                    socket.write(JSON.stringify(result) + '\n');
                }
                return;
            } catch (jsonErr) {
                if (!socket.destroyed) {
                    socket.write(JSON.stringify({ success: false, error: `Invalid JSON: ${jsonErr.message}` }) + '\n');
                }
                return;
            }
        }

        // Plain text command handling
        const parts = line.split(/\s+/);
        const command = parts[0].toUpperCase();
        const args = parts.slice(1);

        switch (command) {
            case 'PING':
                socket.write('PONG\r\n');
                break;

            case 'HELP':
                socket.write([
                    '--- KASHTRIX STREAMOPS TCP CONTROL PROTOCOL ---',
                    'Commands:',
                    '  STOP [app] [stream]               - Stop recording (or single active recording)',
                    '  STOP_ALL                          - Stop all active recordings',
                    '  START <app> <stream> [format]     - Start recording (e.g. START live news mp4)',
                    '  STATUS                            - List active recordings and session details',
                    '  PING                              - Connection keep-alive',
                    '  HELP                              - Display this command manual',
                    '  QUIT / EXIT                       - Disconnect session',
                    'JSON syntax supported: {"command": "STOP", "app": "live", "stream": "main"}',
                    '-----------------------------------------------',
                    ''
                ].join('\r\n'));
                break;

            case 'STATUS':
            case 'LIST': {
                const recordings = typeof this.getActiveRecordings === 'function' ? this.getActiveRecordings() : [];
                if (!recordings || recordings.length === 0) {
                    socket.write('NO_ACTIVE_RECORDINGS\r\n');
                } else {
                    const lines = [`ACTIVE RECORDINGS (${recordings.length}):`];
                    for (const r of recordings) {
                        const uptime = r.uptimeFormatted || (r.startTime ? `${Math.floor((Date.now() - new Date(r.startTime).getTime()) / 1000)}s` : '0s');
                        const status = r.isPaused ? 'PAUSED' : 'RECORDING';
                        lines.push(`- Key: ${r.key || `${r.app}/${r.stream}`} | Status: ${status} | Uptime: ${uptime} | Outputs: ${r.outputsCount || 1}`);
                    }
                    socket.write(lines.join('\r\n') + '\r\n');
                }
                break;
            }

            case 'STOP':
            case 'STOP_RECORDING': {
                if (args[0] && args[0].toUpperCase() === 'ALL') {
                    const result = await this.stopAllRecordings({ initiatedBy: { username: 'tcp-client', role: 'admin' } });
                    if (result.success) {
                        socket.write(`OK: STOPPED_ALL count=${result.stoppedCount || 0}\r\n`);
                    } else {
                        socket.write(`ERROR: ${result.error || 'Failed to stop all recordings'}\r\n`);
                    }
                    break;
                }

                let appName;
                let streamName;
                let requestedKey;

                if (args.length >= 2) {
                    appName = args[0];
                    streamName = args[1];
                } else if (args.length === 1) {
                    const arg = args[0];
                    if (arg.includes('/')) {
                        requestedKey = arg;
                        const [a, s] = arg.split('/');
                        appName = a;
                        streamName = s;
                    } else {
                        streamName = arg;
                    }
                }

                const result = await this.stopRecording({
                    appName,
                    stream: streamName,
                    key: requestedKey,
                    initiatedBy: { username: 'tcp-client', role: 'admin' }
                });

                if (result.success) {
                    socket.write(`OK: RECORDING_STOPPED key=${result.key || `${appName || 'live'}/${streamName || 'stream'}`}\r\n`);
                } else {
                    socket.write(`ERROR: ${result.error || 'Failed to stop recording'}\r\n`);
                }
                break;
            }

            case 'STOP_ALL': {
                const result = await this.stopAllRecordings({ initiatedBy: { username: 'tcp-client', role: 'admin' } });
                if (result.success) {
                    socket.write(`OK: STOPPED_ALL count=${result.stoppedCount || 0}\r\n`);
                } else {
                    socket.write(`ERROR: ${result.error || 'Failed to stop all recordings'}\r\n`);
                }
                break;
            }

            case 'START':
            case 'START_RECORDING': {
                if (args.length < 2) {
                    socket.write('ERROR: Syntax: START <app> <stream> [format]\r\n');
                    break;
                }
                const appName = args[0];
                const streamName = args[1];
                const format = args[2] || 'mp4';

                const options = {
                    formats: [format],
                    format,
                    sourceType: appName === 'device' ? 'device' : 'ingest',
                    videoDevice: appName === 'device' ? streamName : undefined,
                    continuous: true,
                };

                const result = await this.startRecording({
                    appName,
                    stream: streamName,
                    options,
                    initiatedBy: { username: 'tcp-client', role: 'admin' }
                });

                if (result.success) {
                    socket.write(`OK: RECORDING_STARTED key=${result.key || `${appName}/${streamName}`}\r\n`);
                } else {
                    socket.write(`ERROR: ${result.error || 'Failed to start recording'}\r\n`);
                }
                break;
            }

            case 'QUIT':
            case 'EXIT':
                socket.end('BYE\r\n');
                break;

            default:
                socket.write(`ERROR: Unknown command "${command}". Type HELP for available commands.\r\n`);
                break;
        }
    }

    async handleJsonCommand(payload, clientAddress) {
        const rawCmd = payload.command || payload.action || '';
        const command = String(rawCmd).toUpperCase().trim();

        if (command === 'PING') {
            return { success: true, response: 'PONG' };
        }

        if (command === 'STATUS' || command === 'LIST') {
            const recordings = typeof this.getActiveRecordings === 'function' ? this.getActiveRecordings() : [];
            return {
                success: true,
                activeCount: recordings.length,
                recordings: recordings.map(r => ({
                    key: r.key || `${r.app}/${r.stream}`,
                    app: r.app,
                    stream: r.stream,
                    startTime: r.startTime,
                    isPaused: Boolean(r.isPaused),
                    outputsCount: r.outputsCount || 1,
                }))
            };
        }

        if (command === 'STOP' || command === 'STOP_RECORDING') {
            return await this.stopRecording({
                appName: payload.app || payload.appName,
                stream: payload.stream || payload.streamName,
                key: payload.key,
                initiatedBy: { username: 'tcp-client-json', role: 'admin' }
            });
        }

        if (command === 'STOP_ALL') {
            return await this.stopAllRecordings({
                initiatedBy: { username: 'tcp-client-json', role: 'admin' }
            });
        }

        if (command === 'START' || command === 'START_RECORDING') {
            const appName = payload.app || payload.appName || 'live';
            const stream = payload.stream || payload.streamName;
            if (!stream) {
                return { success: false, error: 'stream is required to start recording' };
            }

            const format = payload.format || 'mp4';
            const options = {
                formats: payload.formats || [format],
                format,
                sourceType: payload.sourceType || (appName === 'device' ? 'device' : 'ingest'),
                videoDevice: payload.videoDevice || (appName === 'device' ? stream : undefined),
                audioDevice: payload.audioDevice,
                continuous: payload.continuous !== false,
                ...payload.options
            };

            return await this.startRecording({
                appName,
                stream,
                options,
                initiatedBy: { username: 'tcp-client-json', role: 'admin' }
            });
        }

        return {
            success: false,
            error: `Unknown command "${command}". Valid commands: START, STOP, STOP_ALL, STATUS, PING`
        };
    }
}

module.exports = { KashtrixTcpCommandServer };
