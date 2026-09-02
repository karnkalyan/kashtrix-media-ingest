'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { YtDlp, helpers } = require('ytdlp-nodejs');

let cachedBinaryPath = null;

/**
 * Check if the input is a YouTube URL
 * @param {string} url
 * @returns {boolean}
 */
const isYouTubeUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim().toLowerCase();
    return (
        trimmed.includes('youtube.com/watch') ||
        trimmed.includes('youtube.com/live') ||
        trimmed.includes('youtube.com/shorts') ||
        trimmed.includes('youtu.be/') ||
        trimmed.startsWith('https://youtube.com/') ||
        trimmed.startsWith('https://www.youtube.com/') ||
        trimmed.startsWith('http://youtube.com/') ||
        trimmed.startsWith('http://www.youtube.com/')
    );
};

/**
 * Check if a channel configuration represents a YouTube input
 * @param {object} channel
 * @returns {boolean}
 */
const isYouTubeChannel = (channel) => {
    if (!channel) return false;
    const inputType = String(channel.inputType || '').toLowerCase();
    const inputUrl = String(channel.inputUrl || '').toLowerCase();
    return (
        inputType === 'youtube' ||
        inputType === 'youtube url' ||
        isYouTubeUrl(channel.inputUrl)
    );
};

/**
 * Cross-platform resolution of yt-dlp binary
 * Prioritizes ytdlp-nodejs packaged binary, followed by local & system PATH fallbacks.
 * @returns {string} Path to yt-dlp executable
 */
const getYtDlpBinaryPath = () => {
    if (cachedBinaryPath && fs.existsSync(cachedBinaryPath)) {
        return cachedBinaryPath;
    }

    // 1. Try ytdlp-nodejs helper
    try {
        const found = helpers.findYtdlpBinary();
        if (found && fs.existsSync(found)) {
            // Ensure executable permissions on Unix/Linux/macOS
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(found, 0o755);
                } catch (_) {}
            }
            cachedBinaryPath = found;
            return found;
        }
    } catch (_) {}

    // 2. Check within node_modules/ytdlp-nodejs/bin
    try {
        const binDir = path.join(__dirname, 'node_modules', 'ytdlp-nodejs', 'bin');
        const defaultBinName = process.platform === 'win32'
            ? 'yt-dlp.exe'
            : process.platform === 'darwin'
            ? 'yt-dlp_macos'
            : 'yt-dlp_linux';
        const candidateInNodeModules = path.join(binDir, defaultBinName);
        if (fs.existsSync(candidateInNodeModules)) {
            if (process.platform !== 'win32') {
                try { fs.chmodSync(candidateInNodeModules, 0o755); } catch (_) {}
            }
            cachedBinaryPath = candidateInNodeModules;
            return candidateInNodeModules;
        }
    } catch (_) {}

    // 3. Platform-specific standard system locations
    const systemCandidates = process.platform === 'win32'
        ? [
            path.join(process.env.LOCALAPPDATA || '', 'yt-dlp', 'yt-dlp.exe'),
            path.join(process.env.USERPROFILE || '', 'yt-dlp.exe'),
            'yt-dlp.exe',
        ]
        : [
            '/usr/local/bin/yt-dlp',
            '/usr/bin/yt-dlp',
            path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
            path.join(os.homedir(), 'bin', 'yt-dlp'),
            'yt-dlp',
        ];

    for (const candidate of systemCandidates) {
        if (candidate && fs.existsSync(candidate)) {
            cachedBinaryPath = candidate;
            return candidate;
        }
    }

    // Fallback to default name in PATH
    const fallback = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    cachedBinaryPath = fallback;
    return fallback;
};

/**
 * Ensure yt-dlp binary is available on the machine.
 * Downloads the standalone binary if missing.
 * @returns {Promise<{ available: boolean, path: string, version?: string }>}
 */
const ensureYtDlpAvailable = async () => {
    let currentPath = getYtDlpBinaryPath();

    const exists = currentPath && (fs.existsSync(currentPath) || !currentPath.includes(path.sep));
    if (!exists || !fs.existsSync(currentPath)) {
        try {
            console.log('[yt-dlp] Binary not found locally. Downloading cross-platform binary via ytdlp-nodejs...');
            await helpers.downloadYtDlp();
            cachedBinaryPath = null; // Clear cache to re-resolve
            currentPath = getYtDlpBinaryPath();
            console.log(`[yt-dlp] Downloaded successfully to: ${currentPath}`);
        } catch (err) {
            console.warn(`[yt-dlp] Auto-download warning: ${err.message}`);
        }
    }

    // Test version
    try {
        const ytdlp = new YtDlp({ binaryPath: currentPath });
        const version = await ytdlp.getVersionAsync();
        return { available: true, path: currentPath, version: String(version).trim() };
    } catch (e) {
        return { available: fs.existsSync(currentPath), path: currentPath, error: e.message };
    }
};

