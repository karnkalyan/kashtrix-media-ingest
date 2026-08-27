'use strict';

const SUPPORTED_RECORDING_EXTENSIONS = Object.freeze(['mov', 'mkv', 'mxf', 'mp4', 'flv']);

const RECORDING_PROFILES = Object.freeze({
    mov: Object.freeze({
        extension: 'mov',
        muxer: 'mov',
        label: 'MOV - Uncompressed 10-bit 4:2:2',
        description: 'V210 10-bit 4:2:2 / 24-bit PCM / 8 channels',
        videoCodec: 'v210',
        pixelFormat: 'yuv422p10le',
        capturePixelFormat: 'yuv422p10',
        width: 1920,
        height: 1080,
        frameRate: 25,
        interlaced: true,
        fieldOrder: 'tff',
        videoBitrate: null,
        audioCodec: 'pcm_s24le',
        audioBitrate: null,
        audioSampleRate: 48000,
        audioChannels: 8,
        useNvenc: false,
        hardwareAcceleration: null,
        additionalArgs: [],
    }),
    mkv: Object.freeze({
        extension: 'mkv',
        muxer: 'matroska',
        label: 'MKV - Uncompressed 10-bit 4:2:2',
        description: 'V210 10-bit 4:2:2 / 24-bit PCM / 8 channels',
        videoCodec: 'v210',
        pixelFormat: 'yuv422p10le',
        capturePixelFormat: 'yuv422p10',
        width: 1920,
        height: 1080,
        frameRate: 25,
        interlaced: true,
        fieldOrder: 'tff',
        videoBitrate: null,
        audioCodec: 'pcm_s24le',
        audioBitrate: null,
        audioSampleRate: 48000,
        audioChannels: 8,
        useNvenc: false,
        hardwareAcceleration: null,
        additionalArgs: [],
    }),
    mxf: Object.freeze({
        extension: 'mxf',
        muxer: 'mxf',
        label: 'MXF - MPEG-2 4:2:2 50 Mbps Broadcast',
        description: 'MPEG-2 4:2:2 50 Mbps interlaced / 24-bit PCM / 8 channels',
        videoCodec: 'mpeg2video',
        pixelFormat: 'yuv422p',
        capturePixelFormat: 'uyvy422',
        width: 1920,
        height: 1080,
        frameRate: 25,
        interlaced: true,
        fieldOrder: 'tff',
        videoBitrate: '50M',
        minRate: '50M',
        maxRate: '50M',
        bufferSize: '17825792',
        gop: 12,
        bf: 2,
        audioCodec: 'pcm_s24le',
        audioBitrate: null,
        audioSampleRate: 48000,
        audioChannels: 8,
        useNvenc: false,
        hardwareAcceleration: null,
        additionalArgs: [
            '-color_primaries', 'bt709',
            '-color_trc', 'bt709',
            '-colorspace', 'bt709',
        ],
    }),
    mp4: Object.freeze({
        extension: 'mp4',
        muxer: 'mp4',
        label: 'MP4 - H.264 / HEVC',
        description: 'H.264 or HEVC approximately 20 Mbps / AAC stereo / Auto GPU or CPU',
        videoCodec: 'h264',
        pixelFormat: 'yuv420p',
        capturePixelFormat: 'uyvy422',
        width: 1920,
        height: 1080,
        frameRate: 25,
        interlaced: true,
        fieldOrder: 'tff',
        videoBitrate: '20M',
        maxRate: '20M',
        bufferSize: '40M',
        gop: 50,
        bf: 2,
        preset: 'p4',
        tune: 'hq',
        profile: 'high',
        rateControl: 'cbr',
        audioCodec: 'aac',
        audioBitrate: '256k',
        audioSampleRate: 48000,
        audioChannels: 2,
        compressed: true,
        useNvenc: false,
        hardwareAcceleration: 'auto',
        fallbackVideoFilter: 'bwdif=mode=send_field:parity=tff:deint=all,format=yuv420p',
        fallbackFrameRate: 50,
        additionalArgs: ['-movflags', '+faststart'],
    }),
    flv: Object.freeze({
        extension: 'flv',
        muxer: 'flv',
        label: 'FLV - H.264',
        description: 'H.264 approximately 12 Mbps / AAC stereo / Auto GPU or CPU',
        videoCodec: 'h264',
        pixelFormat: 'yuv420p',
        capturePixelFormat: 'uyvy422',
        width: 1920,
        height: 1080,
        frameRate: 25,
        interlaced: true,
        fieldOrder: 'tff',
        videoBitrate: '12M',
        maxRate: '12M',
        bufferSize: '24M',
        gop: 50,
        bf: 2,
        preset: 'p4',
        tune: 'hq',
        profile: 'high',
        rateControl: 'cbr',
        audioCodec: 'aac',
        audioBitrate: '192k',
        audioSampleRate: 48000,
        audioChannels: 2,
        compressed: true,
        useNvenc: false,
        hardwareAcceleration: 'auto',
        fallbackVideoFilter: 'bwdif=mode=send_field:parity=tff:deint=all,format=yuv420p',
        fallbackFrameRate: 50,
        additionalArgs: [],
    }),
});

