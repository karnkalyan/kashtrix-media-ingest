import { TranscodingProfile, VideoCodec, AudioCodec, Protocol } from './types';

export const DEFAULT_PROFILES: TranscodingProfile[] = [
  {
    id: 'low-cpu-720p',
    name: 'Low CPU 720p (UDP Stable)',
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.AAC,
    resolution: '1280x720',
    videoQualityMode: 'bitrate',
    videoBitrate: 2000,
    audioBitrate: 128,
    sampleRate: 48000,
    preset: 'ultrafast',
    framerate: 25,
    pixelFormat: 'yuv420p',
  },
  // ADDED: Profile for HTTP-TS based on your working command
  {
    id: 'live-http-ts-1',
    name: 'HTTP-TS: 720p Low Latency',
    videoCodec: VideoCodec.H264,
    videoQualityMode: 'bitrate',
    videoBitrate: 2000,
    maxrate: 2000,
    bufsize: 4000,
    resolution: '1280x720',
    framerate: 30,
    preset: 'ultrafast',
    tune: 'zerolatency',
    pixelFormat: 'yuv420p',
    audioCodec: AudioCodec.AAC,
    audioBitrate: 128,
    sampleRate: 48000,
  },
  {
    id: 'default-h264-1080p',
    name: 'H.264 1080p (Software)',
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.AAC,
    resolution: '1920x1080',
    videoQualityMode: 'bitrate',
    videoBitrate: 4000,
    audioBitrate: 128,
    sampleRate: 48000,
    preset: 'medium',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'nvidia-h264-1080p',
    name: 'H.264 1080p (NVIDIA NVENC)',
    videoCodec: VideoCodec.H264_NVENC,
    audioCodec: AudioCodec.AAC,
    resolution: '1920x1080',
    videoQualityMode: 'bitrate',
    videoBitrate: 4000,
    audioBitrate: 128,
    sampleRate: 48000,
    preset: 'p4',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'amd-h264-1080p',
    name: 'H.264 1080p (AMD AMF)',
    videoCodec: VideoCodec.H264_AMF,
    audioCodec: AudioCodec.AAC,
    resolution: '1920x1080',
    videoQualityMode: 'bitrate',
    videoBitrate: 4000,
    audioBitrate: 128,
    sampleRate: 48000,
    preset: 'p4',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'amd-hevc-1080p',
    name: 'HEVC 1080p (AMD AMF)',
    videoCodec: VideoCodec.HEVC_AMF,
    audioCodec: AudioCodec.AAC,
    resolution: '1920x1080',
    videoQualityMode: 'bitrate',
    videoBitrate: 6000,
    audioBitrate: 128,
    sampleRate: 48000,
    preset: 'p4',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'apple-h264-1080p',
    name: 'H.264 1080p (Apple VideoToolbox)',
    videoCodec: VideoCodec.H264_VIDEOTOOLBOX,
    audioCodec: AudioCodec.AAC,
    resolution: '1920x1080',
    videoQualityMode: 'bitrate',
    videoBitrate: 4000,
    audioBitrate: 128,
    sampleRate: 48000,
    preset: 'ultrafast',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'quality-h264-crf-23',
    name: 'High-Quality H.264 (CRF 23)',
    videoCodec: VideoCodec.H264,
    audioCodec: AudioCodec.AAC,
    resolution: '1920x1080',
    videoQualityMode: 'crf',
    crf: 23,
    audioBitrate: 192,
    sampleRate: 48000,
    preset: 'medium',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'uhd-h265-4k',
    name: 'UHD HEVC 4K (Software)',
    videoCodec: VideoCodec.H265,
    audioCodec: AudioCodec.AAC,
    resolution: '3840x2160',
    videoQualityMode: 'bitrate',
    videoBitrate: 15000,
    audioBitrate: 192,
    sampleRate: 48000,
    preset: 'medium',
    framerate: 30,
    pixelFormat: 'yuv420p',
  },
  {
    id: 'audio-only-aac',
    name: 'Audio Only (AAC 128k)',
    videoCodec: VideoCodec.Copy,
    audioCodec: AudioCodec.AAC,
    resolution: 'N/A',
    videoQualityMode: 'bitrate',
    isAudioOnly: true,
    audioBitrate: 128,
    sampleRate: 48000,
  },
  {
    id: 'passthrough-copy',
    name: 'Passthrough (Stream Copy)',
    videoCodec: VideoCodec.Copy,
    audioCodec: AudioCodec.Copy,
    resolution: 'N/A',
    videoQualityMode: 'bitrate',
  },
];