/**
 * Update yt-dlp binary to latest version
 * @returns {Promise<{ success: boolean, version?: string, error?: string }>}
 */
const updateYtDlp = async () => {
    try {
        const binPath = getYtDlpBinaryPath();
        const ytdlp = new YtDlp({ binaryPath: binPath });
        const res = await ytdlp.updateYtDlpAsync();
        cachedBinaryPath = null;
        const newVersion = await ytdlp.getVersionAsync();
        return { success: true, version: String(newVersion).trim(), details: res };
    } catch (e) {
        try {
            await helpers.downloadYtDlp();
            cachedBinaryPath = null;
            const binPath = getYtDlpBinaryPath();
            const ytdlp = new YtDlp({ binaryPath: binPath });
            const newVersion = await ytdlp.getVersionAsync();
            return { success: true, version: String(newVersion).trim() };
        } catch (downloadErr) {
            return { success: false, error: e.message || downloadErr.message };
        }
    }
};

/**
 * Parse a command string that may contain a shell pipeline (`yt-dlp ... | ffmpeg ...`)
 * @param {string} fullCmd
 * @returns {{ isPiped: boolean, ytDlpArgs: string[]|null, ffmpegArgs: string[] }}
 */
const parsePipedCommand = (fullCmd) => {
    if (!fullCmd || typeof fullCmd !== 'string') {
        return { isPiped: false, ytDlpArgs: null, ffmpegArgs: [] };
    }

    const trimmed = fullCmd.trim();
    if (!trimmed.includes('|')) {
        return { isPiped: false, ytDlpArgs: null, ffmpegArgs: [] };
    }

    const parts = trimmed.split('|').map(s => s.trim());
    if (parts.length >= 2 && (parts[0].startsWith('yt-dlp') || parts[0].startsWith('ytdlp'))) {
        return {
            isPiped: true,
            ytDlpCmd: parts[0],
            ffmpegCmd: parts.slice(1).join('|').trim(),
        };
    }

    return { isPiped: false, ytDlpArgs: null, ffmpegArgs: [] };
};
/**
 * Normalize and enhance yt-dlp arguments for robust YouTube live/VOD streaming
 * @param {string[]} rawArgs
 * @param {string} inputUrl
 * @returns {string[]}
 */
const normalizeYtDlpArgs = (rawArgs = [], inputUrl = '') => {
    const nodePath = process.execPath;
    const jsRuntimeArg = `node:${nodePath}`;
    let args = [...rawArgs];

    // Replace -f b or -f best with -f bv*+ba/b for reliable multi-stream audio/video capture
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-f' && (args[i + 1] === 'b' || args[i + 1] === 'best')) {
            args[i + 1] = 'bv*+ba/b';
        }
    }

    // Ensure format flag exists if not specified
    if (!args.includes('-f') && !args.includes('--format')) {
        args.unshift('-f', 'bv*+ba/b');
    }

    // Ensure --js-runtimes is configured with Node.js runtime path
    const jsIdx = args.indexOf('--js-runtimes');
    if (jsIdx === -1) {
        args.unshift('--js-runtimes', jsRuntimeArg);
    } else {
        if (args[jsIdx + 1] === 'node' || !args[jsIdx + 1]?.includes(':')) {
            args[jsIdx + 1] = jsRuntimeArg;
        }
    }

    // Ensure output to stdout
    if (!args.includes('-o') && !args.includes('--output')) {
        args.push('-o', '-');
    }

    // Ensure --no-update is present
    if (!args.includes('--no-update')) {
        args.unshift('--no-update');
    }

    // Ensure input URL is present
    if (inputUrl && !args.some(a => a.includes('youtube.com') || a.includes('youtu.be'))) {
        args.push(inputUrl);
    }

    return args;
};

/**
 * Spawn a piped YouTube-to-FFmpeg transcoding stream process.
 * Connects yt-dlp stdout directly to ffmpeg stdin in Node.js runtime.
 *
 * @param {object} options
 * @param {string} options.channelId
 * @param {string} options.channelName
 * @param {string} options.inputUrl
 * @param {string[]} options.ytArgs
 * @param {string} options.ffmpegPath
 * @param {string[]} options.ffmpegArgs
 * @param {string} options.cwd
 * @param {function} options.onStats
 * @param {function} options.onClose
 * @param {function} options.onError
 * @returns {{ ffmpegProc: ChildProcess, ytProc: ChildProcess, kill: Function, pid: number }}
 */