const normalizeRecordingExtension = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');

const getRecordingProfile = (extension) => {
    const normalized = normalizeRecordingExtension(extension);
    const profile = RECORDING_PROFILES[normalized];
    if (!profile) {
        throw new Error(`Unsupported recording format "${extension}". Choose ${SUPPORTED_RECORDING_EXTENSIONS.map(item => `.${item}`).join(', ')}.`);
    }
    return profile;
};

const bitrateToKbps = (value) => {
    if (!value) return 0;
    const match = String(value).match(/^([\d.]+)([kKmM])?$/);
    if (!match) return 0;
    const amount = Number(match[1]);
    return Math.round(amount * (String(match[2] || '').toLowerCase() === 'm' ? 1000 : 1));
};

const getRecordingProfileSummaries = () => SUPPORTED_RECORDING_EXTENSIONS.map((extension) => {
    const profile = RECORDING_PROFILES[extension];
    return {
        extension: profile.extension,
        label: profile.label,
        description: profile.description,
        muxer: profile.muxer,
        videoCodec: profile.videoCodec,
        pixelFormat: profile.pixelFormat,
        capturePixelFormat: profile.capturePixelFormat,
        videoBitrate: bitrateToKbps(profile.videoBitrate),
        maxBitrate: bitrateToKbps(profile.maxRate),
        frameRate: profile.frameRate,
        fieldOrder: profile.fieldOrder,
        interlaced: profile.interlaced,
        gop: profile.gop || 0,
        bf: profile.bf || 0,
        preset: profile.preset || '',
        audioCodec: profile.audioCodec,
        audioBitrate: bitrateToKbps(profile.audioBitrate),
        audioSampleRate: profile.audioSampleRate,
        audioChannels: profile.audioChannels,
        useNvenc: profile.useNvenc,
        compressed: profile.compressed === true,
        hardwareAcceleration: profile.hardwareAcceleration,
    };
});

const normalizeBitrateOverride = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? `${Math.round(numeric)}k` : fallback;
};

