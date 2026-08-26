const crypto = require('crypto');

/**
 * Kashtrix StreamOps - RTMP Server Ingest Security Engine
 * 
 * Provides authorization controls for incoming live streams:
 * 1. Secure (Protected) vs Unsecure (Open) mode toggle.
 * 2. URL-based Stream Key authorization (?key=... / ?token=...).
 * 3. Username & Password publisher credentials.
 * 4. Single-publisher concurrency lock ("single key only work single"):
 *    Rejects duplicate simultaneous publishers attempting to publish with the same key.
 * 5. Stream name / path whitelisting & expiration dates.
 */

const RTMP_SECURITY_STORAGE_KEY = 'rtmp_security_settings';

// In-memory active publisher locks for single-key concurrency enforcement
// keyString -> { sessionId, streamPath, startTime }
const activeKeyPublishers = new Map();

// username -> { sessionId, streamPath, startTime }
const activeAccountPublishers = new Map();

const DEFAULT_SETTINGS = {
    enabled: false, // false = unsecure/open, true = secure/authorized only
    authMode: 'flexible', // 'flexible' (allow key OR credentials), 'key_only', 'credentials_only'
    singlePublisherPerKey: true, // enforce 1 concurrent publisher per key
    playbackSecurityEnabled: false, // global playback security
    keys: [],
    accounts: []
};

// In-memory cache for synchronous validation during RTMP prePublish lifecycle
let cachedSettings = { ...DEFAULT_SETTINGS };

/**
 * Load RTMP security settings synchronously from in-memory PrismaStore cache
 */
const getSecuritySettingsSync = (db) => {
    try {
        if (db && db.data && Array.isArray(db.data.kv)) {
            const row = db.data.kv.find(item => item.key === RTMP_SECURITY_STORAGE_KEY);
            if (row && row.value) {
                const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                cachedSettings = {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
                    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
                };
                return cachedSettings;
            }
        }
    } catch (_) {}
    return cachedSettings || { ...DEFAULT_SETTINGS };
};

/**
 * Load RTMP security settings from DB asynchronously
 */
const getSecuritySettings = async (db) => {
    try {
        if (db && db.getKv) {
            const raw = await db.getKv(RTMP_SECURITY_STORAGE_KEY);
            if (raw) {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                cachedSettings = {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
                    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
                };
                return cachedSettings;
            }
        }
    } catch (e) {
        console.warn('[RtmpSecurity] Error reading settings:', e.message);
    }
    return getSecuritySettingsSync(db);
};

/**
 * Persist RTMP security settings to DB
 */
const saveSecuritySettings = async (db, settings) => {
    cachedSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        keys: Array.isArray(settings.keys) ? settings.keys : [],
        accounts: Array.isArray(settings.accounts) ? settings.accounts : []
    };
    try {
        if (db && db.setKv) {
            await db.setKv(RTMP_SECURITY_STORAGE_KEY, JSON.stringify(cachedSettings));
        }
    } catch (e) {
        console.error('[RtmpSecurity] Error persisting settings:', e.message);
    }
};

/**
 * Generate cryptographically secure stream key
 */
const generateRandomKey = (prefix = 'kas_live_') => {
    return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
};

/**
 * Synchronous authentication for immediate NodeMediaServer prePublish lifecycle rejection
 */
