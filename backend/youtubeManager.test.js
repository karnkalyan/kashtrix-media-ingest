'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
    isYouTubeUrl,
    isYouTubeChannel,
    getYtDlpBinaryPath,
    ensureYtDlpAvailable,
    parsePipedCommand,
} = require('./youtubeManager');

test('YouTube Manager - URL Detection', async (t) => {
    await t.test('detects standard watch URLs', () => {
        assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
        assert.equal(isYouTubeUrl('http://youtube.com/watch?v=12345'), true);
    });

    await t.test('detects short URLs', () => {
        assert.equal(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), true);
    });

    await t.test('detects live and shorts URLs', () => {
        assert.equal(isYouTubeUrl('https://www.youtube.com/live/sampleliveid'), true);
        assert.equal(isYouTubeUrl('https://youtube.com/shorts/sample123'), true);
    });

    await t.test('rejects non-YouTube inputs', () => {
        assert.equal(isYouTubeUrl('rtmp://127.0.0.1:1935/live/stream'), false);
        assert.equal(isYouTubeUrl('srt://192.168.1.100:9000'), false);
        assert.equal(isYouTubeUrl('udp://224.2.2.2:5000'), false);
        assert.equal(isYouTubeUrl(''), false);
        assert.equal(isYouTubeUrl(null), false);
    });
});

test('YouTube Manager - Channel Ingest Detection', async (t) => {
    await t.test('detects by inputType youtube', () => {
        assert.equal(isYouTubeChannel({ inputType: 'youtube', inputUrl: 'some-url' }), true);
        assert.equal(isYouTubeChannel({ inputType: 'YouTube URL', inputUrl: 'some-url' }), true);
    });

    await t.test('detects by YouTube URL even if inputType is URL/Custom', () => {
        assert.equal(isYouTubeChannel({ inputType: 'url', inputUrl: 'https://youtube.com/watch?v=test' }), true);
    });

    await t.test('rejects normal channels', () => {
        assert.equal(isYouTubeChannel({ inputType: 'live', inputUrl: 'rtmp://test' }), false);
    });
});

test('YouTube Manager - Cross-Platform Binary Resolution', async (t) => {
    await t.test('resolves valid binary path from ytdlp-nodejs', () => {
        const binPath = getYtDlpBinaryPath();
        assert.ok(binPath && binPath.length > 0, 'Binary path should be non-empty');
        assert.ok(fs.existsSync(binPath), `Binary should exist on disk: ${binPath}`);
    });

    await t.test('ensureYtDlpAvailable returns active availability and version', async () => {
        const res = await ensureYtDlpAvailable();
        assert.equal(res.available, true);
        assert.ok(res.path && res.path.length > 0);
        if (res.version) {
            assert.ok(res.version.length > 0);
        }
    });
});

test('YouTube Manager - Piped Command Parsing', async (t) => {
    await t.test('correctly parses piped yt-dlp to ffmpeg command', () => {
        const cmd = 'yt-dlp --no-update -f b -o - "https://youtu.be/123" | ffmpeg -hide_banner -i pipe:0 -c copy -f flv rtmp://out';
        const parsed = parsePipedCommand(cmd);
        assert.equal(parsed.isPiped, true);
        assert.equal(parsed.ytDlpCmd, 'yt-dlp --no-update -f b -o - "https://youtu.be/123"');
        assert.equal(parsed.ffmpegCmd, 'ffmpeg -hide_banner -i pipe:0 -c copy -f flv rtmp://out');
    });

    await t.test('returns isPiped false for standard ffmpeg commands', () => {
        const cmd = 'ffmpeg -i "https://example.com/test.m3u8" -c copy -f flv rtmp://out';
        const parsed = parsePipedCommand(cmd);
        assert.equal(parsed.isPiped, false);
    });
});

test('YouTube Manager - Argument Normalization', async (t) => {
    const { normalizeYtDlpArgs } = require('./youtubeManager');

    await t.test('converts legacy -f b to bv*+ba/b and injects js-runtimes with node path', () => {
        const raw = ['--no-update', '-f', 'b', '-o', '-', 'https://www.youtube.com/watch?v=Joqkvo6HZBg'];
        const normalized = normalizeYtDlpArgs(raw, 'https://www.youtube.com/watch?v=Joqkvo6HZBg');
        
        const fIdx = normalized.indexOf('-f');
        assert.notEqual(fIdx, -1);
        assert.equal(normalized[fIdx + 1], 'bv*+ba/b');

        const jsIdx = normalized.indexOf('--js-runtimes');
        assert.notEqual(jsIdx, -1);
        assert.ok(normalized[jsIdx + 1].startsWith('node:'));
    });
});
