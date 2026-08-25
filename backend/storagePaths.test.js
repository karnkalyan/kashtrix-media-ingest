const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    PROJECT_ROOT,
    PROJECT_RECORDINGS_SETTING,
    RECORDINGS_DIR,
    normalizeLocalStorageSetting,
    resolveLocalStoragePath,
} = require('./storagePaths');

test('project recording aliases never resolve to a drive-root media directory', () => {
    for (const input of [undefined, '', 'media/recordings', './media/recordings', '/media/recordings', 'C:/media/recordings']) {
        assert.equal(resolveLocalStoragePath(input), RECORDINGS_DIR);
    }
    assert.equal(normalizeLocalStorageSetting('/media/recordings'), PROJECT_RECORDINGS_SETTING);
});

test('relative recording destinations resolve from the application project root', () => {
    assert.equal(
        resolveLocalStoragePath('media/recordings/archive'),
        path.join(PROJECT_ROOT, 'media', 'recordings', 'archive'),
    );
});

test('relative recording destinations cannot escape the project', () => {
    assert.throws(
        () => resolveLocalStoragePath('../outside-recordings'),
        /must remain inside the project/,
    );
});

test('deliberate absolute destinations outside drive-root media remain supported', () => {
    const external = path.join(path.parse(PROJECT_ROOT).root, 'recording-archive');
    assert.equal(resolveLocalStoragePath(external), path.normalize(external));
});
