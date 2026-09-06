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

    cleanCommandLine(raw) {
        if (!raw) return '';
        let str = String(raw).trim();
        // Remove null bytes, non-printable control chars, and ASCII controls except standard spaces
        str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        // Remove UTF-8 BOM
        if (str.charCodeAt(0) === 0xFEFF) {
            str = str.slice(1);
        }
        str = str.trim();
        // Remove surrounding single or double quotes (common in automation text fields)
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
            str = str.slice(1, -1).trim();
        }
        // Remove trailing semicolon e.g. STOP_ALL;
        if (str.endsWith(';')) {
            str = str.slice(0, -1).trim();
        }
        // If formatted as key-value e.g. cmd=STOP_ALL, command=STOP_ALL, action=STOP_ALL
        const kvMatch = str.match(/^(?:cmd|command|action)\s*[:=]\s*(.+)$/i);
        if (kvMatch) {
            str = kvMatch[1].trim();
        }
        return str;
    }

    handleClient(socket) {
        this.connections.add(socket);
        const clientAddress = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || '0'}`;
        this.logger.log(`[TCP Command Server] Client connected from ${clientAddress}`);

        let buffer = '';
        let flushTimeout = null;

        const executeCommandString = async (rawInput) => {
            const clean = this.cleanCommandLine(rawInput);
            if (!clean) return;
            this.logger.log(`[TCP Command Server] [${clientAddress}] Processing command: "${clean}"`);
            try {
                await this.processCommand(socket, clean, clientAddress);
            } catch (err) {
                this.logger.error(`[TCP Command Server] [${clientAddress}] Execution error:`, err.message);
                if (!socket.destroyed) {
                    try { socket.write(`ERROR: Internal error: ${err.message}\r\n`); } catch (_) {}
                }
            }
        };

        const processDelimitedLines = async () => {
            // Support multiple delimiters: \r\n, \n, \r, \0, ;
            let match;
            while ((match = buffer.match(/[\r\n\0;]/))) {
                const delimIndex = match.index;
                const line = buffer.slice(0, delimIndex);
                let nextIndex = delimIndex + 1;
                // Treat CRLF as a single delimiter
                if (buffer[delimIndex] === '\r' && buffer[nextIndex] === '\n') {
                    nextIndex++;
                }
                buffer = buffer.slice(nextIndex);
                if (line.trim().length > 0) {
                    await executeCommandString(line);
                }
            }
        };

        const flushRemainingBuffer = async (reason = 'flush') => {
            if (flushTimeout) {
                clearTimeout(flushTimeout);
                flushTimeout = null;
            }
            if (buffer.trim().length > 0) {
                const remaining = buffer;
                buffer = '';
                this.logger.log(`[TCP Command Server] [${clientAddress}] ${reason}: "${remaining.trim()}"`);
                await executeCommandString(remaining);
            }
        };

        socket.on('data', async (chunk) => {
            const rawChunk = chunk.toString('utf8');
            this.logger.log(`[TCP Command Server] [${clientAddress}] Raw data (${chunk.length} bytes): ${JSON.stringify(rawChunk)}`);
            buffer += rawChunk;

            if (flushTimeout) {
                clearTimeout(flushTimeout);
                flushTimeout = null;
            }

            await processDelimitedLines();

            // If client sends command without a trailing newline (e.g. Easy OnAIR, EMS Playout, vMix TCP),
            // wait 50ms for any more chunks, then automatically execute whatever is in the buffer!
            if (buffer.trim().length > 0) {
                flushTimeout = setTimeout(async () => {
                    flushTimeout = null;
                    await flushRemainingBuffer('Inactivity auto-flush');
                }, 50);
            }
        });

        socket.on('end', async () => {
            await flushRemainingBuffer('Disconnect auto-flush (end)');
        });

        socket.on('close', async () => {
            await flushRemainingBuffer('Disconnect auto-flush (close)');
            this.connections.delete(socket);
            this.logger.log(`[TCP Command Server] Client disconnected from ${clientAddress}`);
        });

        socket.on('error', (err) => {
            const isBenign = err.code === 'ECONNRESET' || err.code === 'EPIPE' || (err.message && err.message.includes('ended by the other party'));
            if (!isBenign) {
                this.logger.warn(`[TCP Command Server] Socket error (${clientAddress}):`, err.message);
            }
        });
    }

    async processCommand(socket, rawLine, clientAddress) {
        const line = this.cleanCommandLine(rawLine);
        if (!line) return;

        // Check for JSON command payload
        if (line.startsWith('{') && line.endsWith('}')) {
            try {
                const payload = JSON.parse(line);
                const result = await this.handleJsonCommand(payload, clientAddress);
                if (!socket.destroyed) {
                    try { socket.write(JSON.stringify(result) + '\n'); } catch (_) {}
                }
                return;
            } catch (jsonErr) {
                if (!socket.destroyed) {
                    try { socket.write(JSON.stringify({ success: false, error: `Invalid JSON: ${jsonErr.message}` }) + '\n'); } catch (_) {}
                }
                return;
            }
        }

        // Normalize compound command aliases (e.g. STOP ALL, STOPALL, STOP-ALL, STOP RECORDING)
        let normalizedLine = line;
        const upperLine = line.toUpperCase();
        if (upperLine === 'STOP ALL' || upperLine === 'STOP-ALL' || upperLine === 'STOPALL') {
            normalizedLine = 'STOP_ALL';
        } else if (upperLine.startsWith('STOP RECORDING')) {
            normalizedLine = line.replace(/STOP\s+RECORDING/i, 'STOP');
        } else if (upperLine.startsWith('START RECORDING')) {
            normalizedLine = line.replace(/START\s+RECORDING/i, 'START');
        }

        const parts = normalizedLine.split(/\s+/);
        const command = parts[0].toUpperCase();
        const args = parts.slice(1);

        switch (command) {
            case 'PING':
                this.safeWrite(socket, 'PONG\r\n');
                break;

            case 'HELP':
                this.safeWrite(socket, [
                    '--- KASHTRIX STREAMOPS TCP CONTROL PROTOCOL ---',
                    'Commands:',
                    '  STOP [app] [stream]               - Stop recording (or single active recording)',
                    '  STOP_ALL (or STOP ALL)            - Stop all active recordings',
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
                    this.safeWrite(socket, 'NO_ACTIVE_RECORDINGS\r\n');
                } else {
                    const lines = [`ACTIVE RECORDINGS (${recordings.length}):`];
                    for (const r of recordings) {
                        const uptime = r.uptimeFormatted || (r.startTime ? `${Math.floor((Date.now() - new Date(r.startTime).getTime()) / 1000)}s` : '0s');
                        const status = r.isPaused ? 'PAUSED' : 'RECORDING';
                        lines.push(`- Key: ${r.key || `${r.app}/${r.stream}`} | Status: ${status} | Uptime: ${uptime} | Outputs: ${r.outputsCount || 1}`);
                    }
                    this.safeWrite(socket, lines.join('\r\n') + '\r\n');
                }
                break;
            }

            case 'STOP': {
                // Check if user specified "STOP ALL"
                if (args[0] && args[0].toUpperCase() === 'ALL') {
                    await this.handleStopAll(socket);
                    break;
                }

                // If no arguments given, check active recordings
                if (args.length === 0) {
                    const active = typeof this.getActiveRecordings === 'function' ? this.getActiveRecordings() : [];
                    // If multiple recordings active and bare STOP sent, stop all of them
                    if (active.length > 1) {
                        await this.handleStopAll(socket);
                        break;
                    }
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
                    const keyStr = result.key || `${appName || 'live'}/${streamName || 'stream'}`;
                    const resp = `OK: RECORDING_STOPPED key=${keyStr}\r\n`;
                    this.logger.log(`[TCP Command Server] ${resp.trim()}`);
                    this.safeWrite(socket, resp);
                } else {
                    const resp = `ERROR: ${result.error || 'Failed to stop recording'}\r\n`;
                    this.logger.log(`[TCP Command Server] ${resp.trim()}`);
                    this.safeWrite(socket, resp);
                }
                break;
            }

            case 'STOP_ALL': {
                await this.handleStopAll(socket);
                break;
            }

            case 'START': {
                if (args.length < 2) {
                    this.safeWrite(socket, 'ERROR: Syntax: START <app> <stream> [format]\r\n');
                    break;
                }
                const appName = args[0].toLowerCase();
                const streamName = args[1];
                const format = (args[2] || 'mp4').toLowerCase();

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
                    const resp = `OK: RECORDING_STARTED key=${result.key || `${appName}/${streamName}`}\r\n`;
                    this.logger.log(`[TCP Command Server] ${resp.trim()}`);
                    this.safeWrite(socket, resp);
                } else {
                    const resp = `ERROR: ${result.error || 'Failed to start recording'}\r\n`;
                    this.logger.log(`[TCP Command Server] ${resp.trim()}`);
                    this.safeWrite(socket, resp);
                }
                break;
            }

            case 'QUIT':
            case 'EXIT':
                if (!socket.destroyed) {
                    try { socket.end('BYE\r\n'); } catch (_) {}
                }
                break;

            default:
                this.safeWrite(socket, `ERROR: Unknown command "${command}". Type HELP for available commands.\r\n`);
                break;
        }
    }

    async handleStopAll(socket) {
        const result = await this.stopAllRecordings({ initiatedBy: { username: 'tcp-client', role: 'admin' } });
        const count = result.stoppedCount || 0;
        let resp;
        if (result.success) {
            resp = `OK: STOPPED_ALL count=${count}${count === 0 ? ' (No active recordings)' : ''}\r\n`;
        } else {
            resp = `ERROR: ${result.error || result.message || 'Failed to stop all recordings'}\r\n`;
        }
        this.logger.log(`[TCP Command Server] ${resp.trim()}`);
        this.safeWrite(socket, resp);
    }

    safeWrite(socket, data) {
        if (!socket || socket.destroyed || !socket.writable) return;
        try {
            socket.write(data);
        } catch (_) {}
    }

    async handleJsonCommand(payload, clientAddress) {
        const rawCmd = payload.command || payload.action || '';
        let command = String(rawCmd).toUpperCase().trim();
        if (command === 'STOP ALL' || command === 'STOPALL') command = 'STOP_ALL';
        if (command.startsWith('STOP RECORDING')) command = 'STOP';
        if (command.startsWith('START RECORDING')) command = 'START';

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

        if (command === 'STOP') {
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

        if (command === 'START') {
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
