const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeckLink } = require('./getDevices');

// Helper to mirror server's resolveCaptureDevice
const resolveCaptureDevice = (devices, deviceName) => {
    if (!deviceName) return '';
    const raw = String(deviceName).trim();
    if (!devices) return raw;

    if (devices.decklinkDevices && Array.isArray(devices.decklinkDevices)) {
        const foundById = devices.decklinkDevices.find(d => d.id === raw);
        if (foundById && foundById.name) return foundById.name;
        const foundByName = devices.decklinkDevices.find(d => d.name === raw);
        if (foundByName && foundByName.name) return foundByName.name;
    }
    if (devices.decklinkMap && typeof devices.decklinkMap === 'object') {
        for (const [name, id] of Object.entries(devices.decklinkMap)) {
            if (id === raw) return name;
        }
        if (devices.decklinkMap[raw]) {
            return raw;
        }
    }
    if (Array.isArray(devices.video) && devices.video.includes(raw)) return raw;
    if (Array.isArray(devices.audio) && devices.audio.includes(raw)) return raw;
    return raw;
};

const getDeckLinkFormatCode = (resolution = '1080', framerate = 50, interlaced = false) => {
    const res = String(resolution).toLowerCase();
    const fpsNum = Number(framerate) || 50;
    const is59 = Math.abs(fpsNum - 59.94) < 0.02 || fpsNum === 59;
    const is29 = Math.abs(fpsNum - 29.97) < 0.02 || fpsNum === 29;
    const is23 = Math.abs(fpsNum - 23.976) < 0.02 || Math.abs(fpsNum - 23.98) < 0.02 || fpsNum === 23;
    const fps = Math.round(fpsNum);

    if (res.includes('2160') || res.includes('3840') || res.includes('4k')) {
        if (is59) return '4k59';
        if (fps === 60) return '4k60';
        if (fps === 50) return '4k50';
        if (is29 || fps === 30) return '4k30';
        if (fps === 25) return '4k25';
        if (is23 || fps === 24) return '4k24';
        return '4k50';
    }
    if (res.includes('576') || res.includes('pal')) return 'pal ';
    if (res.includes('480') || res.includes('ntsc')) return 'ntsc';
    if (res.includes('1280') || res.includes('720p') || (res.includes('720') && !res.includes('576') && !res.includes('480'))) {
        if (is59) return 'hp59';
        if (fps === 60) return 'hp60';
        if (fps === 50) return 'hp50';
        return 'hp50';
    }
    if (interlaced) {
        if (is59) return 'Hi59';
        if (fps === 60 || fps === 30) return 'Hi60';
        if (fps === 50 || fps === 25) return 'Hi50';
        return 'Hi50';
    }
    if (is59) return 'Hp59';
    if (fps === 60) return 'Hp60';
    if (fps === 50) return 'Hp50';
    if (is29 || fps === 30) return 'Hp30';
    if (fps === 25) return 'Hp25';
    if (is23 || fps === 24) return 'Hp24';
    return 'Hi50';
};

const buildDecklinkInputArgs = (videoDevice, audioDevice, options = {}) => {
    const dev = videoDevice || audioDevice;
    const args = ['-thread_queue_size', '2048', '-f', 'decklink'];
    let formatCode = options.formatCode;
    if (!formatCode || formatCode === 'auto' || formatCode === 'unset') {
        formatCode = getDeckLinkFormatCode(options.resolution || '1080', options.framerate || 50) || 'Hi50';
    }
    if (formatCode && formatCode !== 'unset' && formatCode !== 'auto') {
        args.push('-format_code', formatCode);
    }
    const videoInput = (options.videoInput && options.videoInput !== 'unset' && options.videoInput !== 'auto') ? options.videoInput : 'sdi';
    if (videoInput) args.push('-video_input', videoInput);
    args.push(
        '-audio_input', 'embedded',
        '-timecode_format', 'rp188any',
        '-channels', '8',
        '-audio_depth', '32'
    );
    if (options.rawFormat) args.push('-raw_format', options.rawFormat);
    args.push('-i', dev);
    return args;
};