const spawnYouTubePipeline = ({
    channelId,
    channelName,
    inputUrl,
    ytArgs = [],
    ffmpegPath,
    ffmpegArgs = [],
    cwd,
    onStats,
    onClose,
    onError,
}) => {
    const ytdlpBin = getYtDlpBinaryPath();
    const finalYtArgs = normalizeYtDlpArgs(ytArgs, inputUrl);

    console.log(`[YouTube Pipeline] Spawning yt-dlp: "${ytdlpBin}" ${finalYtArgs.join(' ')}`);
    console.log(`[YouTube Pipeline] Spawning FFmpeg: "${ffmpegPath}" ${ffmpegArgs.join(' ')}`);

    const ytProc = spawn(ytdlpBin, finalYtArgs, {
        cwd: cwd || process.cwd(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, {
        cwd: cwd || process.cwd(),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe yt-dlp stdout to ffmpeg stdin
    ytProc.stdout.pipe(ffmpegProc.stdin);

    let isTerminating = false;

    const killPipeline = (signal = 'SIGTERM') => {
        if (isTerminating) return;
        isTerminating = true;

        try {
            ytProc.stdout.unpipe(ffmpegProc.stdin);
        } catch (_) {}

        try {
            if (process.platform === 'win32') {
                try { ytProc.kill(); } catch (_) {}
                try { ffmpegProc.kill(); } catch (_) {}
            } else {
                try { ytProc.kill(signal); } catch (_) {}
                try { ffmpegProc.kill(signal); } catch (_) {}
            }
        } catch (_) {}
    };

    // Forward yt-dlp error output
    ytProc.stderr.on('data', (chunk) => {
        const str = chunk.toString();
        if (str.includes('ERROR:') || str.includes('Error:') || str.includes('WARNING:')) {
            console.warn(`[Channel ${channelName} yt-dlp]`, str.trim());
        }
    });

    ytProc.on('error', (err) => {
        console.error(`[Channel ${channelName} yt-dlp Error]`, err.message);
        if (onError) onError(err);
        killPipeline('SIGKILL');
    });

    ytProc.on('close', (code) => {
        if (code !== 0 && code !== null && !isTerminating) {
            console.warn(`[Channel ${channelName} yt-dlp exited with code ${code}]`);
        }
        // If yt-dlp stops unexpectedly, close ffmpeg input
        try {
            ffmpegProc.stdin?.end?.();
        } catch (_) {}
    });

    // FFmpeg listeners
    let startTime = Date.now();
    ffmpegProc.stderr.on('data', (chunk) => {
        const str = chunk.toString();
        if (onStats && (str.includes('frame=') || str.includes('fps=') || str.includes('size='))) {
            const speedMatch = str.match(/speed=\s*([0-9.]+x)/);
            const fpsMatch = str.match(/fps=\s*([0-9.]+)/);
            const bitrateMatch = str.match(/bitrate=\s*([0-9.]+kbits\/s)/);
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            onStats({
                status: 'running',
                uptime,
                speed: speedMatch ? speedMatch[1] : '1.0x',
                fps: fpsMatch ? parseFloat(fpsMatch[1]) : 30,
                bitrate: bitrateMatch ? bitrateMatch[1] : '4000k',
            });
        }
        if (str.includes('Error') || str.includes('error') || str.includes('failed')) {
            console.error(`[Channel ${channelName}]`, str.trim());
        }
    });

    ffmpegProc.on('close', (code) => {
        killPipeline('SIGKILL');
        if (onClose) onClose(code);
    });

    ffmpegProc.on('error', (err) => {
        console.error(`[Channel ${channelName} Process Error]`, err.message);
        killPipeline('SIGKILL');
        if (onError) onError(err);
    });

    // Attach lifecycle helpers to ffmpegProc so existing server.js process control works transparently
    ffmpegProc.ytChildProc = ytProc;
    ffmpegProc.killPipeline = killPipeline;

    return {
        ffmpegProc,
        ytProc,
        kill: killPipeline,
        pid: ffmpegProc.pid,
    };
};

module.exports = {
    isYouTubeUrl,
    isYouTubeChannel,
    getYtDlpBinaryPath,
    ensureYtDlpAvailable,
    updateYtDlp,
    parsePipedCommand,
    normalizeYtDlpArgs,
    spawnYouTubePipeline,
};
