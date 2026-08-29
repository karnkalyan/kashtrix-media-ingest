const os = require('os');

/**
 * Get all available network interface IPv4 addresses
 */
const getAvailableNetworkIps = () => {
    const interfaces = [];
    try {
        const osIfaces = os.networkInterfaces();
        for (const [name, addrs] of Object.entries(osIfaces || {})) {
            if (!Array.isArray(addrs)) continue;
            for (const addr of addrs) {
                if (addr.family === 'IPv4' || addr.family === 4) {
                    interfaces.push({
                        name,
                        address: addr.address,
                        netmask: addr.netmask,
                        mac: addr.mac,
                        internal: !!addr.internal,
                    });
                }
            }
        }
    } catch (e) {
        console.warn('[NetworkShares] Failed to read os.networkInterfaces:', e.message);
    }
    return interfaces;
};

/**
 * Determine the best primary IP to display for SMB/FTP access
 */
const resolvePrimaryIp = (req, customIp = null) => {
    if (customIp && String(customIp).trim()) {
        return String(customIp).trim();
    }

    // 1. Check client request Host header (e.g. 192.168.2.162:3005)
    if (req) {
        const hostHeader = req.headers?.host || req.hostname || '';
        const hostIpMatch = hostHeader.split(':')[0]?.trim();
        if (hostIpMatch && hostIpMatch !== 'localhost' && hostIpMatch !== '127.0.0.1' && !hostIpMatch.startsWith('172.17.') && !hostIpMatch.startsWith('172.18.')) {
            return hostIpMatch;
        }
    }

    // 2. Find physical/non-internal, non-docker network interface
    const allIps = getAvailableNetworkIps();
    const externalIps = allIps.filter(i => !i.internal && i.address !== '127.0.0.1');

    // Prefer non-docker bridge subnets if a 10.x, 192.168.x or physical exists
    const preferredIp = externalIps.find(i => !i.address.startsWith('172.17.') && !i.address.startsWith('172.18.') && !i.address.startsWith('172.19.'))
        || externalIps[0];

    return preferredIp ? preferredIp.address : (req?.hostname && req.hostname !== 'localhost' ? req.hostname : '127.0.0.1');
};

/**
 * Default network share users if none configured
 */
const DEFAULT_NETWORK_SHARE_USERS = [
    {
        id: 'nsu-media-admin',
        username: 'media_admin',
        password: 'Password123!',
        role: 'admin',
        permissions: { read: true, write: true, delete: true, update: true },
        description: 'Full Read/Write/Delete administrator access to media storage',
        enabled: true,
        createdAt: new Date().toISOString(),
    },
    {
        id: 'nsu-media-editor',
        username: 'media_editor',
        password: 'Editor123!',
        role: 'write',
        permissions: { read: true, write: true, delete: false, update: true },
        description: 'Editing workstations (Read, Write & Update files)',
        enabled: true,
        createdAt: new Date().toISOString(),
    },
    {
        id: 'nsu-media-viewer',
        username: 'media_viewer',
        password: 'Viewer123!',
        role: 'read',
        permissions: { read: true, write: false, delete: false, update: false },
        description: 'Read-only access for playout preview and file ingest review',
        enabled: true,
        createdAt: new Date().toISOString(),
    }
];

const { execSync } = require('child_process');

/**
 * Check if the Windows OS SMB share for media is currently active
 */
const checkWindowsSmbShareStatus = (mediaPath = null) => {
    const isWindows = process.platform === 'win32';
    if (!isWindows) {
        return { isWindows: false, isShared: true };
    }

    try {
        const output = execSync('net share', { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] });
        const lines = output.split('\n');
        const mediaShareActive = lines.some(line => line.trim().toLowerCase().startsWith('media '));
        const recordingsShareActive = lines.some(line => line.trim().toLowerCase().startsWith('recordings '));

        return {
            isWindows: true,
            isShared: mediaShareActive,
            mediaShareActive,
            recordingsShareActive,
            mediaPath: mediaPath || 'C:\\Kashtrix\\media',
            setupCommand: `net share media="${mediaPath || 'C:\\Kashtrix\\media'}" /grant:Everyone,FULL /unlimited`,
            recordingsSetupCommand: `net share recordings="${mediaPath ? mediaPath + '\\recordings' : 'C:\\Kashtrix\\media\\recordings'}" /grant:Everyone,FULL /unlimited`,
        };
    } catch (e) {
        return {
            isWindows: true,
            isShared: false,
            error: e.message,
            setupCommand: `net share media="${mediaPath || 'C:\\Kashtrix\\media'}" /grant:Everyone,FULL /unlimited`,
        };
    }
};

/**
 * Attempt to automatically configure Windows SMB shares
 */