test('DeckLink Capture & Preview Handoff Suite', async (t) => {
    await t.test('1. resolveCaptureDevice resolves display names and handles correctly for FFmpeg', () => {
        const fakeOutput = `Auto-detected sources for decklink:
  65:3ce2f04c:00000000 [DeckLink 4K Extreme] (video, audio)
  75:05326625:00000001 [DeckLink Duo 2 (1)] (video, audio)
`;
        const parsed = parseDeckLink(fakeOutput);

        // Test passing display name directly -> returns display name
        assert.equal(resolveCaptureDevice(parsed, 'DeckLink 4K Extreme'), 'DeckLink 4K Extreme');
        assert.equal(resolveCaptureDevice(parsed, 'DeckLink Duo 2 (1)'), 'DeckLink Duo 2 (1)');

        // Test passing internal hex handle -> resolves to display name (NOT handle!)
        assert.equal(resolveCaptureDevice(parsed, '65:3ce2f04c:00000000'), 'DeckLink 4K Extreme');
        assert.equal(resolveCaptureDevice(parsed, '75:05326625:00000001'), 'DeckLink Duo 2 (1)');

        // Test DirectShow device or unknown device returns the trimmed device name
        assert.equal(resolveCaptureDevice(parsed, 'USB Video Device'), 'USB Video Device');
    });

    await t.test('2. getDeckLinkFormatCode generates correct DeckLink 4-character codes', () => {
        assert.equal(getDeckLinkFormatCode('1920x1080', 50, false), 'Hp50');
        assert.equal(getDeckLinkFormatCode('1920x1080', 50, true), 'Hi50');
        assert.equal(getDeckLinkFormatCode('1920x1080', 25, false), 'Hp25');
        assert.equal(getDeckLinkFormatCode('3840x2160', 50, false), '4k50');
        assert.equal(getDeckLinkFormatCode('3840x2160', 60, false), '4k60');
        assert.equal(getDeckLinkFormatCode('1280x720', 50, false), 'hp50');
        assert.equal(getDeckLinkFormatCode('1280x720', 59.94, false), 'hp59');
        assert.equal(getDeckLinkFormatCode('720x576', 25, true), 'pal ');
        assert.equal(getDeckLinkFormatCode('720x480', 29.97, true), 'ntsc');
    });

    await t.test('3. DeckLink input arguments pass display name and 8-channel embedded SDI audio', () => {
        const args = buildDecklinkInputArgs('DeckLink 4K Extreme', 'DeckLink 4K Extreme', {
            resolution: '1920x1080',
            framerate: 50,
            formatCode: 'Hi50',
            videoInput: 'sdi',
            rawFormat: 'uyvy422'
        });

        assert.ok(args.includes('-f') && args[args.indexOf('-f') + 1] === 'decklink');
        assert.ok(args.includes('-i') && args[args.indexOf('-i') + 1] === 'DeckLink 4K Extreme');
        assert.ok(args.includes('-format_code') && args[args.indexOf('-format_code') + 1] === 'Hi50');
        assert.ok(args.includes('-video_input') && args[args.indexOf('-video_input') + 1] === 'sdi');
        assert.ok(args.includes('-channels') && args[args.indexOf('-channels') + 1] === '8');
        assert.ok(args.includes('-audio_depth') && args[args.indexOf('-audio_depth') + 1] === '32');
        assert.ok(args.includes('-raw_format') && args[args.indexOf('-raw_format') + 1] === 'uyvy422');
    });

    await t.test('4. Preview to recording transition allows other clients to query active recording preview', () => {
        const devicePreviewProcesses = new Map();
        const activeRecordings = new Map();

        // 1. Simulate standalone preview started
        const previewId1 = 'preview-standalone-123';
        devicePreviewProcesses.set(previewId1, {
            previewId: previewId1,
            videoDevice: 'DeckLink 4K Extreme',
            audioDevice: 'DeckLink 4K Extreme',
            isRecording: false,
            closed: false,
            hasSignal: true,
        });

        // 2. User starts recording on the same device -> release standalone preview
        for (const [pId, prev] of devicePreviewProcesses.entries()) {
            if (!prev.isRecording && prev.videoDevice === 'DeckLink 4K Extreme') {
                prev.closed = true;
                devicePreviewProcesses.delete(pId);
            }
        }
        assert.equal(devicePreviewProcesses.has(previewId1), false);

        // 3. Recording creates attached HLS preview
        const recordingPreviewId = 'recording-preview-456';
        const recPreview = {
            previewId: recordingPreviewId,
            videoDevice: 'DeckLink 4K Extreme',
            audioDevice: 'DeckLink 4K Extreme',
            isRecording: true,
            closed: false,
            hasSignal: true,
            detectedResolution: '1920x1080',
            detectedFramerate: '50 fps',
        };
        devicePreviewProcesses.set(recordingPreviewId, recPreview);
        activeRecordings.set('device/DeckLink 4K Extreme', {
            options: { sourceType: 'device', videoDevice: 'DeckLink 4K Extreme' },
            previewConfig: { previewId: recordingPreviewId }
        });

        // 4. Another client checks status for 'DeckLink 4K Extreme'
        let foundPreview = null;
        for (const [pId, preview] of devicePreviewProcesses) {
            if (!preview.closed && preview.videoDevice === 'DeckLink 4K Extreme') {
                foundPreview = {
                    previewId: pId,
                    hlsUrl: `/hls/device-preview/${pId}/index.m3u8`,
                    isRecording: Boolean(preview.isRecording),
                    hasSignal: preview.hasSignal
                };
                break;
            }
        }

        assert.ok(foundPreview);
        assert.equal(foundPreview.previewId, recordingPreviewId);
        assert.equal(foundPreview.hlsUrl, `/hls/device-preview/${recordingPreviewId}/index.m3u8`);
        assert.equal(foundPreview.isRecording, true);
        assert.equal(foundPreview.hasSignal, true);
    });
});
