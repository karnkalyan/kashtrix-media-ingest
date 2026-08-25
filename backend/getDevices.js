const { execFile } = require('child_process');
const ffmpegPath = process.env.FFMPEG_PATH || require('@ffmpeg-installer/ffmpeg').path;

/**
 * Execute FFmpeg command safely with timeout and return output (stderr + stdout).
 */
function runFfmpeg(executable, args, timeoutMs = 15000) {
    return new Promise((resolve) => {
        execFile(executable, args, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024,
        }, (error, stdout, stderr) => {
            const output = `${stdout || ''}\n${stderr || ''}`;
            resolve(output);
        });
    });
}

/**
 * Parse DeckLink device listing from ffmpeg -sources decklink output.
 */
function parseDeckLink(output) {
    const video = [];
    const audio = [];
    const decklinkMap = {};
    const decklinkDevices = [];
    const lines = output.split('\n');
    let readingDevices = false;
    const seenIds = new Set();

    for (const line of lines) {
        if (line.trim() === 'Auto-detected sources for decklink:') {
            readingDevices = true;
            continue;
        }

        if (!readingDevices) continue;

        const match = line.match(
            /^\s*\*?\s*(\S+)\s+\[([^\]\r\n]+)\]\s+\(([^)]*)\)\s*$/
        );

        if (!match) continue;

        const handle = match[1].trim();
        const displayName = match[2].trim();

        if (!handle || !displayName) continue;

        decklinkMap[displayName] = handle;

        // video/audio arrays keep display names for backward compatibility
        if (!video.includes(displayName)) video.push(displayName);
        if (!audio.includes(displayName)) audio.push(displayName);

        // decklinkDevices array provides structured {id, name} objects
        if (!seenIds.has(handle)) {
            seenIds.add(handle);
            decklinkDevices.push({ id: handle, name: displayName });
        }
    }

    return { video, audio, decklinkMap, decklinkDevices };
}
/**
 * Parse FFmpeg DirectShow device listing output on Windows into structured video/audio device arrays.
 */
function parseFFmpegDeviceOutput(output) {
    const lines = output.split('\n');
    let isVideo = false;
    let isAudio = false;
    const videoDevices = [];
    const audioDevices = [];

    for (const line of lines) {
        if (line.includes('DirectShow video devices')) {
            isVideo = true;
            isAudio = false;
            continue;
        } else if (line.includes('DirectShow audio devices')) {
            isAudio = true;
            isVideo = false;
            continue;
        }

        // FFmpeg 6+ no longer prints the "DirectShow video/audio devices"
        // section headers. It annotates every row instead, for example:
        //   "USB Camera" (video)
        //   "Microphone" (audio)
        // Keep supporting the older section-based output used by the bundled
        // FFmpeg build as well.
        const typeMatch = line.match(/\((video|audio)(?:\s*,\s*(video|audio))?\)\s*\r?$/i);
        const rowTypes = typeMatch
            ? new Set([typeMatch[1], typeMatch[2]].filter(Boolean).map(type => type.toLowerCase()))
            : null;
        const quotedMatches = [...line.matchAll(/"([^"]+)"/g)].map(match => match[1].trim()).filter(Boolean);
        for (const deviceName of quotedMatches) {
            if (deviceName.startsWith('@device_')) continue;
            const rowIsVideo = rowTypes ? rowTypes.has('video') : isVideo;
            const rowIsAudio = rowTypes ? rowTypes.has('audio') : isAudio;
            if (rowIsVideo && !videoDevices.includes(deviceName)) {
                videoDevices.push(deviceName);
            }
            if (rowIsAudio && !audioDevices.includes(deviceName)) {
                audioDevices.push(deviceName);
            }
        }
    }

    return { video: videoDevices, audio: audioDevices };
}

/**
 * List available FFmpeg capture devices.
 * On Windows: uses DirectShow.
 * On Linux: uses DeckLink sources without problematic -list_devices fallback.
 * @returns {Promise<{video: string[], audio: string[]}>}
 */
async function getFFmpegDevices(executable = ffmpegPath) {
    if (process.platform === 'win32') {
        const output = await runFfmpeg(executable, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
        return parseFFmpegDeviceOutput(output);
    }

    // Linux / Docker: Discover DeckLink devices using -sources decklink (without -list_devices fallback)
    try {
        const output = await runFfmpeg(executable, ['-hide_banner', '-sources', 'decklink']);
        return parseDeckLink(output);
    } catch (err) {
        console.error('Error discovering DeckLink capture devices:', err);
        return { video: [], audio: [] };
    }
}

module.exports = { getFFmpegDevices, parseDeckLink, parseFFmpegDeviceOutput };