const authenticatePublishSessionSync = (db, StreamPath, args = {}, session = null) => {
    const settings = getSecuritySettingsSync(db);

    // 1. If security is disabled (Unsecure / Open Mode), allow all publishers immediately
    if (!settings.enabled) {
        return {
            allowed: true,
            secureMode: false,
            message: 'Unsecure / Open Mode: incoming stream accepted.'
        };
    }

    const sessionId = session?.id || session?.sessionId || `s_${Date.now()}`;
    const cleanStreamPath = (typeof StreamPath === 'string' ? StreamPath : '').trim();
    const parts = cleanStreamPath.split('?')[0].split('/').filter(Boolean);
    const appName = parts[0] || 'live';
    const streamName = parts[1] || 'feed';

    // Allow internal loopback bridges (e.g. SRT Ingest listener, internal FFmpeg demuxers)
    const remoteIp = String(session?.ip || session?.socket?.remoteAddress || '');
    const isLoopback = remoteIp.includes('127.0.0.1') || remoteIp.includes('::1') || remoteIp.includes('localhost') || remoteIp === '127.0.0.1';
    const isSrtStream = streamName.includes('srt') || streamName === 'srt-feed' || appName.includes('srt');
    if (isLoopback || isSrtStream) {
        return {
            allowed: true,
            secureMode: true,
            authMethod: 'internal_bridge',
            message: 'Internal loopback / SRT bridge publisher authorized.'
        };
    }

    // If Secure Mode is enabled and 0 keys and 0 accounts exist, reject immediately
    const hasKeys = Array.isArray(settings.keys) && settings.keys.length > 0;
    const hasAccounts = Array.isArray(settings.accounts) && settings.accounts.length > 0;
    if (!hasKeys && !hasAccounts) {
        return {
            allowed: false,
            reason: 'Secure Mode is ACTIVE, but NO authorized stream keys or publisher accounts are registered. Stream rejected.'
        };
    }

    // Parse URL query arguments if present in StreamPath
    let combinedArgs = { ...(args || {}) };
    if (cleanStreamPath.includes('?')) {
        const queryString = cleanStreamPath.split('?')[1];
        const searchParams = new URLSearchParams(queryString);
        for (const [k, v] of searchParams.entries()) {
            if (!combinedArgs[k]) combinedArgs[k] = v;
        }
    }

    // Extract Candidate Stream Key
    const candidateKey = (
        combinedArgs.key ||
        combinedArgs.token ||
        combinedArgs.secret ||
        combinedArgs.stream_key ||
        combinedArgs.k ||
        combinedArgs.auth ||
        (settings.keys.some(k => k.key === streamName && k.enabled !== false) ? streamName : '')
    )?.trim();

    // Extract Candidate Username & Password
    const candidateUser = (combinedArgs.user || combinedArgs.username || combinedArgs.u)?.trim();
    const candidatePass = (combinedArgs.pass || combinedArgs.password || combinedArgs.p)?.trim();

    // Also check tcUrl basic auth if present: rtmp://user:pass@host:port/app
    let tcUser = '', tcPass = '';
    if (session && session.connectCmdObj && session.connectCmdObj.tcUrl) {
        try {
            const urlObj = new URL(session.connectCmdObj.tcUrl);
            if (urlObj.username) tcUser = decodeURIComponent(urlObj.username);
            if (urlObj.password) tcPass = decodeURIComponent(urlObj.password);
        } catch (_) {}
    }
    const finalUser = candidateUser || tcUser;
    const finalPass = candidatePass || tcPass;

    const now = new Date();

    // 2. Evaluate Stream Keys (if not credentials_only)
    if (settings.authMode !== 'credentials_only' && candidateKey) {
        const matchingKey = settings.keys.find(k => k.key === candidateKey && k.enabled !== false);
        if (matchingKey) {
            // Check Expiration
            if (matchingKey.expiresAt) {
                const expDate = new Date(matchingKey.expiresAt);
                if (!isNaN(expDate.getTime()) && now > expDate) {
                    return {
                        allowed: false,
                        reason: `Stream key "${matchingKey.name}" has expired on ${matchingKey.expiresAt}`
                    };
                }
            }

            // Check Allowed Stream Restriction
            if (matchingKey.allowedStreams && matchingKey.allowedStreams.length > 0 && !matchingKey.allowedStreams.includes('*')) {
                if (!matchingKey.allowedStreams.includes(streamName)) {
                    return {
                        allowed: false,
                        reason: `Stream key "${matchingKey.name}" is not authorized for stream name "${streamName}" (Allowed: ${matchingKey.allowedStreams.join(', ')})`
                    };
                }
            }

            // Enforce Single Publisher Concurrency ("single key only work single")
            const shouldEnforceSingle = matchingKey.singlePublisherOnly !== false || settings.singlePublisherPerKey !== false;
            if (shouldEnforceSingle) {
                const existing = activeKeyPublishers.get(candidateKey);
                if (existing && existing.sessionId !== sessionId) {
                    console.warn(`[RtmpSecurity] Rejected duplicate publisher for key "${matchingKey.name}". Key is currently active in session ${existing.sessionId} (${existing.streamPath}).`);
                    return {
                        allowed: false,
                        reason: `Single Key Policy Violation: Stream key "${matchingKey.name}" is already active and currently streaming in another session. Multiple simultaneous streams with this key are blocked.`
                    };
                }
            }

            // Lock the key to this active session
            activeKeyPublishers.set(candidateKey, {
                sessionId,
                streamPath: `${appName}/${streamName}`,
                keyId: matchingKey.id,
                startTime: Date.now()
            });

            // Update last used timestamp in settings
            matchingKey.lastUsedAt = now.toISOString();

            return {
                allowed: true,
                secureMode: true,
                authMethod: 'stream_key',
                keyName: matchingKey.name,
                keyId: matchingKey.id
            };
        }
    }

    // 3. Evaluate Publisher Accounts (if not key_only)
    if (settings.authMode !== 'key_only' && finalUser && finalPass) {
        const matchingAccount = settings.accounts.find(a => a.username === finalUser && a.password === finalPass && a.enabled !== false);
        if (matchingAccount) {
            // Check Allowed Streams
            if (matchingAccount.allowedStreams && matchingAccount.allowedStreams.length > 0 && !matchingAccount.allowedStreams.includes('*')) {
                if (!matchingAccount.allowedStreams.includes(streamName)) {
                    return {
                        allowed: false,
                        reason: `Publisher account "${finalUser}" is not authorized for stream name "${streamName}"`
                    };
                }
            }

            // Enforce Single Publisher per Account
            const shouldEnforceSingle = matchingAccount.singlePublisherOnly !== false || settings.singlePublisherPerKey !== false;
            if (shouldEnforceSingle) {
                const existing = activeAccountPublishers.get(finalUser);
                if (existing && existing.sessionId !== sessionId) {
                    return {
                        allowed: false,
                        reason: `Single Session Violation: Account "${finalUser}" is already streaming in another active session.`
                    };
                }
            }

            activeAccountPublishers.set(finalUser, {
                sessionId,
                streamPath: `${appName}/${streamName}`,
                accountId: matchingAccount.id,
                startTime: Date.now()
            });

            matchingAccount.lastUsedAt = now.toISOString();

            return {
                allowed: true,
                secureMode: true,
                authMethod: 'account',
                username: matchingAccount.username
            };
        }
    }

    // 4. If Secure Mode is active and neither valid key nor valid credentials were provided: REJECT
    return {
        allowed: false,
        reason: 'Unauthorized stream: Secure Mode is ACTIVE. Please provide a valid registered stream key (?key=YOUR_KEY) or publisher credentials.'
    };
};

