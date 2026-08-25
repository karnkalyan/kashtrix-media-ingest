export enum InputType {
  URL = 'URL',
  VOD = 'VOD File',
  DEVICE = 'Live Device',
  LIVE = 'Incoming Live',
  SRT = 'SRT Listener',
  YOUTUBE = 'YouTube URL',
}

export enum VideoCodec {
  // Software Codecs
  H264 = 'libx264',
  H265 = 'libx265',
  VP9 = 'libvpx-vp9',
  AV1 = 'libaom-av1',
  
  // Hardware Codecs
  H264_NVENC = 'h264_nvenc',
  HEVC_NVENC = 'hevc_nvenc',
  H264_AMF = 'h264_amf',
  HEVC_AMF = 'hevc_amf',
  H264_VIDEOTOOLBOX = 'h264_videotoolbox',
  HEVC_VIDEOTOOLBOX = 'hevc_videotoolbox',

  // Passthrough
  Copy = 'copy',
}

export enum AudioCodec {
  AAC = 'aac',
  Opus = 'libopus',
  MP3 = 'libmp3lame',
  Copy = 'copy',
}

export enum Protocol {
  HLS = 'hls',
  DASH = 'dash',
  RTMP = 'rtmp',
  SRT = 'srt',
  UDP = 'udp',
  HTTP_TS = 'http-ts',
  RTSP = 'rtsp',
  FILE = 'file',
  ICECAST = 'icecast',
  YOUTUBE = 'youtube',
  FACEBOOK = 'facebook',
  TWITCH = 'twitch',
  RECORDING = 'recording',
  DECKLINK = 'decklink',
  CUSTOM = 'custom',
}

export enum ChannelStatus {
  Running = 'Running',
  Stopped = 'Stopped',
  Error = 'Error',
}

export type VideoQualityMode = 'bitrate' | 'crf';

export interface TranscodingProfile {
  id: string;
  name: string;
  isAudioOnly?: boolean;

  // Video Settings
  videoCodec: VideoCodec;
  resolution: string;
  videoQualityMode: VideoQualityMode;
  videoBitrate?: number; // in kbps
  crf?: number; // Constant Rate Factor (0-51)
  framerate?: number; // e.g., 24, 25, 30, 60
  
  // Audio Settings
  audioCodec: AudioCodec;
  audioBitrate?: number; // in kbps
  sampleRate?: number; // e.g., 44100, 48000

  // Advanced Settings
  preset?: string; // e.g., ultrafast, medium, slow
  gopSize?: number; // Keyframe interval
  pixelFormat?: string; // e.g., yuv420p
  maxrate?: number;
  bufsize?: number;
  tune?: string;
}

export interface StorageLocation {
  id: string;
  name?: string;
  storageType: 'local' | 'smb' | 'ftp' | 's3';
  storagePath?: string;
  smbShare?: string;
  smbUsername?: string;
  smbPassword?: string;
  ftpHost?: string;
  ftpPort?: number;
  ftpUsername?: string;
  ftpPassword?: string;
  ftpPath?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  enabled?: boolean;
}

export interface RecordingOptions {
  fileName?: string;
  format: 'mp4' | 'mkv' | 'mov' | 'mxf' | 'ts' | 'flv';
  videoBitrate?: number;
  resolution?: string;
  framerate?: number;
  storageType?: 'local' | 'smb' | 'ftp' | 's3';
  storagePath?: string;
  locations?: StorageLocation[];
}

export interface DecklinkFormat {
  code: string;        // e.g. 'Hi50'
  resolution: string;  // e.g. '1920x1080'
  width: number;
  height: number;
  fps: string;         // e.g. '25'
  fpsNum: number;
  fpsDen: number;
  interlaced: boolean;
  fieldOrder?: string; // e.g. 'upper field first'
  description: string; // full human-readable description
}

