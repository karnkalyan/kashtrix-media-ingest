'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildRecordingProfileArgs,
    getRecordingProfile,
} = require('./recordingProfiles');

const valueAfter = (args, option) => args[args.indexOf(option) + 1];

test('recording extensions resolve to complete compatible profiles', () => {
    assert.equal(getRecordingProfile('.mov').videoCodec, 'v210');
    assert.equal(getRecordingProfile('mkv').muxer, 'matroska');
    assert.equal(getRecordingProfile('mxf').videoCodec, 'mpeg2video');
    assert.equal(getRecordingProfile('mp4').videoCodec, 'h264');
    assert.equal(getRecordingProfile('flv').videoBitrate, '12M');
    assert.throws(() => getRecordingProfile('avi'), /Unsupported recording format/);
});

test('MXF uses MPEG-2 4:2:2 50 Mbps interlaced with PCM 8-channel audio', () => {
    const args = buildRecordingProfileArgs('mxf', 'capture.mxf');
    assert.equal(valueAfter(args, '-c:v'), 'mpeg2video');
    assert.equal(valueAfter(args, '-pix_fmt'), 'yuv422p');
    assert.equal(valueAfter(args, '-b:v'), '50M');
    assert.equal(valueAfter(args, '-flags'), '+ildct+ilme');
    assert.equal(args.includes('-top'), false);
    assert.equal(valueAfter(args, '-vf'), 'fps=25:round=near,setfield=tff');
    assert.equal(valueAfter(args, '-dc'), '10');
    assert.equal(valueAfter(args, '-intra_vlc'), '1');
    assert.equal(valueAfter(args, '-non_linear_quant'), '1');
    assert.equal(valueAfter(args, '-qmax'), '12');
    assert.equal(valueAfter(args, '-vtag'), 'xd5c');
    assert.equal(valueAfter(args, '-c:a'), 'pcm_s24le');
    assert.equal(valueAfter(args, '-ac'), '8');
    assert.equal(valueAfter(args, '-f'), 'mxf');
});

test('fractional broadcast rates use exact FFmpeg time bases', () => {
    const args = buildRecordingProfileArgs('mxf', 'capture.mxf', {
        unlockStandardOverride: true,
        framerate: 29.97,
    });
    assert.equal(valueAfter(args, '-r'), '30000/1001');
    assert.equal(valueAfter(args, '-vf'), 'fps=30000/1001:round=near,setfield=tff');
});

test('explicit source-native frame rate does not force output cadence', () => {
    const args = buildRecordingProfileArgs('mxf', 'capture.mxf', {
        unlockStandardOverride: true,
        framerate: 0,
    });
    assert.equal(args.includes('-r'), false);
    assert.equal(valueAfter(args, '-vf'), 'setfield=tff');
});

test('MOV and MKV use V210 10-bit 4:2:2 with 24-bit 8-channel PCM', () => {
    for (const extension of ['mov', 'mkv']) {
        const args = buildRecordingProfileArgs(extension, `capture.${extension}`);
        assert.equal(valueAfter(args, '-c:v'), 'v210');
        assert.equal(valueAfter(args, '-pix_fmt'), 'yuv422p10le');
        assert.equal(valueAfter(args, '-field_order'), 'tt');
        assert.equal(valueAfter(args, '-c:a'), 'pcm_s24le');
        assert.equal(valueAfter(args, '-ar'), '48000');
        assert.equal(valueAfter(args, '-ac'), '8');
        assert.equal(valueAfter(args, '-f'), extension === 'mkv' ? 'matroska' : 'mov');
    }
});

test('profile overrides keep CBR video rates internally consistent', () => {
    const args = buildRecordingProfileArgs('mp4', 'capture.mp4', {
        encoder: 'cpu',
        profileOverrides: { videoBitrate: 18000 },
        deinterlaceCompressed: true,
    });
    assert.equal(valueAfter(args, '-b:v'), '18000k');
    assert.equal(valueAfter(args, '-maxrate'), '18000k');
    assert.equal(valueAfter(args, '-bufsize'), '36000k');
});

test('MP4 and FLV can use the 1080p50 bwdif NVENC fallback', () => {
    for (const extension of ['mp4', 'flv']) {
        const args = buildRecordingProfileArgs(extension, `capture.${extension}`, { encoder: 'nvidia', deinterlaceCompressed: true });
        assert.match(valueAfter(args, '-vf'), /^bwdif=mode=send_field:parity=tff:deint=all/);
        assert.equal(valueAfter(args, '-r'), '50');
        assert.equal(valueAfter(args, '-c:v'), 'h264_nvenc');
        assert.equal(args.includes('-top'), false);
    }
});

test('native interlaced NVENC keeps 25 fps TFF when supported', () => {
    const args = buildRecordingProfileArgs('mp4', 'capture.mp4', { encoder: 'nvidia', deinterlaceCompressed: false });
    assert.equal(args.includes('-vf'), false);
    assert.equal(valueAfter(args, '-r'), '25');
    assert.equal(valueAfter(args, '-flags'), '+ildct');
    assert.equal(valueAfter(args, '-top'), '1');
});

test('MP4 supports CPU, Intel, AMD, and NVIDIA H.264 encoding', () => {
    const expected = {
        cpu: 'libx264',
        intel: 'h264_qsv',
        amd: 'h264_amf',
        nvidia: 'h264_nvenc',
    };
    for (const [encoder, codec] of Object.entries(expected)) {
        const args = buildRecordingProfileArgs('mp4', 'capture.mp4', { encoder, videoCodec: 'h264', deinterlaceCompressed: encoder !== 'cpu' });
        assert.equal(valueAfter(args, '-c:v'), codec);
    }
});

test('MP4 supports HEVC while FLV remains H.264 compatible', () => {
    const mp4 = buildRecordingProfileArgs('mp4', 'capture.mp4', { encoder: 'cpu', videoCodec: 'hevc', deinterlaceCompressed: true });
    const flv = buildRecordingProfileArgs('flv', 'capture.flv', { encoder: 'cpu', videoCodec: 'hevc', deinterlaceCompressed: true });
    assert.equal(valueAfter(mp4, '-c:v'), 'libx265');
    assert.equal(valueAfter(flv, '-c:v'), 'libx264');
});

test('MXF parameters can be customized when unlockStandardOverride or profileOverrides is provided', () => {
    const args = buildRecordingProfileArgs('mxf', 'capture.mxf', {
        unlockStandardOverride: true,
        videoBitrate: 35000,
        maxBitrate: 40000,
        resolution: '1280x720',
        framerate: 50,
        audioCodec: 'pcm_s16le',
        audioChannels: 2,
        sampleRate: 44100,
    });
    assert.equal(valueAfter(args, '-b:v'), '35000k');
    assert.equal(valueAfter(args, '-maxrate'), '40000k');
    assert.equal(valueAfter(args, '-s'), '1280x720');
    assert.equal(valueAfter(args, '-r'), '50');
    assert.equal(valueAfter(args, '-c:a'), 'pcm_s16le');
    assert.equal(valueAfter(args, '-ac'), '2');
    assert.equal(valueAfter(args, '-ar'), '44100');
    assert.equal(valueAfter(args, '-f'), 'mxf');
});
