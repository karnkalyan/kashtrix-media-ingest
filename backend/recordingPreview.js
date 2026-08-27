'use strict';

const INTERLACED_FIELD_ORDERS = new Set(['tt', 'bb', 'tb', 'bt']);

const isInterlacedVideo = (mediaInfo = {}) => INTERLACED_FIELD_ORDERS.has(
    String(mediaInfo.fieldOrder || mediaInfo.field_order || '').trim().toLowerCase(),
);

const parseFrameRate = (value) => {
    const text = String(value || '').trim();
    if (!text) return 25;
    const parts = text.split('/').map(Number);
    const rate = parts.length === 2 && parts[1] > 0 ? parts[0] / parts[1] : Number(text);
    return Number.isFinite(rate) && rate > 0 ? rate : 25;
};

/**
 * Build an archive-preview HLS rendition. The source recording is only read;
 * browser-compatible segments are written to a disposable cache directory.
 */
const buildRecordingHlsArgs = (filePath, playlistPath, segmentPattern, mediaInfo = {}, options = {}) => {
    const interlaced = isInterlacedVideo(mediaInfo);
    const frameRate = parseFrameRate(mediaInfo.frameRate || mediaInfo.avg_frame_rate || mediaInfo.r_frame_rate);
    const gop = Math.max(12, Math.min(120, Math.round(frameRate)));
    const segmentSeconds = Math.max(1, Math.min(6, Number(options.segmentSeconds) || 1));
    const filters = [];

    if (Number(mediaInfo.width || 0) > 1280) {
        // Scaling fields before deinterlacing reduces preview CPU without
        // changing the cadence or touching the archive master.
        filters.push(`scale=w=1280:h=-2:flags=fast_bilinear${interlaced ? ':interl=1' : ''}`);
    }
    if (interlaced) {
        const fieldOrder = String(mediaInfo.fieldOrder || mediaInfo.field_order || '').toLowerCase();
        const parity = fieldOrder.startsWith('b') ? 'bff' : 'tff';
        filters.push(`setfield=${parity}`);
        filters.push(`yadif=mode=send_frame_nospatial:parity=${parity}:deint=interlaced`);
    }
    filters.push('setsar=1');

    return [
        '-hide_banner', '-loglevel', 'warning',
        '-probesize', '5000000',
        '-analyzeduration', '5000000',
        '-i', filePath,
        '-map', '0:v:0?', '-map', '0:a:0?',
        '-sn', '-dn',
        '-vf', filters.join(','),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', '27',
        '-pix_fmt', 'yuv420p',
        '-g', String(gop),
        '-keyint_min', String(gop),
        '-sc_threshold', '0',
        '-force_key_frames', `expr:gte(t,n_forced*${segmentSeconds})`,
        '-fps_mode', 'passthrough',
        '-threads', '0',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2',
        '-af', 'aresample=async=1:first_pts=0',
        '-max_muxing_queue_size', '4096',
        '-f', 'hls',
        '-hls_time', String(segmentSeconds),
        '-hls_list_size', '0',
        '-hls_playlist_type', 'event',
        '-hls_flags', 'independent_segments+temp_file',
        ...(options.baseUrl ? ['-hls_base_url', String(options.baseUrl)] : []),
        '-hls_segment_filename', segmentPattern,
        playlistPath,
    ];
};

module.exports = {
    buildRecordingHlsArgs,
    isInterlacedVideo,
    parseFrameRate,
};
