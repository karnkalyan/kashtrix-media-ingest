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
 * Generate full SMB, FTP and Web sharing info for a given IP
 */
const getNetworkShareInfo = (req, customIp = null) => {
    const interfaces = getAvailableNetworkIps();
    const primaryIp = resolvePrimaryIp(req, customIp);
    const port = req?.socket?.localPort || process.env.PORT || 3005;

    return {
        success: true,
        primaryIp,
        interfaces,
        smb: {
            parentPath: `\\\\${primaryIp}\\media`,
            recordingsPath: `\\\\${primaryIp}\\recordings`,
            runCommand: `\\\\${primaryIp}\\media`,
            shareName: 'media',
            description: 'Windows Network File Share (SMB)',
            anonymous: true,
            authRequired: false,
            instructions: `Press Win + R, paste \\\\${primaryIp}\\media and press Enter to access media files directly without password.`
        },
        ftp: {
            url: `ftp://${primaryIp}/media`,
            rootUrl: `ftp://${primaryIp}/`,
            port: 21,
            anonymous: true,
            authRequired: false,
            username: 'anonymous',
            password: '',
            instructions: `Connect to ftp://${primaryIp}/media using any FTP client or browser (Anonymous access).`
        },
        http: {
            url: `http://${primaryIp}:${port}/media/recordings`,
            parentUrl: `http://${primaryIp}:${port}/media`,
            port,
            description: 'Direct HTTP Web Access'
        },
        credentials: {
            username: 'None (Guest / Anonymous)',
            password: 'None (No password required)',
            permissions: 'Read & Write Access'
        }
    };
};

module.exports = {
    getAvailableNetworkIps,
    resolvePrimaryIp,
    getNetworkShareInfo,
};