/**
 * Authenticate incoming RTMP publish attempt (async wrapper)
 */
const authenticatePublishSession = async (db, StreamPath, args = {}, session = null) => {
    const res = authenticatePublishSessionSync(db, StreamPath, args, session);
    if (res.allowed && res.secureMode) {
        const settings = getSecuritySettingsSync(db);
        saveSecuritySettings(db, settings).catch(() => {});
    }
    return res;
};

/**
 * Release active locks when publisher finishes or disconnects
 */
const releasePublishSession = (sessionId, StreamPath = '') => {
    // Release key locks
    for (const [keyString, lock] of activeKeyPublishers.entries()) {
        if (lock.sessionId === sessionId || (StreamPath && lock.streamPath === StreamPath)) {
            console.log(`[RtmpSecurity] Released active lock for key "${keyString.slice(0, 10)}..." (Session ${sessionId})`);
            activeKeyPublishers.delete(keyString);
        }
    }

    // Release account locks
    for (const [user, lock] of activeAccountPublishers.entries()) {
        if (lock.sessionId === sessionId || (StreamPath && lock.streamPath === StreamPath)) {
            console.log(`[RtmpSecurity] Released active lock for account "${user}" (Session ${sessionId})`);
            activeAccountPublishers.delete(user);
        }
    }
};

/**
 * Generate formatted publish strings for OBS, vMix, Wirecast, FFmpeg
 */
