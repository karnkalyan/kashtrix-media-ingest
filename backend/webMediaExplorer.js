const fs = require('fs');
const path = require('path');
const { MEDIA_ROOT } = require('./storagePaths');

/**
 * Format bytes into human readable format (KB, MB, GB)
 */
const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Get MIME content type based on file extension
 */
const getContentType = (ext) => {
    const map = {
        '.mp4': 'video/mp4',
        '.ts': 'video/mp2t',
        '.mxf': 'application/mxf',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.flv': 'video/x-flv',
        '.avi': 'video/x-msvideo',
        '.m3u8': 'application/x-mpegURL',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.json': 'application/json',
        '.log': 'text/plain',
        '.txt': 'text/plain',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
};

/**
 * Render the HTML Web Media Explorer
 */
const renderExplorerHtml = ({ currentPath, breadcrumbs, items, totalFiles, totalSize, reqHost }) => {
    const itemsHtml = items.map((item) => {
        const icon = item.isDirectory
            ? `<svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>`
            : item.isVideo
            ? `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`
            : `<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;

        const playBtn = item.isVideo
            ? `<button onclick="playVideo('${item.url}', '${item.name}')" class="px-2.5 py-1 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow transition-colors flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Play</span>
               </button>`
            : '';

        const downloadBtn = !item.isDirectory
            ? `<a href="${item.url}?download=1" download class="px-2.5 py-1 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                <span>Download</span>
               </a>`
            : '';

        return `
            <tr class="hover:bg-purple-950/20 border-b border-purple-900/20 transition-colors">
                <td class="py-3 px-4 flex items-center gap-3">
                    ${icon}
                    ${item.isDirectory 
                        ? `<a href="${item.url}" class="font-bold text-purple-300 hover:text-purple-200 hover:underline">${item.name}</a>`
                        : `<a href="${item.url}" target="_blank" class="font-medium text-slate-200 hover:text-white">${item.name}</a>`
                    }
                </td>
                <td class="py-3 px-4 text-xs font-mono text-slate-400">${item.sizeFormatted}</td>
                <td class="py-3 px-4 text-xs text-slate-400">${item.modifiedFormatted}</td>
                <td class="py-3 px-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        ${playBtn}
                        ${downloadBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const breadcrumbsHtml = breadcrumbs.map((b, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return isLast
            ? `<span class="text-purple-300 font-bold">${b.name}</span>`
            : `<a href="${b.url}" class="text-slate-400 hover:text-white">${b.name}</a> <span class="text-slate-600">/</span>`;
    }).join(' ');

    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kashtrix StreamOps - Web Media Explorer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0f071b; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
    </style>
</head>
<body class="min-h-screen p-4 sm:p-8">
    <div class="max-w-6xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#190e28] border border-[#311b4e] p-6 rounded-2xl shadow-xl">
            <div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white font-black text-xl shadow-lg">
                        K
                    </div>
                    <div>
                        <h1 class="text-xl font-black tracking-tight text-white flex items-center gap-2">
                            <span>Kashtrix StreamOps</span>
                            <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-700">Web Media Explorer</span>
                        </h1>
                        <p class="text-xs text-purple-300/70">Host Storage &amp; Recording Archive Browser (${reqHost})</p>
                    </div>
                </div>
            </div>

            <div class="flex items-center gap-3">
                <a href="/" class="px-3.5 py-1.5 text-xs font-bold bg-[#26143d] hover:bg-[#341b54] text-purple-200 border border-purple-800 rounded-xl transition-all flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    <span>Back to StreamOps</span>
                </a>
            </div>
        </div>

        <!-- Breadcrumb & Stats Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#190e28]/80 border border-[#311b4e] px-5 py-3 rounded-xl text-xs">
            <div class="flex items-center gap-2 font-mono overflow-x-auto">
                <span class="text-purple-400 font-bold">Location:</span>
                ${breadcrumbsHtml}
            </div>
            <div class="flex items-center gap-4 text-slate-400 shrink-0 font-mono">
                <span>Items: <strong class="text-white">${totalFiles}</strong></span>
                <span>Total: <strong class="text-purple-300">${formatBytes(totalSize)}</strong></span>
            </div>
        </div>

        <!-- File Table -->
        <div class="bg-[#190e28] border border-[#311b4e] rounded-2xl overflow-hidden shadow-2xl">
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr class="bg-[#211335] text-[11px] font-bold uppercase tracking-wider text-purple-300/80 border-b border-[#311b4e]">
                            <th class="py-3 px-4">Name</th>
                            <th class="py-3 px-4">Size</th>
                            <th class="py-3 px-4">Date Modified</th>
                            <th class="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml.length > 0 ? itemsHtml : `
                            <tr>
                                <td colspan="4" class="py-12 text-center text-slate-500">
                                    This directory is currently empty.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Video Player Modal -->
    <div id="videoModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-[#190e28] border border-[#311b4e] rounded-2xl max-w-4xl w-full p-4 space-y-3 shadow-2xl">
            <div class="flex items-center justify-between border-b border-[#311b4e] pb-2">
                <h3 id="videoModalTitle" class="font-bold text-white text-sm truncate">Video Player</h3>
                <button onclick="closeVideo()" class="text-slate-400 hover:text-white p-1 rounded-lg">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                <video id="activeVideoPlayer" controls class="w-full h-full" preload="metadata"></video>
            </div>
            <div class="flex justify-end gap-2 pt-1">
                <a id="videoDownloadBtn" href="#" download class="px-3 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                    Download File
                </a>
            </div>
        </div>
    </div>

    <script>
        function playVideo(url, name) {
            const modal = document.getElementById('videoModal');
            const video = document.getElementById('activeVideoPlayer');
            const title = document.getElementById('videoModalTitle');
            const downloadBtn = document.getElementById('videoDownloadBtn');

            title.innerText = name;
            video.src = url;
            downloadBtn.href = url + '?download=1';
            modal.classList.remove('hidden');
            video.play().catch(() => {});
        }

        function closeVideo() {
            const modal = document.getElementById('videoModal');
            const video = document.getElementById('activeVideoPlayer');
            video.pause();
            video.src = '';
            modal.classList.add('hidden');
        }
    </script>
</body>
</html>`;
};

/**
 * Middleware / Handler for Web Media Explorer
 */
const createMediaExplorerMiddleware = () => {
    return (req, res, next) => {
        // Strip query string and decode URL
        const reqPath = decodeURIComponent(req.path || '/');
        const isRootMedia = req.baseUrl === '/media' || req.originalUrl.startsWith('/media');
        
        // Resolve absolute filesystem path inside MEDIA_ROOT
        let relativeSubPath = reqPath.replace(/^\//, '');
        const targetFsPath = path.normalize(path.join(MEDIA_ROOT, relativeSubPath));

        // Prevent path traversal outside MEDIA_ROOT
        if (!targetFsPath.startsWith(path.normalize(MEDIA_ROOT))) {
            return res.status(403).send('Forbidden: Path traversal prohibited.');
        }

        // If path doesn't exist
        if (!fs.existsSync(targetFsPath)) {
            return next();
        }

        const stat = fs.statSync(targetFsPath);

        // If it's a file
        if (stat.isFile()) {
            // Force download if requested
            if (req.query.download === '1') {
                res.setHeader('Content-Disposition', `attachment; filename="${path.basename(targetFsPath)}"`);
            }
            const ext = path.extname(targetFsPath);
            res.setHeader('Content-Type', getContentType(ext));
            return res.sendFile(targetFsPath);
        }

        // If it's a directory
        if (stat.isDirectory()) {
            // Ensure trailing slash for relative URLs
            if (!req.originalUrl.endsWith('/') && !req.originalUrl.includes('?')) {
                return res.redirect(301, req.originalUrl + '/');
            }

            try {
                const entries = fs.readdirSync(targetFsPath, { withFileTypes: true });
                let totalSize = 0;
                let totalFiles = 0;

                const items = entries.map((entry) => {
                    const entryPath = path.join(targetFsPath, entry.name);
                    let itemStat = { size: 0, mtime: new Date() };
                    try {
                        itemStat = fs.statSync(entryPath);
                    } catch (_) {}

                    const isDir = entry.isDirectory();
                    if (!isDir) {
                        totalSize += itemStat.size;
                        totalFiles++;
                    }

                    const ext = path.extname(entry.name).toLowerCase();
                    const isVideo = ['.mp4', '.ts', '.mxf', '.mov', '.mkv', '.flv'].includes(ext);

                    // Build relative URL
                    const itemUrl = path.posix.join('/media', relativeSubPath, entry.name) + (isDir ? '/' : '');

                    return {
                        name: entry.name,
                        isDirectory: isDir,
                        isVideo,
                        size: itemStat.size,
                        sizeFormatted: isDir ? '-' : formatBytes(itemStat.size),
                        modified: itemStat.mtime,
                        modifiedFormatted: itemStat.mtime.toLocaleString(),
                        url: itemUrl,
                    };
                });

                // Sort directories first, then alphabetically
                items.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });

                // JSON API response
                if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
                    return res.json({
                        success: true,
                        path: relativeSubPath,
                        items,
                        totalFiles,
                        totalSize,
                    });
                }

                // Build breadcrumbs
                const segments = relativeSubPath.split('/').filter(Boolean);
                const breadcrumbs = [{ name: 'media', url: '/media/' }];
                let accum = '/media';
                for (const seg of segments) {
                    accum += `/${seg}`;
                    breadcrumbs.push({ name: seg, url: accum + '/' });
                }

                const html = renderExplorerHtml({
                    currentPath: relativeSubPath,
                    breadcrumbs,
                    items,
                    totalFiles,
                    totalSize,
                    reqHost: req.headers.host || 'localhost:3005',
                });

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(html);
            } catch (err) {
                return res.status(500).send(`Error reading media directory: ${err.message}`);
            }
        }

        next();
    };
};

module.exports = {
    createMediaExplorerMiddleware,
    formatBytes,
    getContentType,
};