export const VIDEO_CODEC_OPTIONS = [
  { value: 'header-software', label: '--- Software (CPU) ---', disabled: true },
  { value: VideoCodec.H264, label: 'H.264 (libx264)' },
  { value: VideoCodec.H265, label: 'HEVC (libx265)' },
  { value: VideoCodec.VP9, label: 'VP9 (libvpx-vp9)' },
  { value: VideoCodec.AV1, label: 'AV1 (libaom-av1)' },
  { value: 'header-nvidia', label: '--- NVIDIA (NVENC) ---', disabled: true },
  { value: VideoCodec.H264_NVENC, label: 'H.264 (h264_nvenc)' },
  { value: VideoCodec.HEVC_NVENC, label: 'HEVC (hevc_nvenc)' },
  { value: 'header-amd', label: '--- AMD (AMF) ---', disabled: true },
  { value: VideoCodec.H264_AMF, label: 'H.264 (h264_amf)' },
  { value: VideoCodec.HEVC_AMF, label: 'HEVC (hevc_amf)' },
  { value: 'header-apple', label: '--- Apple (VideoToolbox) ---', disabled: true },
  { value: VideoCodec.H264_VIDEOTOOLBOX, label: 'H.264 (h264_videotoolbox)' },
  { value: VideoCodec.HEVC_VIDEOTOOLBOX, label: 'HEVC (hevc_videotoolbox)' },
  { value: 'header-other', label: '--- Other ---', disabled: true },
  { value: VideoCodec.Copy, label: 'Copy (Passthrough)' },
];

export const AUDIO_CODEC_OPTIONS = [
  { value: AudioCodec.AAC, label: 'AAC' },
  { value: AudioCodec.Opus, label: 'Opus' },
  { value: AudioCodec.MP3, label: 'MP3' },
  { value: AudioCodec.Copy, label: 'Copy (Passthrough)' },
];

export const RESOLUTION_OPTIONS = [
  { value: 'source', label: 'Source / Original (Auto)' },
  { value: '3840x2160', label: '4K UHD (3840x2160)' },
  { value: '2560x1440', label: '2K QHD (2560x1440)' },
  { value: '1920x1080', label: 'Full HD 1080p (1920x1080)' },
  { value: '1280x720', label: 'HD 720p (1280x720)' },
  { value: '720x576', label: 'PAL 576i/p (720x576)' },
  { value: '720x480', label: 'NTSC 480i/p (720x480)' },
  { value: '854x480', label: 'SD 480p (854x480)' },
];

export const LIVE_PROTOCOL_OPTIONS = [
  { value: Protocol.HLS, label: 'HLS (HTTP Live Streaming)' },
  { value: Protocol.DASH, label: 'DASH (Dynamic Adaptive Streaming)' },
  { value: Protocol.RTMP, label: 'RTMP (Real-Time Messaging Protocol)' },
  { value: Protocol.SRT, label: 'SRT (Secure Reliable Transport)' },
  { value: Protocol.UDP, label: 'UDP (User Datagram Protocol)' },
  { value: Protocol.HTTP_TS, label: 'HTTP-TS (MPEG-TS over HTTP)' },
  { value: Protocol.DECKLINK, label: 'DeckLink Card Output' },
  { value: Protocol.RECORDING, label: 'Recording File' },
  { value: Protocol.YOUTUBE, label: 'YouTube' },
  { value: Protocol.FACEBOOK, label: 'Facebook' },
  { value: Protocol.CUSTOM, label: 'RTMP Push' },
];