export interface IngestRecordingOptions {
  fileName?: string;
  formats: Array<'mp4' | 'mkv' | 'mov' | 'mxf' | 'ts' | 'flv'>;
  encoder: 'auto' | 'standard' | 'copy' | 'cpu' | 'nvidia' | 'intel' | 'amd';
  encoderSelectionVersion?: number;
  videoBitrate: number;
  audioBitrate: number;
  resolution: 'source' | string;
  framerate: number;
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';
  continuous: boolean;
  autoRecord?: boolean;
  sourceType?: 'ingest' | 'device';
  videoDevice?: string;
  audioDevice?: string;
  videoCodec?: 'h264' | 'hevc' | 'v210' | 'mpeg2video';
  rateControl?: 'cbr' | 'vbr' | 'crf';
  maxBitrate?: number;
  crf?: number;
  gopSize?: number;
  pixelFormat?: 'yuv420p' | 'yuv422p' | 'yuv422p10le' | 'yuv444p';
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'pcm_s16le' | 'pcm_s24le';
  sampleRate?: number;
  audioChannels?: number;
  videoInput?: 'unset' | 'sdi' | 'hdmi' | 'optical_sdi' | 'component' | 'composite' | 's_video' | string;
  formatCode?: string;
  rawFormat?: string;
  nvencInterlaceMode?: 'auto' | 'native' | 'deinterlace';
  unlockStandardOverride?: boolean;
  profileOverrides?: Record<string, {
    videoCodec?: 'h264' | 'hevc' | 'v210' | 'mpeg2video' | string;
    videoBitrate?: number;
    maxBitrate?: number;
    audioCodec?: 'aac' | 'mp3' | 'opus' | 'pcm_s16le' | 'pcm_s24le' | string;
    audioBitrate?: number;
    audioChannels?: number;
    audioSampleRate?: number;
    gop?: number;
    preset?: string;
    pixelFormat?: string;
    framerate?: number;
    resolution?: string;
  }>;
  // Storage Destination Options
  storageType?: 'local' | 'smb' | 'ftp' | 's3';
  storagePath?: string;
  smbShare?: string;
  smbUsername?: string;
  smbPassword?: string;
  ftpHost?: string;
  ftpPort?: number;
  ftpUsername?: string;
  ftpPassword?: string;
  ftpPath?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  storageLocations?: StorageLocation[];
}

export interface RecordingProfileSummary {
  extension: 'mov' | 'mkv' | 'mxf' | 'mp4' | 'flv';
  label: string;
  description: string;
  muxer: string;
  videoCodec: 'v210' | 'mpeg2video' | 'h264' | 'hevc';
  pixelFormat: 'yuv422p10le' | 'yuv422p' | 'yuv420p';
  capturePixelFormat: string;
  videoBitrate: number;
  maxBitrate: number;
  frameRate: number;
  fieldOrder: string;
  interlaced: boolean;
  gop: number;
  bf: number;
  preset: string;
  audioCodec: 'pcm_s24le' | 'aac';
  audioBitrate: number;
  audioSampleRate: number;
  audioChannels: number;
  useNvenc: boolean;
  compressed?: boolean;
  hardwareAcceleration?: string | null;
  available?: boolean;
  warning?: string;
}

export interface RecordingEncoderCapability {
  id: 'auto' | 'nvidia' | 'intel' | 'amd' | 'cpu';
  label: string;
  available: boolean;
  hardware: boolean;
  codecs: Array<'h264' | 'hevc'>;
  warning?: string;
}

export interface ChannelDestination {
  id: string;
  name?: string;
  protocol: Protocol;
  url: string;
  playbackUrl?: string;
  streamKey?: string;
  recording?: RecordingOptions;
  storageType?: 'local' | 'smb' | 'ftp' | 's3';
  storagePath?: string;
  locations?: StorageLocation[];
  decklinkPort?: 'hdmi' | 'sdi' | 'optical_sdi' | 'component' | 'composite';
  decklinkDevice?: string;
  decklinkDeviceId?: string;      // Device handle ID (e.g. '75:05326625:00000000')
  decklinkDeviceName?: string;    // Friendly name for UI display
  decklinkFormatCode?: string;    // Output format code (e.g. 'Hi50')
}

export type Destination = ChannelDestination;

