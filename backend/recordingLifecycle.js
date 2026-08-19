const path = require('path');
const fs = require('fs');

/**
 * Asynchronously stops a child process and waits for 'close' or 'exit' event.
 * Avoids any open file descriptor leaks from unclosed processes.
 *
 * @param {import('child_process').ChildProcess} proc
 * @param {Object} [options]
 * @param {string} [options.signal='SIGTERM']
 * @param {number} [options.timeoutMs=5000]
 * @param {boolean} [options.gracefulStdin=false]
 * @returns {Promise<void>}
 */
async function stopChildAndWait(proc, {
    signal = 'SIGTERM',
    timeoutMs = 5000,
    gracefulStdin = false,
} = {}) {
    if (!proc) return false;

    // Check if already dead
    if (proc.exitCode !== null || proc.signalCode !== null || (proc.killed && proc.exitCode !== null)) {
        return true;
    }

    await new Promise(resolve => {
        let done = false;
        let forceKillTimer = null;
        let finalTimer = null;

        const finish = () => {
            if (done) return;
            done = true;
            if (forceKillTimer) clearTimeout(forceKillTimer);
            if (finalTimer) clearTimeout(finalTimer);
            resolve();
        };

        proc.once('close', finish);
        proc.once('exit', finish);

        try {
            if (gracefulStdin && proc.stdin && proc.stdin.writable && !proc.stdin.destroyed) {
                try {
                    proc.stdin.write('q\n');
                    proc.stdin.end();
                } catch (_) {}
            } else {
                proc.kill(signal);
            }
        } catch (_) {
            finish();
            return;
        }

        // Bounded fallback: if process hasn't exited within timeoutMs, send SIGKILL
        forceKillTimer = setTimeout(() => {
            try {
                if (proc.exitCode === null && proc.signalCode === null) {
                    proc.kill('SIGKILL');
                }
            } catch (_) {}

            // Allow short time for OS to process SIGKILL
            finalTimer = setTimeout(finish, 250);
            if (finalTimer.unref) finalTimer.unref();
        }, timeoutMs);

        if (forceKillTimer.unref) forceKillTimer.unref();
    });

    return true;
}

// ----------------------------------------------------
// REGISTRIES
// ----------------------------------------------------

// key (recId / normalizedPath) -> Set<{ id, proc, res, req, filePath }>
const recordingPreviewProcesses = new Map();

// key (recId / normalizedPath) -> Set<{ id, proc, res, req, filePath, tempPath }>
const recordingThumbnailProcesses = new Map();

// normalizedFilePath -> Set<{ res, req, fileStream }>
const recordingHttpReaders = new Map();

// Set of recording IDs and normalized file paths undergoing deletion
const deletingRecordings = new Set();

// ----------------------------------------------------
// DELETION LOCKS
// ----------------------------------------------------

function normalizePath(p) {
    return p ? path.resolve(p) : null;
}

function isRecordingLocked(recordingId, filePath) {
    if (recordingId != null && deletingRecordings.has(String(recordingId))) {
        return true;
    }
    const norm = normalizePath(filePath);
    if (norm && deletingRecordings.has(norm)) {
        return true;
    }
    return false;
}

function acquireDeletionLock(recordingId, filePath) {
    const idKey = recordingId != null ? String(recordingId) : null;
    const norm = normalizePath(filePath);

    if (idKey && deletingRecordings.has(idKey)) return false;
    if (norm && deletingRecordings.has(norm)) return false;

    if (idKey) deletingRecordings.add(idKey);
    if (norm) deletingRecordings.add(norm);
    return true;
}

function releaseDeletionLock(recordingId, filePath) {
    const idKey = recordingId != null ? String(recordingId) : null;
    const norm = normalizePath(filePath);

    if (idKey) deletingRecordings.delete(idKey);
    if (norm) deletingRecordings.delete(norm);
}

// ----------------------------------------------------
// PREVIEW PROCESS REGISTRATION & SHUTDOWN
// ----------------------------------------------------

function registerRecordingPreview(key, entry) {
    const normKey = String(key);
    if (!recordingPreviewProcesses.has(normKey)) {
        recordingPreviewProcesses.set(normKey, new Set());
    }
    const set = recordingPreviewProcesses.get(normKey);
    set.add(entry);

    let removed = false;
    return () => {
        if (removed) return;
        removed = true;
        set.delete(entry);
        if (set.size === 0) {
            recordingPreviewProcesses.delete(normKey);
        }
    };
}

