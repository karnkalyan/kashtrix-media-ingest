const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeckLink } = require('./getDevices');

test('parses FFmpeg 8 DeckLink display names instead of internal handles', () => {
    const output = `ffmpeg version 8.0 Copyright (c) 2000-2025 the FFmpeg developers
  built with gcc 13 (Debian 13.3.0-16)
Auto-detected sources for decklink:
  75:05326625:00000000 [DeckLink Duo 2 (1)] (video, audio)
  75:05326625:00000001 [DeckLink Duo 2 (2)] (video, audio)
  75:05326625:00000002 [DeckLink Duo 2 (3)] (video, audio)
  75:05326625:00000003 [DeckLink Duo 2 (4)] (video, audio)
`;

    assert.deepEqual(parseDeckLink(output), {
        video: [
            'DeckLink Duo 2 (1)',
            'DeckLink Duo 2 (2)',
            'DeckLink Duo 2 (3)',
            'DeckLink Duo 2 (4)',
        ],
        audio: [
            'DeckLink Duo 2 (1)',
            'DeckLink Duo 2 (2)',
            'DeckLink Duo 2 (3)',
            'DeckLink Duo 2 (4)',
        ],
    });
});

test('handles the default marker and ignores unrelated FFmpeg log lines', () => {
    const output = `[decklink @ 0x55b88d233a40] Loaded DeckLink configuration
Auto-detected sources for decklink:\r
 * 75:05326625:00000000 [DeckLink 8K Pro (1)] (video, audio)\r
   75:05326625:00000001 [DeckLink 8K Pro (2)] (video, audio)\r
[in#0 @ 0x57284ff83c80] Error opening input: Input/output error
Error opening input file 75:05326625:00000000.
75:05326625:00000002 [not a source row]
ffmpeg version 8.0
`;

    assert.deepEqual(parseDeckLink(output), {
        video: ['DeckLink 8K Pro (1)', 'DeckLink 8K Pro (2)'],
        audio: ['DeckLink 8K Pro (1)', 'DeckLink 8K Pro (2)'],
    });
});

test('does not parse device-shaped text without the DeckLink sources header', () => {
    const output = `Auto-detected sources for dshow:
 * 75:05326625:00000000 [DeckLink Duo 2 (1)] (video, audio)
`;

    assert.deepEqual(parseDeckLink(output), { video: [], audio: [] });
});