export const FRAMERATE_OPTIONS = [
  { value: '0', label: 'Source / Pass-through (Auto)' },
  { value: '50', label: '50 fps (Broadcast PAL/HD Standard)' },
  { value: '59.94', label: '59.94 fps (Broadcast NTSC/HD Standard)' },
  { value: '60', label: '60 fps' },
  { value: '25', label: '25 fps (PAL Broadcast)' },
  { value: '29.97', label: '29.97 fps (NTSC Broadcast)' },
  { value: '30', label: '30 fps' },
  { value: '24', label: '24 fps (Cinema)' },
  { value: '23.976', label: '23.976 fps' },
];

export const SAMPLE_RATE_OPTIONS = [
  { value: '44100', label: '44.1 kHz' },
  { value: '48000', label: '48 kHz' },
];

export const PRESET_OPTIONS = [
  { value: 'ultrafast', label: 'Ultrafast' },
  { value: 'superfast', label: 'Superfast' },
  { value: 'veryfast', label: 'Veryfast' },
  { value: 'faster', label: 'Faster' },
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium' },
  { value: 'slow', label: 'Slow' },
  { value: 'slower', label: 'Slower' },
  { value: 'veryslow', label: 'Veryslow' },
];

export const PIXEL_FORMAT_OPTIONS = [
  { value: 'yuv420p', label: 'yuv420p' },
  { value: 'yuv422p', label: 'yuv422p' },
  { value: 'yuv444p', label: 'yuv444p' },
];

