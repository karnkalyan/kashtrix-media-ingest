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

    // 1. Check client request Host header (e.g. 10.1.2.56:3000 or 192.168.2.162:3005)
    if (req) {
        const hostHeader = req.headers?.host || '';
        const hostIpMatch = hostHeader.split(':')[0]?.trim();
        if (hostIpMatch && hostIpMatch !== 'localhost' && hostIpMatch !== '127.0.0.1' && !hostIpMatch.startsWith('172.')) {
            return hostIpMatch;
        }
    }

    // 2. Find physical/non-internal, non-docker network interface
    const allIps = getAvailableNetworkIps();
    const externalIps = allIps.filter(i => !i.internal && i.address !== '127.0.0.1');

    // Prefer non-docker 172.x subnets if a 10.x, 192.168.x or 172.x physical exists
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

/**
 * Generate full cross-platform SMB, FTP and Web sharing info
 */
const getNetworkShareInfo = (req, options = {}) => {
    const customIp = options.customIp || null;
    const authMode = options.authMode || 'anonymous'; // 'anonymous' | 'authenticated'
    const users = Array.isArray(options.users) && options.users.length > 0 ? options.users : DEFAULT_NETWORK_SHARE_USERS;

    const interfaces = getAvailableNetworkIps();
    const primaryIp = resolvePrimaryIp(req, customIp);
    const port = req?.socket?.localPort || process.env.PORT || 3005;

    const activeUser = users.find(u => u.enabled) || users[0] || { username: 'media_admin', password: 'Password123!' };
    const isAuth = authMode === 'authenticated';

    return {
        success: true,
        primaryIp,
        interfaces,
        authMode, // 'anonymous' | 'authenticated'
        customIp,
        users,
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
            activeUser: isAuth ? { username: activeUser.username, role: activeUser.role, permissions: activeUser.permissions } : null,
            instructions: isAuth
                ? `Connect to \\\\${primaryIp}\\media using Network Share username and password.`
                : `Connect to \\\\${primaryIp}\\media directly (Anonymous / Guest access enabled).`
        },
        ftp: {
            url: `ftp://${primaryIp}/media`,
            rootUrl: `ftp://${primaryIp}/`,
            port: 21,
            anonymous: !isAuth,
            authRequired: isAuth,
            username: isAuth ? activeUser.username : 'anonymous',
            password: isAuth ? '******' : '',
            instructions: isAuth
                ? `Connect to ftp://${primaryIp}/media using assigned Network Share credentials.`
                : `Connect to ftp://${primaryIp}/media with anonymous login (no password required).`
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

module.exports = {
    getAvailableNetworkIps,
    resolvePrimaryIp,
    DEFAULT_NETWORK_SHARE_USERS,
    getNetworkShareInfo,
};