export interface LicenseInfo {
  status: 'unlicensed' | 'connecting' | 'activated' | 'expired' | 'suspended' | 'revoked' | 'client_banned' | 'hardware_mismatch';
  reason?: string;
  customerName?: string;
  customerEmail?: string;
  expiresAt?: string;
  features?: string[];
  modules?: string[];
  entitlements?: Record<string, boolean | number>;
  provisioningId?: string;
  systemHwid?: string;
  hardwareId?: string;
  hardwareBound?: boolean;
  hardwareMatch?: boolean;
  maxRecordingDevices?: number;
  maxTranscodeQueueItems?: number;
  licenseId?: string;
  licenseSerial?: string;
  clientId?: string;
  validFrom?: string;
  maxActivations?: number;
  clientAppVersion?: string;
  clientPlatform?: string;
  tenantId?: string;
  applicationId?: string;
  entitlementVersion?: number;
  validatedAt?: string;
  lastEvent?: string;
  configured?: boolean;
  remoteActivationReady?: boolean;
  validationMode?: 'online' | 'offline';
}

export interface AppSettings {
  rtmpPort: number;
  mediaPort: number;
  httpPort: number;
  apiPort: number;
  storageSafetyEnabled?: boolean;
  storageThresholdPercent?: number;
  storageCriticalThresholdPercent?: number;
  storageMinFreeMb?: number;
}

export interface AuthUser {
  username: string;
  role: 'user' | 'admin' | 'superadmin' | 'operator' | 'archive';
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  license: LicenseInfo;
}

export interface Channel {
  id: string;
  name: string;
  inputType: InputType;
  inputUrl: string; // Represents URL, file path, or device descriptor
  outputUrl: string;
  outputProtocol: Protocol;
  destinations?: ChannelDestination[];
  profileId: string; // Links to a TranscodingProfile
  status: ChannelStatus;
  command: string;
  programId?: number; // Identifier for the selected program in an MPTS stream
  selectedVideoStream?: string;
  selectedAudioStream?: string;
  // Real-time stats
  uptime: number; // in seconds
  speed: number;
  speedHistory: { time: number; speed: number }[];
  outputLog: string[];
}

export interface StorageDetails {
  mount: string;
  size: number;
  used: number;
  available: number;
  free?: number;
  usePercent: number;
  freePercent: number;
  isWarning: boolean;
  isFull: boolean;
  isCritical: boolean;
  canRecord: boolean;
  safetyEnabled?: boolean;
  thresholdPercent?: number;
  criticalThresholdPercent?: number;
  minFreeMb?: number;
  deadlinePercent?: number;
  sizeFmt: string;
  usedFmt: string;
  availableFmt: string;
}

export interface StorageStatusResponse extends StorageDetails {
  success: boolean;
  message: string;
  path?: string;
}

export interface TranscodeJobOptions {
  format?: 'mp4' | 'mkv' | 'mov' | 'ts';
  videoCodec?: 'h264' | 'hevc' | 'copy';
  encoder?: 'nvidia' | 'amd' | 'qsv' | 'cpu' | 'copy';
  resolution?: string;
  framerate?: number | string;
  rateControl?: 'cbr' | 'vbr' | 'crf';
  videoBitrate?: number;
  maxBitrate?: number;
  crf?: number;
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow';
  pixelFormat?: 'yuv420p' | 'yuv422p';
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'copy';
  audioBitrate?: number;
  sampleRate?: number;
  audioChannels?: number;
  deinterlace?: boolean;
}

export interface ConversionJob {
  id: string;
  recordingId: number | string;
  originalFileName: string;
  originalFilePath: string;
  sourceFormat: string;
  targetFormat: string;
  targetFileName: string;
  targetFilePath: string;
  status: 'queued' | 'converting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  speed: string;
  fps: number;
  currentFrame?: number;
  totalFrames?: number;
  currentTime?: number;
  duration?: number;
  etaSeconds?: number;
  outputSize?: number;
  outputSizeFmt?: string;
  startTime: string;
  endTime?: string;
  error?: string;
  options: TranscodeJobOptions;
}
