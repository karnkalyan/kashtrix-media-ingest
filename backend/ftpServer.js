const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FTP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatFtpLsDate(date) {
    const d = new Date(date);
    const now = new Date();
    const mon = FTP_MONTHS[d.getMonth()];
    const day = String(d.getDate()).padStart(2, ' ');
    const diff = Math.abs(now.getTime() - d.getTime());
    const sixMonths = 180 * 24 * 60 * 60 * 1000;
    if (diff > sixMonths) {
        return `${mon} ${day}  ${d.getFullYear()}`;
    }
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${mon} ${day} ${hours}:${mins}`;
}

function formatFactDate(date) {
    const d = new Date(date);
    const YYYY = d.getUTCFullYear();
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
}

/**
 * Built-in Lightweight FTP Server for Kashtrix StreamOps
 * Compliant with RFC 959 (PASV, EPSV, LIST, RETR, STOR, DELE, RNFR, RNTO, MKD, etc.)
 */
class KashtrixFtpServer {
    constructor(mediaRoot, options = {}) {
        this.mediaRoot = mediaRoot || path.join(process.cwd(), 'media');
        this.port = options.port || 21;
        this.fallbackPort = options.fallbackPort || 2121;
        this.getAuthSettings = options.getAuthSettings || (() => ({ authMode: 'anonymous', users: [] }));
        this.server = null;
        this.activePort = null;
        this.isRunning = false;
        this.connections = new Set();
    }

    start() {
        return new Promise((resolve) => {
            if (!fs.existsSync(this.mediaRoot)) {
                try {
                    fs.mkdirSync(this.mediaRoot, { recursive: true });
                } catch (e) {
                    console.warn('[FTP] Failed to create media directory:', e.message);
                }
            }

            const tryBind = (portToTry, isFallback = false) => {
                const s = net.createServer((socket) => this.handleClient(socket));
                
                s.on('error', (err) => {
                    console.warn(`[FTP] Failed to bind to port ${portToTry}:`, err.message);
                    if (!isFallback && (err.code === 'EACCES' || err.code === 'EADDRINUSE')) {
                        console.log(`[FTP] Attempting fallback to port ${this.fallbackPort}...`);
                        tryBind(this.fallbackPort, true);
                    } else {
                        this.isRunning = false;
                        resolve(false);
                    }
                });

                s.listen(portToTry, '0.0.0.0', () => {
                    this.server = s;
                    this.activePort = portToTry;
                    this.isRunning = true;
                    console.log(`[FTP] Kashtrix Embedded FTP Server listening on 0.0.0.0:${portToTry} (Serving: ${this.mediaRoot})`);
                    resolve(true);
                });
            };

            tryBind(this.port, false);
        });
    }

    async stop() {
        if (this.server) {
            for (const socket of this.connections) {
                try { socket.destroy(); } catch (_) {}
            }
            this.connections.clear();
            await new Promise((resolve) => this.server.close(resolve));
            this.isRunning = false;
            this.server = null;
            console.log('[FTP] Embedded FTP Server stopped.');
        }
    }

    getStatus() {
        return {
            running: this.isRunning,
            port: this.activePort || this.port,
            mediaRoot: this.mediaRoot,
        };
    }

    handleClient(socket) {
        this.connections.add(socket);
        socket.setEncoding('utf8');

        const session = {
            authenticated: false,
            username: '',
            user: null,
            cwd: '/',
            type: 'A', // A=ASCII, I=Binary
            pasvServer: null,
            pasvSocket: null,
            renameFrom: null,
        };

        const send = (code, message) => {
            if (socket.writable) {
                socket.write(`${code} ${message}\r\n`);
            }
        };

        const resolveLocalPath = (virtualPath) => {
            const normalized = path.normalize(path.join('/', virtualPath)).replace(/^(\.\.[\/\\])+/, '');
            return path.join(this.mediaRoot, normalized);
        };

        const checkPermission = (action) => {
            const { authMode } = this.getAuthSettings();
            if (authMode !== 'authenticated') return true; // Anonymous has full access

            if (!session.authenticated || !session.user) return false;
            const perms = session.user.permissions || {};
            if (session.user.role === 'admin') return true;
            return !!perms[action];
        };

        socket.on('close', () => {
            if (session.pasvServer) {
                try { session.pasvServer.close(); } catch (_) {}
            }
            this.connections.delete(socket);
        });

        socket.on('error', () => {
            this.connections.delete(socket);
        });

        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk;
            let lineEnd;
            while ((lineEnd = buffer.indexOf('\r\n')) !== -1 || (lineEnd = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, lineEnd).trim();
                const delimLength = buffer[lineEnd] === '\r' ? 2 : 1;
                buffer = buffer.substring(lineEnd + delimLength);
                if (line) {
                    this.processCommand(line, session, socket, send, resolveLocalPath, checkPermission);
                }
            }
        });

        // Welcome banner
        send(220, 'Kashtrix StreamOps Enterprise FTP Server ready.');
    }

    processCommand(line, session, socket, send, resolveLocalPath, checkPermission) {
        const parts = line.split(' ');
        const cmd = parts[0].toUpperCase();
        const arg = parts.slice(1).join(' ').trim();

        switch (cmd) {
            case 'USER': {
                session.username = arg;
                const { authMode, users } = this.getAuthSettings();
                if (authMode !== 'authenticated') {
                    send(331, `User ${arg} OK. Password required or press Enter.`);
                } else {
                    const match = (users || []).find(u => u.username.toLowerCase() === arg.toLowerCase() && u.enabled !== false);
                    if (match) {
                        session.user = match;
                        send(331, `User ${arg} OK. Password required.`);
                    } else {
                        send(331, `User ${arg} OK. Password required.`);
                    }
                }
                break;
            }

            case 'PASS': {
                const { authMode, users } = this.getAuthSettings();
                if (authMode !== 'authenticated') {
                    session.authenticated = true;
                    send(230, 'Guest/Anonymous login OK, access restrictions apply.');
                } else {
                    const match = (users || []).find(u => u.username.toLowerCase() === (session.username || '').toLowerCase() && u.enabled !== false);
                    if (match && (match.password === arg || !match.password)) {
                        session.authenticated = true;
                        session.user = match;
                        send(230, `User ${match.username} logged in successfully.`);
                    } else {
                        session.authenticated = false;
                        session.user = null;
                        send(530, 'Login incorrect or account disabled.');
                    }
                }
                break;
            }

            case 'SYST':
                send(215, 'UNIX Type: L8 (Kashtrix StreamOps)');
                break;

            case 'FEAT':
                socket.write('211-Features supported:\r\n PASV\r\n EPSV\r\n UTF8\r\n SIZE\r\n MDTM\r\n MLSD\r\n MLST type*;size*;modify*;\r\n211 End\r\n');
                break;

            case 'OPTS':
                if (arg.toUpperCase().startsWith('UTF8')) {
                    send(200, 'Always in UTF8 mode.');
                } else {
                    send(200, 'OK');
                }
                break;

            case 'PWD':
            case 'XPWD':
                send(257, `"${session.cwd}" is current directory.`);
                break;

            case 'TYPE':
                if (arg.toUpperCase() === 'A' || arg.toUpperCase() === 'I') {
                    session.type = arg.toUpperCase();
                    send(200, `Type set to ${session.type}.`);
                } else {
                    send(504, 'Command not implemented for that parameter.');
                }
                break;

            case 'CWD':
            case 'XCWD': {
                let target = arg;
                if (!target.startsWith('/')) {
                    target = path.posix.join(session.cwd, target);
                }
                target = path.posix.normalize(target);
                const local = resolveLocalPath(target);
                if (fs.existsSync(local) && fs.statSync(local).isDirectory()) {
                    session.cwd = target;
                    send(250, `Directory successfully changed to ${session.cwd}`);
                } else {
                    send(550, `Failed to change directory: ${arg}`);
                }
                break;
            }

            case 'CDUP':
            case 'XCUP': {
                session.cwd = path.posix.dirname(session.cwd);
                if (!session.cwd.startsWith('/')) session.cwd = '/';
                send(250, `Directory changed to ${session.cwd}`);
                break;
            }

            case 'PASV': {
                if (session.pasvServer) {
                    try { session.pasvServer.close(); } catch (_) {}
                }

                session.pasvServer = net.createServer((dataSocket) => {
                    session.pasvSocket = dataSocket;
                });

                session.pasvServer.listen(0, '0.0.0.0', () => {
                    const port = session.pasvServer.address().port;
                    const p1 = Math.floor(port / 256);
                    const p2 = port % 256;
                    
                    let hostIp = socket.localAddress || '127.0.0.1';
                    if (hostIp === '::ffff:127.0.0.1' || hostIp === '::1') hostIp = '127.0.0.1';
                    if (hostIp.startsWith('::ffff:')) hostIp = hostIp.replace('::ffff:', '');
                    
                    const ipParts = hostIp.split('.');
                    if (ipParts.length !== 4) {
                        hostIp = '127.0.0.1';
                    }
                    const ipFormatted = hostIp.replace(/\./g, ',');

                    send(227, `Entering Passive Mode (${ipFormatted},${p1},${p2})`);
                });
                break;
            }

            case 'EPSV': {
                if (session.pasvServer) {
                    try { session.pasvServer.close(); } catch (_) {}
                }

                session.pasvServer = net.createServer((dataSocket) => {
                    session.pasvSocket = dataSocket;
                });

                session.pasvServer.listen(0, '0.0.0.0', () => {
                    const port = session.pasvServer.address().port;
                    send(229, `Entering Extended Passive Mode (|||${port}|)`);
                });
                break;
            }

            case 'LIST':
            case 'NLST': {
                if (!checkPermission('read')) {
                    send(550, 'Permission denied: Read access required.');
                    break;
                }

                let targetDir = session.cwd;
                if (arg && !arg.startsWith('-')) {
                    targetDir = arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg);
                }
                const localDir = resolveLocalPath(targetDir);

                const sendList = (dataSocket) => {
                    try {
                        if (!fs.existsSync(localDir)) {
                            dataSocket.end();
                            send(550, 'Directory not found.');
                            return;
                        }

                        const files = fs.readdirSync(localDir);
                        let listing = '';
                        for (const file of files) {
                            try {
                                const filePath = path.join(localDir, file);
                                const stat = fs.statSync(filePath);
                                if (cmd === 'NLST') {
                                    listing += `${file}\r\n`;
                                } else {
                                    const isDir = stat.isDirectory();
                                    const mode = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
                                    const size = stat.size.toString().padStart(12, ' ');
                                    const dateStr = formatFtpLsDate(stat.mtime);
                                    listing += `${mode} 1 owner group ${size} ${dateStr} ${file}\r\n`;
                                }
                            } catch (_) {}
                        }

                        dataSocket.write(listing, () => {
                            dataSocket.end();
                            send(226, 'Directory send OK.');
                        });
                    } catch (e) {
                        dataSocket.end();
                        send(550, `Error reading directory: ${e.message}`);
                    }
                };

                send(150, `Here comes the directory listing.`);
                if (session.pasvSocket) {
                    sendList(session.pasvSocket);
                    session.pasvSocket = null;
                } else if (session.pasvServer) {
                    session.pasvServer.once('connection', (ds) => {
                        sendList(ds);
                    });
                } else {
                    send(425, 'Use PASV first.');
                }
                break;
            }

            case 'MLSD': {
                if (!checkPermission('read')) {
                    send(550, 'Permission denied: Read access required.');
                    break;
                }

                let targetDir = session.cwd;
                if (arg && !arg.startsWith('-')) {
                    targetDir = arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg);
                }
                const localDir = resolveLocalPath(targetDir);

                const sendMlsd = (dataSocket) => {
                    try {
                        if (!fs.existsSync(localDir)) {
                            dataSocket.end();
                            send(550, 'Directory not found.');
                            return;
                        }

                        const files = fs.readdirSync(localDir);
                        let listing = '';
                        for (const file of files) {
                            try {
                                const filePath = path.join(localDir, file);
                                const stat = fs.statSync(filePath);
                                const isDir = stat.isDirectory();
                                const type = isDir ? 'dir' : 'file';
                                const modDate = formatFactDate(stat.mtime);
                                listing += `type=${type};modify=${modDate};size=${stat.size}; ${file}\r\n`;
                            } catch (_) {}
                        }

                        dataSocket.write(listing, () => {
                            dataSocket.end();
                            send(226, 'MLSD listing send OK.');
                        });
                    } catch (e) {
                        dataSocket.end();
                        send(550, `Error reading directory: ${e.message}`);
                    }
                };

                send(150, 'Opening BINARY mode data connection for MLSD listing.');
                if (session.pasvSocket) {
                    sendMlsd(session.pasvSocket);
                    session.pasvSocket = null;
                } else if (session.pasvServer) {
                    session.pasvServer.once('connection', (ds) => {
                        sendMlsd(ds);
                    });
                } else {
                    send(425, 'Use PASV first.');
                }
                break;
            }

            case 'MLST': {
                const target = arg ? (arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg)) : session.cwd;
                const localPath = resolveLocalPath(target);
                try {
                    if (fs.existsSync(localPath)) {
                        const stat = fs.statSync(localPath);
                        const isDir = stat.isDirectory();
                        const type = isDir ? 'dir' : 'file';
                        const modDate = formatFactDate(stat.mtime);
                        const baseName = path.basename(localPath) || target;
                        send(250, `- Listing ${target}\r\n type=${type};modify=${modDate};size=${stat.size}; ${baseName}\r\n250 End`);
                    } else {
                        send(550, 'File or directory not found.');
                    }
                } catch (e) {
                    send(550, `MLST error: ${e.message}`);
                }
                break;
            }

            case 'RETR': {
                if (!checkPermission('read')) {
                    send(550, 'Permission denied: Read access required.');
                    break;
                }

                const filePath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                    send(550, 'File not found or is a directory.');
                    break;
                }

                const sendFile = (dataSocket) => {
                    const readStream = fs.createReadStream(filePath);
                    readStream.on('error', (err) => {
                        dataSocket.destroy();
                        send(550, `Failed to read file: ${err.message}`);
                    });
                    readStream.pipe(dataSocket);
                    readStream.on('end', () => {
                        send(226, 'Transfer complete.');
                    });
                };

                send(150, `Opening BINARY mode data connection for ${arg} (${fs.statSync(filePath).size} bytes).`);
                if (session.pasvSocket) {
                    sendFile(session.pasvSocket);
                    session.pasvSocket = null;
                } else if (session.pasvServer) {
                    session.pasvServer.once('connection', (ds) => {
                        sendFile(ds);
                    });
                } else {
                    send(425, 'Use PASV first.');
                }
                break;
            }

            case 'STOR': {
                if (!checkPermission('write')) {
                    send(550, 'Permission denied: Write access required.');
                    break;
                }

                const filePath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                const receiveFile = (dataSocket) => {
                    const writeStream = fs.createWriteStream(filePath);
                    writeStream.on('error', (err) => {
                        dataSocket.destroy();
                        send(550, `Failed to write file: ${err.message}`);
                    });
                    dataSocket.pipe(writeStream);
                    dataSocket.on('end', () => {
                        send(226, 'Transfer complete.');
                    });
                };

                send(150, `Opening BINARY mode data connection for ${arg}.`);
                if (session.pasvSocket) {
                    receiveFile(session.pasvSocket);
                    session.pasvSocket = null;
                } else if (session.pasvServer) {
                    session.pasvServer.once('connection', (ds) => {
                        receiveFile(ds);
                    });
                } else {
                    send(425, 'Use PASV first.');
                }
                break;
            }

            case 'DELE': {
                if (!checkPermission('delete')) {
                    send(550, 'Permission denied: Delete access required.');
                    break;
                }
                const filePath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        send(250, 'Delete operation successful.');
                    } else {
                        send(550, 'File not found.');
                    }
                } catch (e) {
                    send(550, `Delete failed: ${e.message}`);
                }
                break;
            }

            case 'MKD':
            case 'XMKD': {
                if (!checkPermission('write')) {
                    send(550, 'Permission denied: Write access required.');
                    break;
                }
                const dirPath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                try {
                    fs.mkdirSync(dirPath, { recursive: true });
                    send(257, `"${arg}" directory created.`);
                } catch (e) {
                    send(550, `Create directory failed: ${e.message}`);
                }
                break;
            }

            case 'RMD':
            case 'XRMD': {
                if (!checkPermission('delete')) {
                    send(550, 'Permission denied: Delete access required.');
                    break;
                }
                const dirPath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                try {
                    fs.rmdirSync(dirPath);
                    send(250, 'Remove directory operation successful.');
                } catch (e) {
                    send(550, `Remove directory failed: ${e.message}`);
                }
                break;
            }

            case 'RNFR': {
                if (!checkPermission('update')) {
                    send(550, 'Permission denied: Update/Rename access required.');
                    break;
                }
                session.renameFrom = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                if (fs.existsSync(session.renameFrom)) {
                    send(350, 'File exists, ready for destination name.');
                } else {
                    send(550, 'File not found.');
                }
                break;
            }

            case 'RNTO': {
                if (!checkPermission('update') || !session.renameFrom) {
                    send(503, 'Bad sequence of commands or permission denied.');
                    break;
                }
                const renameTo = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                try {
                    fs.renameSync(session.renameFrom, renameTo);
                    session.renameFrom = null;
                    send(250, 'File renamed successfully.');
                } catch (e) {
                    send(550, `Rename failed: ${e.message}`);
                }
                break;
            }

            case 'SIZE': {
                const filePath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                try {
                    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
                        send(213, `${fs.statSync(filePath).size}`);
                    } else {
                        send(550, 'Could not get file size.');
                    }
                } catch (_) {
                    send(550, 'Could not get file size.');
                }
                break;
            }

            case 'MDTM': {
                const filePath = resolveLocalPath(arg.startsWith('/') ? arg : path.posix.join(session.cwd, arg));
                try {
                    if (fs.existsSync(filePath)) {
                        const stat = fs.statSync(filePath);
                        const d = new Date(stat.mtime);
                        const YYYY = d.getUTCFullYear();
                        const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
                        const DD = String(d.getUTCDate()).padStart(2, '0');
                        const hh = String(d.getUTCHours()).padStart(2, '0');
                        const mm = String(d.getUTCMinutes()).padStart(2, '0');
                        const ss = String(d.getUTCSeconds()).padStart(2, '0');
                        send(213, `${YYYY}${MM}${DD}${hh}${mm}${ss}`);
                    } else {
                        send(550, 'File not found.');
                    }
                } catch (_) {
                    send(550, 'File not found.');
                }
                break;
            }

            case 'QUIT':
                send(221, 'Goodbye.');
                socket.end();
                break;

            case 'NOOP':
                send(200, 'OK');
                break;

            default:
                send(502, `Command '${cmd}' not implemented.`);
                break;
        }
    }
}

module.exports = { KashtrixFtpServer };
