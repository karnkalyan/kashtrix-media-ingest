#!/usr/bin/env node

/**
 * Kashtrix StreamOps TCP Record Control Client
 * 
 * Usage:
 *   node scripts/record-client.cjs stop [app] [stream]
 *   node scripts/record-client.cjs stop-all
 *   node scripts/record-client.cjs start <app> <stream> [format]
 *   node scripts/record-client.cjs status
 *   node scripts/record-client.cjs ping
 *   node scripts/record-client.cjs help
 */

const net = require('net');

const HOST = process.env.TCP_HOST || '127.0.0.1';
const PORT = Number(process.env.TCP_CONTROL_PORT || 9999);
const TIMEOUT_MS = 10000;

const rawArgs = process.argv.slice(2);
const command = (rawArgs[0] || 'status').toLowerCase();
const subArgs = rawArgs.slice(1);

let commandString = '';

switch (command) {
    case 'stop':
    case 'stop-recording':
        if (subArgs.length >= 2) {
            commandString = `STOP ${subArgs[0]} ${subArgs[1]}`;
        } else if (subArgs.length === 1) {
            commandString = `STOP ${subArgs[0]}`;
        } else {
            commandString = 'STOP';
        }
        break;

    case 'stop-all':
    case 'stopall':
        commandString = 'STOP_ALL';
        break;

    case 'start':
    case 'start-recording':
        if (subArgs.length < 2) {
            console.error('\x1b[31m[Error] Usage: start <app> <stream> [format]\x1b[0m');
            console.error('Example: node scripts/record-client.cjs start live feed1 mp4');
            process.exit(1);
        }
        commandString = `START ${subArgs[0]} ${subArgs[1]} ${subArgs[2] || 'mp4'}`;
        break;

    case 'status':
    case 'list':
        commandString = 'STATUS';
        break;

    case 'ping':
        commandString = 'PING';
        break;

    case 'help':
    case '--help':
    case '-h':
        commandString = 'HELP';
        break;

    default:
        // Pass through raw text command
        commandString = rawArgs.join(' ');
        break;
}

console.log(`\x1b[36m[Kashtrix TCP Client]\x1b[0m Connecting to ${HOST}:${PORT}...`);

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
    socket.write(`${commandString}\r\n`);
});

let responseBuffer = '';

socket.on('data', (chunk) => {
    responseBuffer += chunk.toString('utf8');
    // If output completed
    if (responseBuffer.includes('\n')) {
        setTimeout(() => socket.end(), 100);
    }
});

socket.on('end', () => {
    const trimmed = responseBuffer.trim();
    if (trimmed.startsWith('OK:')) {
        console.log(`\x1b[32m✔ ${trimmed}\x1b[0m`);
        process.exit(0);
    } else if (trimmed.startsWith('ERROR:')) {
        console.error(`\x1b[31m✖ ${trimmed}\x1b[0m`);
        process.exit(1);
    } else {
        console.log(trimmed);
        process.exit(0);
    }
});

socket.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
        console.error(`\x1b[31m[Error] Connection refused at tcp://${HOST}:${PORT}.\x1b[0m`);
        console.error('Ensure Kashtrix StreamOps backend is running (npm run dev).');
    } else {
        console.error(`\x1b[31m[Socket Error]\x1b[0m ${err.message}`);
    }
    process.exit(1);
});

socket.setTimeout(TIMEOUT_MS, () => {
    console.error('\x1b[31m[Timeout] Server did not respond in time.\x1b[0m');
    socket.destroy();
    process.exit(1);
});