const resolveProfile = (extension, options = {}) => {
    const profile = getRecordingProfile(extension);
    const overrides = (options.profileOverrides && typeof options.profileOverrides === 'object'
        ? (options.profileOverrides[extension] || options.profileOverrides)
        : (options.unlockStandardOverride ? options : {})) || {};
    const videoBitrate = normalizeBitrateOverride(overrides.videoBitrate || (options.unlockStandardOverride ? options.videoBitrate : null), profile.videoBitrate);
    const maxRate = normalizeBitrateOverride(overrides.maxBitrate || (options.unlockStandardOverride ? options.maxBitrate : null), videoBitrate || profile.maxRate);
    const numericVideoOverride = Number(overrides.videoBitrate || (options.unlockStandardOverride ? options.videoBitrate : null));
    const videoCodec = overrides.videoCodec || (options.unlockStandardOverride && options.videoCodec ? options.videoCodec : profile.videoCodec);
    const pixelFormat = overrides.pixelFormat || (options.unlockStandardOverride && options.pixelFormat ? options.pixelFormat : profile.pixelFormat);
    const rawFps = Number(overrides.framerate || overrides.frameRate || (options.unlockStandardOverride ? (options.framerate || options.frameRate) : 0));
    const frameRate = Number.isFinite(rawFps) && rawFps > 0 ? rawFps : profile.frameRate;
    const audioCodec = overrides.audioCodec || (options.unlockStandardOverride && options.audioCodec ? options.audioCodec : profile.audioCodec);
    const audioBitrate = profile.audioBitrate || overrides.audioBitrate || (options.unlockStandardOverride && options.audioBitrate)
        ? normalizeBitrateOverride(overrides.audioBitrate || (options.unlockStandardOverride ? options.audioBitrate : null), profile.audioBitrate)
        : null;
    const audioChannels = [1, 2, 6, 8].includes(Number(overrides.audioChannels || (options.unlockStandardOverride ? options.audioChannels : null)))
        ? Number(overrides.audioChannels || options.audioChannels)
        : profile.audioChannels;
    const audioSampleRate = [32000, 44100, 48000, 96000].includes(Number(overrides.audioSampleRate || (options.unlockStandardOverride ? options.sampleRate : null)))
        ? Number(overrides.audioSampleRate || options.sampleRate)
        : profile.audioSampleRate;
    const rawGop = Number(overrides.gop || overrides.gopSize || (options.unlockStandardOverride ? options.gopSize : null));
    const gop = Number.isFinite(rawGop) && rawGop > 0 ? Math.round(rawGop) : profile.gop;
    const preset = overrides.preset || (options.unlockStandardOverride && options.preset ? options.preset : (profile.preset ? String(overrides.preset || profile.preset) : ''));

    return {
        ...profile,
        videoCodec,
        pixelFormat,
        frameRate,
        videoBitrate,
        minRate: profile.minRate ? videoBitrate : profile.minRate,
        maxRate,
        bufferSize: profile.compressed && Number.isFinite(numericVideoOverride) && numericVideoOverride > 0
            ? `${Math.round(numericVideoOverride * 2)}k`
            : profile.bufferSize,
        audioCodec,
        audioBitrate,
        audioChannels,
        audioSampleRate,
        gop,
        preset,
    };
};

const COMPRESSED_VIDEO_ENCODERS = Object.freeze({
    nvidia: Object.freeze({ h264: 'h264_nvenc', hevc: 'hevc_nvenc' }),
    intel: Object.freeze({ h264: 'h264_qsv', hevc: 'hevc_qsv' }),
    amd: Object.freeze({ h264: 'h264_amf', hevc: 'hevc_amf' }),
    cpu: Object.freeze({ h264: 'libx264', hevc: 'libx265' }),
});

const getCompressedVideoEncoder = (encoder, videoCodec) => {
    const engine = Object.prototype.hasOwnProperty.call(COMPRESSED_VIDEO_ENCODERS, encoder) ? encoder : 'cpu';
    const codec = videoCodec === 'hevc' ? 'hevc' : 'h264';
    return { engine, codec, videoEncoder: COMPRESSED_VIDEO_ENCODERS[engine][codec] };
};

const cpuPreset = (value) => ['ultrafast', 'fast', 'medium', 'slow'].includes(value) ? value : 'medium';
const nvencPreset = (value) => /^p[1-7]$/.test(value) ? value : ({ ultrafast: 'p1', fast: 'p3', medium: 'p4', slow: 'p6' }[value] || 'p4');