const autoConfigureWindowsShare = (mediaPath) => {
    if (process.platform !== 'win32') {
        return { success: true, message: 'Non-Windows platform; Samba handled via Docker/systemd' };
    }
    const resolvedMedia = mediaPath || 'C:\\Kashtrix\\media';
    const resolvedRecordings = resolvedMedia + '\\recordings';

    try {
        execSync(`net share media="${resolvedMedia}" /grant:Everyone,FULL /unlimited`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        execSync(`net share recordings="${resolvedRecordings}" /grant:Everyone,FULL /unlimited`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return { success: true, message: 'Windows SMB shares (media & recordings) created successfully!' };
    } catch (e) {
        return {
            success: false,
            error: e.message,
            needsAdmin: true,
            setupCommand: `net share media="${resolvedMedia}" /grant:Everyone,FULL /unlimited`,
            recordingsSetupCommand: `net share recordings="${resolvedRecordings}" /grant:Everyone,FULL /unlimited`,
            scriptPath: 'scripts/setup-windows-share.bat'
        };
    }
};

/**
 * Generate full cross-platform SMB, FTP and Web sharing info
 */
const getNetworkShareInfo = (req, options = {}) => {
    const customIp = options.customIp || null;
    const authMode = options.authMode || 'anonymous'; // 'anonymous' | 'authenticated'
    const users = Array.isArray(options.users) && options.users.length > 0 ? options.users : DEFAULT_NETWORK_SHARE_USERS;
    const mediaPath = options.mediaPath || null;
    const ftpPort = options.ftpPort || 21;

    const interfaces = getAvailableNetworkIps();
    const primaryIp = resolvePrimaryIp(req, customIp);
    const port = req?.socket?.localPort || process.env.PORT || 3005;

    const activeUser = users.find(u => u.enabled) || users[0] || { username: 'media_admin', password: 'Password123!' };
    const isAuth = authMode === 'authenticated';
    const windowsStatus = checkWindowsSmbShareStatus(mediaPath);
    const ftpUrl = ftpPort === 21 ? `ftp://${primaryIp}/media` : `ftp://${primaryIp}:${ftpPort}/media`;

    return {
        success: true,
        primaryIp,
        interfaces,
        authMode, // 'anonymous' | 'authenticated'
        customIp,
        users,
        windowsStatus,
        smb: {
            parentPath: `\\\\${primaryIp}\\media`,
            recordingsPath: `\\\\${primaryIp}\\recordings`,
            macUrl: `smb://${primaryIp}/media`,
            linuxMount: `mount -t cifs //${primaryIp}/media /mnt/media -o username=${isAuth ? activeUser.username : 'guest'},password=${isAuth ? '******' : ''}`,
            shareName: 'media',
            recordingsShareName: 'recordings',
            description: 'Universal Cross-Platform Network File Share (SMB / CIFS)',
            anonymous: !isAuth,
            authRequired: isAuth,
            isShared: windowsStatus.isShared,
            activeUser: isAuth ? { username: activeUser.username, role: activeUser.role, permissions: activeUser.permissions } : null,
            instructions: isAuth
                ? `Connect to \\\\${primaryIp}\\media using Network Share username and password.`
                : `Connect to \\\\${primaryIp}\\media directly (Anonymous / Guest access enabled).`
        },
        ftp: {
            url: ftpUrl,
            rootUrl: ftpPort === 21 ? `ftp://${primaryIp}/` : `ftp://${primaryIp}:${ftpPort}/`,
            port: ftpPort,
            anonymous: !isAuth,
            authRequired: isAuth,
            username: isAuth ? activeUser.username : 'anonymous',
            password: isAuth ? '******' : '',
            instructions: isAuth
                ? `Connect to ${ftpUrl} using assigned Network Share credentials.`
                : `Connect to ${ftpUrl} with anonymous login (no password required).`
        },
        http: {
            url: `http://${primaryIp}:${port}/media/recordings`,
            parentUrl: `http://${primaryIp}:${port}/media`,
            port,
            description: 'Direct HTTP Web Access'
        },
        credentials: {
            mode: isAuth ? 'User Authentication Required' : 'Anonymous / Guest Access',
            username: isAuth ? `${users.length} configured users (e.g. ${activeUser.username})` : 'None (Guest / Anonymous)',
            password: isAuth ? 'Configured per network share user' : 'None (No password required)',
            permissions: isAuth ? 'Configured per user role (Read, Write, Delete, Update)' : 'Full Read & Write Access'
        }
    };
};

const http = require('http');
const fs = require('fs');

/**
 * Perform a Docker Engine API request over /var/run/docker.sock
 */
const dockerApiRequest = (urlPath, method = 'GET', postData = null) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync('/var/run/docker.sock')) {
            return reject(new Error('docker.sock not present'));
        }
        const payload = postData ? JSON.stringify(postData) : null;
        const options = {
            socketPath: '/var/run/docker.sock',
            path: urlPath,
            method,
            headers: {
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
            timeout: 5000,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve(parsed);
                } catch (_) {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Docker socket timeout')); });
        if (payload) req.write(payload);
        req.end();
    });
};

