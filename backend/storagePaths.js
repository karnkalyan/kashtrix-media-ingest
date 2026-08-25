const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_RECORDINGS_SETTING = 'media/recordings';
const MEDIA_ROOT = path.join(PROJECT_ROOT, 'media');
const RECORDINGS_DIR = path.join(MEDIA_ROOT, 'recordings');

const toForwardSlashes = value => String(value || '').replace(/\\/g, '/');

/**
 * Keep the project media directory portable. Older clients submitted
 * /media/recordings, which Windows resolves to C:\media\recordings. Treat the
 * root-media spellings as project aliases while retaining deliberately chosen
 * absolute destinations on other drives or network shares.
 */
const normalizeLocalStorageSetting = (value = PROJECT_RECORDINGS_SETTING) => {
    const raw = String(value || '').trim();
    if (!raw) return PROJECT_RECORDINGS_SETTING;

    const forward = toForwardSlashes(raw);
    const projectMediaMatch = forward.match(/^(?:[a-z]:)?\/?media(?:\/(.*))?$/i);
    if (projectMediaMatch) {
        const suffix = String(projectMediaMatch[1] || '').replace(/^\/+|\/+$/g, '');
        return suffix ? `media/${suffix}` : 'media';
    }

    const dotRelative = forward.replace(/^\.\//, '');
    if (!path.isAbsolute(raw) && !path.win32.isAbsolute(raw)) {
        const resolved = path.resolve(PROJECT_ROOT, dotRelative);
        const relative = path.relative(PROJECT_ROOT, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Relative local recording destination must remain inside the project');
        }
        return dotRelative.replace(/^\/+|\/+$/g, '') || PROJECT_RECORDINGS_SETTING;
    }

    return path.normalize(raw);
};

const resolveLocalStoragePath = (value = PROJECT_RECORDINGS_SETTING) => {
    const setting = normalizeLocalStorageSetting(value);
    if (path.isAbsolute(setting) || path.win32.isAbsolute(setting)) {
        return path.normalize(setting);
    }
    return path.resolve(PROJECT_ROOT, setting);
};

module.exports = {
    PROJECT_ROOT,
    PROJECT_RECORDINGS_SETTING,
    MEDIA_ROOT,
    RECORDINGS_DIR,
    normalizeLocalStorageSetting,
    resolveLocalStoragePath,
};