const buildRecordingProfileArgs = (extension, filePath, options = {}) => {
    const profile = resolveProfile(extension, options);
    const isCompressed = profile.compressed === true;
    const requestedCodec = profile.extension === 'flv' ? 'h264' : (options.videoCodec === 'hevc' ? 'hevc' : 'h264');
    const compressedEncoder = getCompressedVideoEncoder(options.encoder, requestedCodec);
    const videoEncoder = isCompressed ? compressedEncoder.videoEncoder : profile.videoCodec;
    const deinterlaceCompressed = isCompressed && options.deinterlaceCompressed === true;
    const frameRate = deinterlaceCompressed ? profile.fallbackFrameRate : profile.frameRate;
    const gop = deinterlaceCompressed && profile.gop ? profile.gop * 2 : profile.gop;
    const args = ['-map', '0:v:0?', '-map', '0:a:0?'];

    if (deinterlaceCompressed && profile.fallbackVideoFilter) {
        args.push('-vf', profile.fallbackVideoFilter);
    } else if (profile.interlaced && !isCompressed) {
        args.push('-vf', 'setfield=tff');
    }

    args.push('-c:v', videoEncoder);
    if (isCompressed) {
        if (compressedEncoder.engine === 'nvidia') {
            args.push('-preset', nvencPreset(profile.preset), '-tune', 'hq');
        } else if (compressedEncoder.engine === 'intel') {
            args.push('-preset', cpuPreset(profile.preset));
        } else if (compressedEncoder.engine === 'amd') {
            args.push('-quality', profile.preset === 'slow' ? 'quality' : profile.preset === 'ultrafast' ? 'speed' : 'balanced');
        } else {
            args.push('-preset', cpuPreset(profile.preset));
        }
        args.push('-profile:v', requestedCodec === 'hevc' ? 'main' : 'high');
    } else {
        if (profile.preset) args.push('-preset', profile.preset);
        if (profile.tune) args.push('-tune', profile.tune);
        if (profile.profile) args.push('-profile:v', profile.profile);
    }
    const pixelFormat = isCompressed && ['intel', 'amd'].includes(compressedEncoder.engine) ? 'nv12' : profile.pixelFormat;
    args.push('-pix_fmt', pixelFormat, '-r', String(frameRate));

    if (options.resolution && options.resolution !== 'source' && /^\d{2,5}x\d{2,5}$/.test(String(options.resolution))) {
        args.push('-s', String(options.resolution));
    }

    if (profile.interlaced && !deinterlaceCompressed) {
        if (profile.videoCodec === 'mpeg2video') args.push('-flags', '+ildct+ilme');
        else if (isCompressed) args.push('-flags', '+ildct');
        args.push('-top', '1');
        if (isCompressed && compressedEncoder.engine === 'cpu' && requestedCodec === 'h264') {
            args.push('-x264-params', 'tff=1');
        }
    }
    if (profile.videoCodec === 'v210') args.push('-field_order', 'tt');
    if (isCompressed && ['nvidia', 'amd'].includes(compressedEncoder.engine) && profile.rateControl) {
        args.push('-rc', profile.rateControl);
    }
    if (options.rateControl === 'crf' && Number.isFinite(Number(options.crf)) && isCompressed && compressedEncoder.engine === 'cpu') {
        args.push('-crf', String(options.crf));
    }
    if (profile.videoBitrate) args.push('-b:v', profile.videoBitrate);
    if (profile.minRate) args.push('-minrate', profile.minRate);
    if (profile.maxRate) args.push('-maxrate', profile.maxRate);
    if (profile.bufferSize) args.push('-bufsize', profile.bufferSize);
    if (gop) args.push('-g', String(gop));
    if (profile.bf !== undefined) args.push('-bf', String(profile.bf));
    if (Array.isArray(profile.additionalArgs)) args.push(...profile.additionalArgs);

    args.push(
        '-c:a', profile.audioCodec,
        '-ar', String(profile.audioSampleRate),
        '-ac', String(profile.audioChannels),
    );
    if (profile.audioBitrate) args.push('-b:a', profile.audioBitrate);
    args.push('-f', profile.muxer, filePath);
    return args;
};

module.exports = {
    COMPRESSED_VIDEO_ENCODERS,
    RECORDING_PROFILES,
    SUPPORTED_RECORDING_EXTENSIONS,
    buildRecordingProfileArgs,
    getRecordingProfile,
    getRecordingProfileSummaries,
    getCompressedVideoEncoder,
    normalizeRecordingExtension,
};