export const DEFAULT_DECKLINK_FORMATS: {
  code: string;
  resolution: string;
  width: number;
  height: number;
  fps: string;
  fpsNum: number;
  fpsDen: number;
  interlaced: boolean;
  fieldOrder?: string;
  description: string;
}[] = [
  { code: 'Hi50', resolution: '1920x1080', width: 1920, height: 1080, fps: '50', fpsNum: 25000, fpsDen: 1000, interlaced: true, fieldOrder: 'upper field first', description: '1080i 50 fps (1920x1080, Interlaced Upper Field - Broadcast PAL)' },
  { code: 'Hi59', resolution: '1920x1080', width: 1920, height: 1080, fps: '59.94', fpsNum: 30000, fpsDen: 1001, interlaced: true, fieldOrder: 'upper field first', description: '1080i 59.94 fps (1920x1080, Interlaced Upper Field - Broadcast NTSC)' },
  { code: 'Hi60', resolution: '1920x1080', width: 1920, height: 1080, fps: '60', fpsNum: 30000, fpsDen: 1000, interlaced: true, fieldOrder: 'upper field first', description: '1080i 60 fps (1920x1080, Interlaced Upper Field)' },
  { code: 'Hp50', resolution: '1920x1080', width: 1920, height: 1080, fps: '50', fpsNum: 50000, fpsDen: 1000, interlaced: false, description: '1080p 50 fps (1920x1080, Progressive 50 Hz)' },
  { code: 'Hp59', resolution: '1920x1080', width: 1920, height: 1080, fps: '59.94', fpsNum: 60000, fpsDen: 1001, interlaced: false, description: '1080p 59.94 fps (1920x1080, Progressive 59.94 Hz)' },
  { code: 'Hp60', resolution: '1920x1080', width: 1920, height: 1080, fps: '60', fpsNum: 60000, fpsDen: 1000, interlaced: false, description: '1080p 60 fps (1920x1080, Progressive 60 Hz)' },
  { code: 'Hp25', resolution: '1920x1080', width: 1920, height: 1080, fps: '25', fpsNum: 25000, fpsDen: 1000, interlaced: false, description: '1080p 25 fps (1920x1080, Progressive 25 Hz)' },
  { code: 'Hp29', resolution: '1920x1080', width: 1920, height: 1080, fps: '29.97', fpsNum: 30000, fpsDen: 1001, interlaced: false, description: '1080p 29.97 fps (1920x1080, Progressive 29.97 Hz)' },
  { code: 'Hp30', resolution: '1920x1080', width: 1920, height: 1080, fps: '30', fpsNum: 30000, fpsDen: 1000, interlaced: false, description: '1080p 30 fps (1920x1080, Progressive 30 Hz)' },
  { code: '24ps', resolution: '1920x1080', width: 1920, height: 1080, fps: '24', fpsNum: 24000, fpsDen: 1000, interlaced: false, description: '1080p 24 fps (1920x1080, Progressive Cinema Film)' },
  { code: '23ps', resolution: '1920x1080', width: 1920, height: 1080, fps: '23.98', fpsNum: 24000, fpsDen: 1001, interlaced: false, description: '1080p 23.98 fps (1920x1080, Progressive Film)' },
  { code: 'hp50', resolution: '1280x720', width: 1280, height: 720, fps: '50', fpsNum: 50000, fpsDen: 1000, interlaced: false, description: '720p 50 fps (1280x720, Progressive HD)' },
  { code: 'hp59', resolution: '1280x720', width: 1280, height: 720, fps: '59.94', fpsNum: 60000, fpsDen: 1001, interlaced: false, description: '720p 59.94 fps (1280x720, Progressive HD)' },
  { code: 'hp60', resolution: '1280x720', width: 1280, height: 720, fps: '60', fpsNum: 60000, fpsDen: 1000, interlaced: false, description: '720p 60 fps (1280x720, Progressive HD)' },
  { code: 'pal ', resolution: '720x576', width: 720, height: 576, fps: '25', fpsNum: 25000, fpsDen: 1000, interlaced: true, fieldOrder: 'upper field first', description: 'PAL 576i (720x576, Interlaced Upper Field - SD Broadcast)' },
  { code: 'ntsc', resolution: '720x486', width: 720, height: 486, fps: '29.97', fpsNum: 30000, fpsDen: 1001, interlaced: true, fieldOrder: 'lower field first', description: 'NTSC 486i (720x486, Interlaced Lower Field - SD Broadcast)' },
  { code: '4k50', resolution: '3840x2160', width: 3840, height: 2160, fps: '50', fpsNum: 50000, fpsDen: 1000, interlaced: false, description: '4K UHD 50 fps (3840x2160, Progressive Ultra HD)' },
  { code: '4k59', resolution: '3840x2160', width: 3840, height: 2160, fps: '59.94', fpsNum: 60000, fpsDen: 1001, interlaced: false, description: '4K UHD 59.94 fps (3840x2160, Progressive Ultra HD)' },
  { code: '4k60', resolution: '3840x2160', width: 3840, height: 2160, fps: '60', fpsNum: 60000, fpsDen: 1000, interlaced: false, description: '4K UHD 60 fps (3840x2160, Progressive Ultra HD)' },
  { code: '4k25', resolution: '3840x2160', width: 3840, height: 2160, fps: '25', fpsNum: 25000, fpsDen: 1000, interlaced: false, description: '4K UHD 25 fps (3840x2160, Progressive 25 Hz)' },
  { code: '4k30', resolution: '3840x2160', width: 3840, height: 2160, fps: '30', fpsNum: 30000, fpsDen: 1000, interlaced: false, description: '4K UHD 30 fps (3840x2160, Progressive 30 Hz)' },
  { code: '4k24', resolution: '3840x2160', width: 3840, height: 2160, fps: '24', fpsNum: 24000, fpsDen: 1000, interlaced: false, description: '4K UHD 24 fps (3840x2160, Progressive Cinema Film)' },
  { code: '4k23', resolution: '3840x2160', width: 3840, height: 2160, fps: '23.98', fpsNum: 24000, fpsDen: 1001, interlaced: false, description: '4K UHD 23.98 fps (3840x2160, Progressive Film)' },
];

export const AVC_PROFILE_OPTIONS = [
  { value: 'high', label: 'High Profile (Broadcast Standard)' },
  { value: 'main', label: 'Main Profile (Standard)' },
  { value: 'baseline', label: 'Baseline Profile (Compatibility)' },
  { value: 'high10', label: 'High 10 (10-bit Color)' },
  { value: 'high422', label: 'High 4:2:2 (Production Quality)' },
  { value: 'high444', label: 'High 4:4:4 (Mastering RGB)' },
];

