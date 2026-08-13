
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
  name:string;
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

export interface RecordingOptions {
  fileName?: string;
  format: 'mp4' | 'mkv' | 'mov' | 'ts' | 'flv';
  videoBitrate?: number;
  resolution?: string;
  framerate?: number;
}

export interface IngestRecordingOptions {
  fileName?: string;
  formats: Array<'mp4' | 'mkv' | 'mov' | 'ts' | 'flv'>;
  encoder: 'copy' | 'cpu' | 'nvidia' | 'intel' | 'amd';
  videoBitrate: number;
  audioBitrate: number;
  resolution: 'source' | string;
  framerate: number;
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow';
  continuous: boolean;
  autoRecord?: boolean;
  sourceType?: 'ingest' | 'device';
  videoDevice?: string;
  audioDevice?: string;
  videoCodec?: 'h264' | 'hevc';
  rateControl?: 'cbr' | 'vbr' | 'crf';
  maxBitrate?: number;
  crf?: number;
  gopSize?: number;
  pixelFormat?: 'yuv420p' | 'yuv422p' | 'yuv444p';
  audioCodec?: 'aac' | 'mp3' | 'opus';
  sampleRate?: number;
  audioChannels?: number;
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
}

export interface ChannelDestination {
  id: string;
  name: string;
  protocol: Protocol;
  url: string;
  playbackUrl?: string;
  streamKey?: string;
  recording?: RecordingOptions;
}

export interface LicenseInfo {
  status: 'trial' | 'activated' | 'expired' | 'suspended' | 'hardware_mismatch';
  customerName?: string;
  customerEmail?: string;
  expiresAt?: string;
  features?: string[];
  systemHwid?: string;
  hardwareId?: string;
  hardwareBound?: boolean;
  hardwareMatch?: boolean;
}

export interface AppSettings {
  rtmpPort: number;
  mediaPort: number;
  httpPort: number;
  apiPort: number;
}

export interface AuthUser {
  username: string;
  role: 'admin';
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
