'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecordingHlsArgs, isInterlacedVideo, parseFrameRate } = require('./recordingPreview');

const valueAfter = (args, option) => args[args.indexOf(option) + 1];
const build = (info = {}, options = {}) => buildRecordingHlsArgs(
    '/media/recordings/capture.mxf',
    '/media/cache/index.m3u8',
    '/media/cache/segment-%06d.ts',
    info,
    options,
);

test('MXF MPEG-2 preview becomes segmented browser HLS with deinterlacing', () => {
    const args = build({
        codecName: 'mpeg2video', fieldOrder: 'tt', width: 1920, height: 1080, frameRate: '25/1',
    }, { baseUrl: '/recording-preview/895/session/' });
    assert.equal(isInterlacedVideo({ fieldOrder: 'tt' }), true);
    assert.equal(valueAfter(args, '-c:v'), 'libx264');
    assert.match(valueAfter(args, '-vf'), /^scale=w=1280:h=-2:flags=fast_bilinear:interl=1,setfield=tff,yadif=mode=send_frame_nospatial:parity=tff/);
    assert.equal(valueAfter(args, '-f'), 'hls');
    assert.equal(valueAfter(args, '-hls_time'), '1');
    assert.equal(valueAfter(args, '-hls_playlist_type'), 'event');
    assert.equal(valueAfter(args, '-hls_segment_filename'), '/media/cache/segment-%06d.ts');
    assert.equal(valueAfter(args, '-hls_base_url'), '/recording-preview/895/session/');
    assert.equal(args.at(-1), '/media/cache/index.m3u8');
});

test('progressive sources are encoded with deterministic HLS keyframes', () => {
    const args = build({ codecName: 'h264', fieldOrder: 'progressive', width: 1280, frameRate: '30000/1001' });
    assert.equal(valueAfter(args, '-c:v'), 'libx264');
    assert.equal(valueAfter(args, '-g'), '30');
    assert.equal(valueAfter(args, '-keyint_min'), '30');
    assert.equal(valueAfter(args, '-fps_mode'), 'passthrough');
    assert.equal(valueAfter(args, '-vf'), 'setsar=1');
});

test('bottom-field-first recordings preserve bottom parity', () => {
    const args = build({ codecName: 'v210', fieldOrder: 'bb', width: 1920, frameRate: '50/1' });
    assert.match(valueAfter(args, '-vf'), /setfield=bff,yadif=mode=send_frame_nospatial:parity=bff/);
    assert.equal(valueAfter(args, '-g'), '50');
});

test('frame-rate parser handles broadcast rational rates', () => {
    assert.ok(Math.abs(parseFrameRate('30000/1001') - 29.97003) < 0.0001);
    assert.equal(parseFrameRate('25/1'), 25);
    assert.equal(parseFrameRate('invalid'), 25);
});
