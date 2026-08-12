const { execFile } = require('child_process');
const ffmpegPath = process.env.FFMPEG_PATH || require('@ffmpeg-installer/ffmpeg').path;

/**
 * List available FFmpeg capture devices on Windows using DirectShow.
 * @returns {Promise<{video: string[], audio: string[]}>}
 */
function getFFmpegDevices(executable = ffmpegPath) {
    return new Promise((resolve, reject) => {
        execFile(executable, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
            maxBuffer: 1024 * 1024,
        }, (error, stdout, stderr) => {
            const output = stderr || stdout;

            if (error && !output.includes('DirectShow video devices') && !output.includes('DirectShow audio devices')) {
                console.error('FFmpeg execution error (Devices):', error.message);
                return reject(new Error(`Failed to run FFmpeg device discovery: ${error.message}.`));
            }

            try {
                const devices = parseFFmpegDeviceOutput(output);
                resolve(devices);
            } catch (parseError) {
                console.error('Error parsing FFmpeg device output:', parseError);
                reject(new Error('FFmpeg ran but failed to parse device list.'));
            }
        });
    });
}

/**
 * Parse FFmpeg device listing output into structured video/audio device arrays.
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

module.exports = { getFFmpegDevices };
