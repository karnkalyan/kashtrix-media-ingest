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
    const lines = output.split('\n');
    let readingDevices = false;

    for (const line of lines) {
        if (line.trim() === 'Auto-detected sources for decklink:') {
            readingDevices = true;
            continue;
        }

        if (!readingDevices) continue;

        // FFmpeg 8 prints: * <internal handle> [<display name>] (video, audio)
        // The leading '*' is optional and marks FFmpeg's default device.
        const match = line.match(/^\s*\*?\s*\S+\s+\[([^\]\r\n]+)\]\s+\(\s*video\s*,\s*audio\s*\)\s*$/i);
        if (match) {
            const displayName = match[1].trim();
            if (displayName && !video.includes(displayName)) {
                video.push(displayName);
                audio.push(displayName);
            }
        }
    }
    return { video, audio };
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

        const quotedMatches = [...line.matchAll(/"([^"]+)"/g)].map(match => match[1].trim()).filter(Boolean);
        for (const deviceName of quotedMatches) {
            if (deviceName.startsWith('@device_')) continue;
            if (isVideo && !videoDevices.includes(deviceName)) {
                videoDevices.push(deviceName);
            }
            if (isAudio && !audioDevices.includes(deviceName)) {
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
