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
    keys: [],
    accounts: []
};

/**
 * Load RTMP security settings from DB
 */
const getSecuritySettings = async (db) => {
    try {
        if (db && db.getKv) {
            const raw = await db.getKv(RTMP_SECURITY_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
                    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
                };
            }
        }
    } catch (e) {
        console.warn('[RtmpSecurity] Error reading settings:', e.message);
    }
    return { ...DEFAULT_SETTINGS };
};

/**
 * Persist RTMP security settings to DB
 */
const saveSecuritySettings = async (db, settings) => {
    try {
        if (db && db.setKv) {
            await db.setKv(RTMP_SECURITY_STORAGE_KEY, JSON.stringify(settings));
        }
    } catch (e) {
        console.error('[RtmpSecurity] Error persisting settings:', e.message);
    }
};

/**
 * Generate cryptographically secure stream key
 */
const generateRandomKey = (prefix = 'sk_live_') => {
    return `${prefix}${crypto.randomBytes(16).toString('hex')}`;
};

/**
 * Authenticate incoming RTMP publish attempt
 */
const authenticatePublishSession = async (db, StreamPath, args = {}, session = null) => {
    const settings = await getSecuritySettings(db);

    // 1. If security is disabled (Unsecure Mode), allow all publishers immediately
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
        (settings.keys.some(k => k.key === streamName) ? streamName : '')
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
            saveSecuritySettings(db, settings).catch(() => {});

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
            saveSecuritySettings(db, settings).catch(() => {});

            return {
                allowed: true,
                secureMode: true,
                authMethod: 'account',
                username: matchingAccount.username
            };
        }
    }

    // 4. If Secure Mode is active and neither key nor valid credentials were provided: REJECT
    return {
        allowed: false,
        reason: 'Unauthorized stream: Secure Mode is ACTIVE. Please provide a valid stream key (?key=YOUR_KEY) or publisher credentials (user/password).'
    };
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

module.exports = {
    getSecuritySettings,
    saveSecuritySettings,
    generateRandomKey,
    authenticatePublishSession,
    releasePublishSession,
    generatePublishUrls,
    activeKeyPublishers,
    activeAccountPublishers
};