async function stopRecordingPreviews(recordingId = null, filePath = null) {
    const normTarget = normalizePath(filePath);
    const targetIdStr = recordingId != null ? String(recordingId) : null;

    const promises = [];

    for (const [key, entries] of recordingPreviewProcesses.entries()) {
        for (const entry of Array.from(entries)) {
            const matchesId = targetIdStr && (String(entry.id) === targetIdStr || key === targetIdStr);
            const matchesPath = normTarget && entry.filePath && (normalizePath(entry.filePath) === normTarget || key === normTarget);
            const matchAll = !targetIdStr && !normTarget;

            if (matchAll || matchesId || matchesPath) {
                entries.delete(entry);
                promises.push((async () => {
                    try {
                        if (entry.res && !entry.res.writableEnded) {
                            try { entry.proc?.stdout?.unpipe?.(entry.res); } catch (_) {}
                            entry.res.end();
                        }
                        if (entry.proc) {
                            await stopChildAndWait(entry.proc, { signal: 'SIGTERM', timeoutMs: 3000 });
                        }
                    } catch (_) {}
                })());
            }
        }
        if (entries.size === 0) {
            recordingPreviewProcesses.delete(key);
        }
    }

    await Promise.all(promises);
}

// ----------------------------------------------------
// THUMBNAIL PROCESS REGISTRATION & SHUTDOWN
// ----------------------------------------------------

function registerRecordingThumbnail(key, entry) {
    const normKey = String(key);
    if (!recordingThumbnailProcesses.has(normKey)) {
        recordingThumbnailProcesses.set(normKey, new Set());
    }
    const set = recordingThumbnailProcesses.get(normKey);
    set.add(entry);

    let removed = false;
    return () => {
        if (removed) return;
        removed = true;
        set.delete(entry);
        if (set.size === 0) {
            recordingThumbnailProcesses.delete(normKey);
        }
    };
}

async function stopRecordingThumbnails(recordingId = null, filePath = null) {
    const normTarget = normalizePath(filePath);
    const targetIdStr = recordingId != null ? String(recordingId) : null;

    const promises = [];

    for (const [key, entries] of recordingThumbnailProcesses.entries()) {
        for (const entry of Array.from(entries)) {
            const matchesId = targetIdStr && (String(entry.id) === targetIdStr || key === targetIdStr);
            const matchesPath = normTarget && entry.filePath && (normalizePath(entry.filePath) === normTarget || key === normTarget);
            const matchAll = !targetIdStr && !normTarget;

            if (matchAll || matchesId || matchesPath) {
                entries.delete(entry);
                promises.push((async () => {
                    try {
                        if (entry.res && !entry.res.writableEnded) {
                            try {
                                if (typeof entry.res.status === 'function') {
                                    entry.res.status(404).end();
                                } else if (typeof entry.res.end === 'function') {
                                    entry.res.end();
                                }
                            } catch (_) {}
                        }
                        if (entry.proc) {
                            await stopChildAndWait(entry.proc, { signal: 'SIGTERM', timeoutMs: 2000 });
                        }
                        if (entry.tempPath && fs.existsSync(entry.tempPath)) {
                            try { fs.unlinkSync(entry.tempPath); } catch (_) {}
                        }
                    } catch (_) {}
                })());
            }
        }
        if (entries.size === 0) {
            recordingThumbnailProcesses.delete(key);
        }
    }

    await Promise.all(promises);
}

// ----------------------------------------------------
// HTTP READERS REGISTRATION & CLOSING
// ----------------------------------------------------

function registerRecordingHttpReader(filePath, entry) {
    const norm = normalizePath(filePath);
    if (!norm) return () => {};

    if (!recordingHttpReaders.has(norm)) {
        recordingHttpReaders.set(norm, new Set());
    }
    const set = recordingHttpReaders.get(norm);
    set.add(entry);

    let removed = false;
    return () => {
        if (removed) return;
        removed = true;
        set.delete(entry);
        if (set.size === 0) {
            recordingHttpReaders.delete(norm);
        }
    };
}

async function closeRecordingHttpReaders(filePath = null) {
    const normTarget = normalizePath(filePath);

    const promises = [];

    for (const [p, entries] of recordingHttpReaders.entries()) {
        if (!normTarget || p === normTarget) {
            for (const entry of Array.from(entries)) {
                entries.delete(entry);
                promises.push(new Promise(resolve => {
                    let resolved = false;
                    const done = () => {
                        if (resolved) return;
                        resolved = true;
                        resolve();
                    };

                    const timer = setTimeout(done, 1000);
                    if (timer.unref) timer.unref();

                    if (entry.fileStream) {
                        entry.fileStream.once('close', done);
                        try {
                            entry.fileStream.destroy();
                        } catch (_) {
                            done();
                        }
                    } else {
                        done();
                    }

                    if (entry.res && !entry.res.writableEnded) {
                        try { entry.res.destroy(); } catch (_) {}
                    }
                }));
            }
            if (entries.size === 0) {
                recordingHttpReaders.delete(p);
            }
        }
    }

    await Promise.all(promises);
}

module.exports = {
    stopChildAndWait,
    recordingPreviewProcesses,
    recordingThumbnailProcesses,
    recordingHttpReaders,
    deletingRecordings,
    isRecordingLocked,
    acquireDeletionLock,
    releaseDeletionLock,
    registerRecordingPreview,
    stopRecordingPreviews,
    registerRecordingThumbnail,
    stopRecordingThumbnails,
    registerRecordingHttpReader,
    closeRecordingHttpReaders,
    normalizePath,
};