export const AVC_LEVEL_OPTIONS = [
  { value: 'auto', label: 'Auto (Recommended)' },
  { value: '3.0', label: 'Level 3.0 (SD / 720x480)' },
  { value: '3.1', label: 'Level 3.1 (720p30)' },
  { value: '3.2', label: 'Level 3.2 (720p60)' },
  { value: '4.0', label: 'Level 4.0 (1080p30)' },
  { value: '4.1', label: 'Level 4.1 (1080i50 / 1080i60 / 1080p30 Broadcast)' },
  { value: '4.2', label: 'Level 4.2 (1080p60)' },
  { value: '5.0', label: 'Level 5.0 (2K / High Bitrate)' },
  { value: '5.1', label: 'Level 5.1 (4K UHD 30fps)' },
  { value: '5.2', label: 'Level 5.2 (4K UHD 60fps)' },
];

export const RATE_CONTROL_OPTIONS = [
  { value: 'cbr', label: 'CBR — Constant Bitrate (Strict Broadcast DVB)' },
  { value: 'vbr', label: 'VBR — Variable Bitrate (Bounded Peak)' },
  { value: 'crf', label: 'CRF — Constant Rate Factor (Quality Target)' },
  { value: 'cqp', label: 'CQP — Constant Quantization Parameter' },
];

export const NIC_BONDING_MODES = [
  { value: 'balance-rr', label: 'Round-Robin (balance-rr / Mode 0)' },
  { value: 'active-backup', label: 'Active-Backup (Fault Tolerance / Mode 1)' },
  { value: 'balance-xor', label: 'XOR Load Balancing (balance-xor / Mode 2)' },
  { value: 'broadcast', label: 'Broadcast (Redundant / Mode 3)' },
  { value: '802.3ad', label: 'IEEE 802.3ad LACP (Dynamic Link Aggregation / Mode 4)' },
  { value: 'balance-tlb', label: 'Adaptive Transmit Load Balancing (balance-tlb / Mode 5)' },
  { value: 'balance-alb', label: 'Adaptive Load Balancing (balance-alb / Mode 6)' },
];

export const DEFAULT_ALARM_RULES = [
  { id: 'alarm-output-links-down', name: 'All Output Links Down', enabled: true, sendTrap: true, severity: 'critical', timeoutMs: 0 },
  { id: 'alarm-audio-fallback', name: 'Audio Signal Fallback', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 0 },
  { id: 'alarm-audio-invalid', name: 'Audio Signal Invalid', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 2000 },
  { id: 'alarm-audio-missing', name: 'Audio Signal Missing', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 2000 },
  { id: 'alarm-audio-silent', name: 'Audio Signal Silent', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 2000 },
  { id: 'alarm-data-missing', name: 'Data Signal Missing', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 2000 },
  { id: 'alarm-dolby-error', name: 'Dolby Decoding Error', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 1000 },
  { id: 'alarm-esam-comm', name: 'ESAM Server Communication Issue', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 0 },
  { id: 'alarm-video-freeze', name: 'Video Freeze / Loss of Input Signal', enabled: true, sendTrap: true, severity: 'critical', timeoutMs: 3000 },
  { id: 'alarm-decklink-drop', name: 'DeckLink Frame Drop / Underflow', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 1000 },
  { id: 'alarm-ps-redundancy', name: 'Power Supply Redundancy Lost', enabled: true, sendTrap: true, severity: 'critical', timeoutMs: 1000 },
  { id: 'alarm-storage-critical', name: 'Master Recording Storage Space Critical', enabled: true, sendTrap: true, severity: 'critical', timeoutMs: 5000 },
  { id: 'alarm-cpu-overheat', name: 'CPU / Transcode Engine Thermal Warning', enabled: true, sendTrap: true, severity: 'warning', timeoutMs: 10000 },
];