/**
 * Sync a user and password to the Samba service (Docker container, Linux smbpasswd, or Windows local accounts)
 */
const syncSambaUser = async (username, password) => {
    const isWindows = process.platform === 'win32';
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();
    if (!cleanUser) return { success: false, error: 'Username is required' };

    const actions = [];

    // Strategy 1: Windows Host (Local Accounts)
    if (isWindows) {
        try {
            try {
                execSync(`net user ${cleanUser} "${cleanPass}" /add`, { stdio: ['ignore', 'pipe', 'pipe'] });
                actions.push('Created Windows local user account');
            } catch (errAdd) {
                execSync(`net user ${cleanUser} "${cleanPass}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
                actions.push('Updated Windows local user password');
            }
            return { success: true, user: cleanUser, actions };
        } catch (e) {
            return { success: false, user: cleanUser, error: e.message, actions };
        }
    }

    // Strategy 2: Docker Socket API (communicates with running Samba container)
    try {
        const containers = await dockerApiRequest('/containers/json');
        if (Array.isArray(containers)) {
            const sambaContainer = containers.find(c =>
                (c.Names || []).some(n => n.includes('samba')) || (c.Image || '').includes('samba')
            );
            if (sambaContainer) {
                // 1. Create Linux user inside container
                const execUser = await dockerApiRequest(`/containers/${sambaContainer.Id}/exec`, 'POST', {
                    Cmd: ['sh', '-c', `useradd -M -s /sbin/nologin ${cleanUser} 2>/dev/null || true`],
                });
                if (execUser?.Id) {
                    await dockerApiRequest(`/exec/${execUser.Id}/start`, 'POST', { Detach: false });
                }

                // 2. Set Samba password inside container via smbpasswd
                const execPass = await dockerApiRequest(`/containers/${sambaContainer.Id}/exec`, 'POST', {
                    Cmd: ['sh', '-c', `printf "${cleanPass}\\n${cleanPass}\\n" | smbpasswd -a -s ${cleanUser} && smbpasswd -e ${cleanUser}`],
                });
                if (execPass?.Id) {
                    await dockerApiRequest(`/exec/${execPass.Id}/start`, 'POST', { Detach: false });
                }

                actions.push(`Synchronized user to Docker Samba container (${sambaContainer.Id.slice(0, 12)})`);
                return { success: true, user: cleanUser, actions };
            }
        }
    } catch (_) {}

    // Strategy 3: Docker CLI (if docker command is accessible)
    try {
        const containerId = execSync("docker ps --filter 'name=samba' --format '{{.ID}}'", { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0]?.trim();
        if (containerId) {
            try {
                execSync(`docker exec ${containerId} useradd -M -s /sbin/nologin ${cleanUser}`, { stdio: ['ignore', 'ignore', 'ignore'] });
            } catch (_) {}
            execSync(`docker exec -i ${containerId} sh -c 'printf "${cleanPass}\\n${cleanPass}\\n" | smbpasswd -a -s ${cleanUser} && smbpasswd -e ${cleanUser}'`, { stdio: ['ignore', 'pipe', 'pipe'] });
            actions.push(`Synchronized to Samba Docker container via CLI (${containerId.slice(0, 12)})`);
            return { success: true, user: cleanUser, actions };
        }
    } catch (_) {}

    // Strategy 4: Host Linux smbpasswd (if Samba is installed natively on the host OS)
    try {
        try {
            execSync(`useradd -M -s /usr/sbin/nologin ${cleanUser} 2>/dev/null`, { stdio: ['ignore', 'ignore', 'ignore'] });
        } catch (_) {}
        execSync(`sh -c 'printf "${cleanPass}\\n${cleanPass}\\n" | smbpasswd -a -s ${cleanUser} && smbpasswd -e ${cleanUser}'`, { stdio: ['ignore', 'pipe', 'pipe'] });
        actions.push('Synchronized to Linux host native Samba');
        return { success: true, user: cleanUser, actions };
    } catch (_) {}

    return {
        success: true,
        user: cleanUser,
        notice: 'User saved in database. Restart the Samba container to load if running without Docker socket access.',
        actions
    };
};

/**
 * Sync all network share users to Samba
 */
const syncAllSambaUsers = async (users = []) => {
    const results = [];
    for (const u of users) {
        if (u.username && u.password && u.enabled !== false) {
            const res = await syncSambaUser(u.username, u.password);
            results.push(res);
        }
    }
    return results;
};

module.exports = {
    getAvailableNetworkIps,
    resolvePrimaryIp,
    DEFAULT_NETWORK_SHARE_USERS,
    checkWindowsSmbShareStatus,
    autoConfigureWindowsShare,
    getNetworkShareInfo,
    syncSambaUser,
    syncAllSambaUsers,
};
