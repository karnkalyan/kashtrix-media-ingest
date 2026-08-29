const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    ensureInfiniteVodLoop,
    repairPrefixedVodInput,
    resolveChannelInputPath,
} = require('./channelInputPaths');

test('adds infinite input looping to a legacy VOD command', () => {
    assert.deepEqual(
        ensureInfiniteVodLoop(['-hide_banner', '-re', '-i', 'media/vod/movie.mp4', '-map', '0']),
        ['-hide_banner', '-re', '-stream_loop', '-1', '-i', 'media/vod/movie.mp4', '-map', '0'],
    );
});

test('forces an existing finite VOD loop to remain continuous', () => {
    assert.deepEqual(
        ensureInfiniteVodLoop(['-stream_loop', '2', '-re', '-i', 'movie.mp4']),
        ['-stream_loop', '-1', '-re', '-i', 'movie.mp4'],
    );
});

test('removes media/vod prefix from an absolute Windows recording path', () => {
    const recording = 'C:\\Users\\operator\\streamops\\media\\recordings\\capture.mxf';
    assert.equal(repairPrefixedVodInput(`media/vod/${recording}`), recording);
});

test('removes media/vod prefix from managed recording paths without changing VOD filenames', () => {
    assert.equal(
        repairPrefixedVodInput('media/vod/media/recordings/capture.mp4'),
        'media/recordings/capture.mp4',
    );
    assert.equal(repairPrefixedVodInput('media/vod/movie.mp4'), 'media/vod/movie.mp4');
});

test('resolves managed recording paths from the configured media root', () => {
    const mediaRoot = path.join(path.parse(process.cwd()).root, 'test-media-root');
    const expected = path.join(mediaRoot, 'recordings', 'capture.mxf');
    const resolved = resolveChannelInputPath('media/recordings/capture.mxf', {
        projectRoot: path.join(path.parse(process.cwd()).root, 'test-project'),
        mediaRoot,
        serverDir: path.join(path.parse(process.cwd()).root, 'test-server'),
        existsSync: candidate => candidate === expected,
    });
    assert.equal(resolved, expected);
});

test('repairs and preserves an existing absolute recording path', () => {
    const recording = 'C:\\Recordings\\capture.mxf';
    const resolved = resolveChannelInputPath(`media/vod/${recording}`, {
        existsSync: candidate => candidate === recording,
    });
    assert.equal(resolved, recording);
});
