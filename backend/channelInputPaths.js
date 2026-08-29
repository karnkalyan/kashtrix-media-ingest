const fs = require('fs');
const path = require('path');

const MANAGED_MEDIA_PATH = /^(?:\.\.?[\\/])?media[\\/](vod|recordings)[\\/](.+)$/i;

const isAbsoluteOnAnyPlatform = (value) => (
    path.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[/\\]{2}[^/\\]/.test(value)
);

/**
 * Repair commands produced by older clients that prepended media/vod to an
 * already complete recording path.
 */
const repairPrefixedVodInput = (inputValue) => {
    let value = String(inputValue || '').trim();

    // Repeat once more when an old command contains media/vod/media/vod/...
    // while preserving a legitimate media/vod/<file> relative path.
    for (let pass = 0; pass < 3; pass += 1) {
        const match = value.match(/^(?:\.\.?[\\/])?media[\\/]vod[\\/](.+)$/i);
        if (!match) break;
        const remainder = match[1];
        if (
            isAbsoluteOnAnyPlatform(remainder)
            || /^(?:\.\.?[\\/])?media[\\/](?:vod|recordings)[\\/]/i.test(remainder)
        ) {
            value = remainder;
            continue;
        }
        break;
    }

    return value;
};

const ensureInfiniteVodLoop = (inputArgs) => {
    const args = Array.isArray(inputArgs) ? [...inputArgs] : [];
    const inputIndex = args.indexOf('-i');
    if (inputIndex === -1) return args;

    const streamLoopIndex = args.slice(0, inputIndex).lastIndexOf('-stream_loop');
    if (streamLoopIndex !== -1) {
        if (streamLoopIndex + 1 < args.length) args[streamLoopIndex + 1] = '-1';
        return args;
    }

    args.splice(inputIndex, 0, '-stream_loop', '-1');
    return args;
};

const resolveChannelInputPath = (inputValue, options = {}) => {
    const existsSync = options.existsSync || fs.existsSync;
    const projectRoot = options.projectRoot || process.cwd();
    const mediaRoot = options.mediaRoot || path.join(projectRoot, 'media');
    const serverDir = options.serverDir || __dirname;
    const repaired = repairPrefixedVodInput(inputValue);

    if (!repaired || /^[a-z][a-z0-9+.-]*:\/\//i.test(repaired) || repaired === 'pipe:0') {
        return repaired;
    }
    if (existsSync(repaired)) return repaired;

    const candidates = [];
    const managedMatch = repaired.match(MANAGED_MEDIA_PATH);
    if (managedMatch) {
        const mediaType = managedMatch[1].toLowerCase();
        const relativeFile = managedMatch[2].replace(/[\\/]+/g, path.sep);
        candidates.push(
            path.join(mediaRoot, mediaType, relativeFile),
            path.join(projectRoot, 'media', mediaType, relativeFile),
            path.join(serverDir, 'media', mediaType, relativeFile),
        );
    }

    // Keep compatibility with legacy commands that stored only the filename.
    const baseName = repaired.split(/[\\/]/).pop();
    if (baseName) {
        for (const mediaType of ['vod', 'recordings']) {
            candidates.push(
                path.join(mediaRoot, mediaType, baseName),
                path.join(projectRoot, 'media', mediaType, baseName),
                path.join(serverDir, 'media', mediaType, baseName),
            );
        }
    }

    return [...new Set(candidates)].find(candidate => existsSync(candidate)) || repaired;
};

module.exports = {
    ensureInfiniteVodLoop,
    repairPrefixedVodInput,
    resolveChannelInputPath,
};