const generatePublishUrls = (hostname = 'localhost', rtmpPort = 1935, streamName = 'live_feed', keyOrAccount = {}) => {
    const isKey = !!keyOrAccount.key;
    const cleanKey = isKey ? keyOrAccount.key : '';
    const cleanUser = !isKey ? (keyOrAccount.username || '') : '';
    const cleanPass = !isKey ? (keyOrAccount.password || '') : '';

    const serverUrl = `rtmp://${hostname}:${rtmpPort}/live`;
    let streamKeyParam = streamName;
    let fullUrl = `${serverUrl}/${streamName}`;

    if (isKey) {
        streamKeyParam = `${streamName}?key=${cleanKey}`;
        fullUrl = `${serverUrl}/${streamName}?key=${cleanKey}`;
    } else if (cleanUser && cleanPass) {
        streamKeyParam = `${streamName}?user=${encodeURIComponent(cleanUser)}&pass=${encodeURIComponent(cleanPass)}`;
        fullUrl = `rtmp://${cleanUser}:${cleanPass}@${hostname}:${rtmpPort}/live/${streamName}`;
    }

    const ffmpegCommand = `ffmpeg -re -i "input.mp4" -c copy -f flv "${fullUrl}"`;

    return {
        serverUrl,
        streamKey: streamKeyParam,
        fullUrl,
        ffmpegCommand,
        hlsPlaybackUrl: `http://${hostname}:8100/live/${streamName}/index.m3u8`
    };
};

/**
 * Authenticate incoming playback session (HLS / RTMP play)
 */
const authenticatePlaybackSession = async (db, StreamPath, args = {}) => {
    const settings = getSecuritySettingsSync(db);
    const cleanStreamPath = (typeof StreamPath === 'string' ? StreamPath : '').trim();
    const parts = cleanStreamPath.split('?')[0].split('/').filter(Boolean);
    const streamName = parts[1] || parts[0] || 'feed';

    // Parse URL query arguments if present in StreamPath
    let combinedArgs = { ...(args || {}) };
    if (cleanStreamPath.includes('?')) {
        const queryString = cleanStreamPath.split('?')[1];
        const searchParams = new URLSearchParams(queryString);
        for (const [k, v] of searchParams.entries()) {
            if (!combinedArgs[k]) combinedArgs[k] = v;
        }
    }

    const providedToken = (combinedArgs.token || combinedArgs.key || combinedArgs.auth || combinedArgs.secret || '')?.trim();

    // Allow SRT ingest streams and internal relay streams to be previewed/played without requiring RTMP keys
    if (streamName.includes('srt') || streamName === 'srt-feed') {
        return { allowed: true, playbackMode: 'open', streamName };
    }

    // Find active per-stream key configuration (enabled only)
    const matchingKey = settings.keys.find(k => 
        k.enabled !== false &&
        (k.key === streamName || (Array.isArray(k.allowedStreams) && (k.allowedStreams.includes('*') || k.allowedStreams.includes(streamName))))
    );

    const isGlobalSecure = settings.enabled === true || settings.playbackSecurityEnabled === true;

    // Case 1: Matching active key found
    if (matchingKey) {
        // If explicitly set to open playback, allow without token
        if (matchingKey.playbackSecurity === 'open') {
            return { allowed: true, playbackMode: 'open', streamName };
        }

        // If explicitly set to secure, or if global security is ON: require valid token
        const isSecureRequired = matchingKey.playbackSecurity === 'secure' || isGlobalSecure;
        if (isSecureRequired) {
            const expectedToken = (matchingKey.playbackToken || matchingKey.key || '').trim();
            if (providedToken && (providedToken === expectedToken || providedToken === matchingKey.key)) {
                return { allowed: true, playbackMode: 'secure_authorized', keyName: matchingKey.name, streamName };
            }
            return {
                allowed: false,
                playbackMode: 'secure_rejected',
                reason: `Secure Playback Active for stream "${streamName}". Valid playback token required (?token=...).`
            };
        }

        return { allowed: true, playbackMode: 'open', streamName };
    }

    // Case 2: No active key exists (e.g. key was deleted or never created)
    if (isGlobalSecure) {
        // In secure mode, streams on deleted/unregistered keys MUST NOT play
        return {
            allowed: false,
            playbackMode: 'secure_rejected',
            reason: `Stream "${streamName}" is not authorized or key was deleted. Playback denied.`
        };
    }

    // In open mode with no security, allow playback
    return { allowed: true, playbackMode: 'open', streamName };
};

module.exports = {
    getSecuritySettings,
    getSecuritySettingsSync,
    saveSecuritySettings,
    generateRandomKey,
    authenticatePublishSessionSync,
    authenticatePublishSession,
    authenticatePlaybackSession,
    releasePublishSession,
    generatePublishUrls,
    activeKeyPublishers,
    activeAccountPublishers
};
