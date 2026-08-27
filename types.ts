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
  MPEG2 = 'mpeg2video',
  VP9 = 'libvpx-vp9',
  AV1 = 'libaom-av1',
  
  // Hardware Codecs
  H264_NVENC = 'h264_nvenc',
  HEVC_NVENC = 'hevc_nvenc',
  H264_QSV = 'h264_qsv',
  HEVC_QSV = 'hevc_qsv',
  MPEG2_QSV = 'mpeg2_qsv',
  H264_AMF = 'h264_amf',
  HEVC_AMF = 'hevc_amf',
  H264_VIDEOTOOLBOX = 'h264_videotoolbox',
  HEVC_VIDEOTOOLBOX = 'hevc_videotoolbox',

  // Passthrough
  Copy = 'copy',
}

export enum AudioCodec {
  AAC = 'aac',
  MP2 = 'mp2',
  AC3 = 'ac3',
  EAC3 = 'eac3',
  Opus = 'libopus',
  MP3 = 'libmp3lame',
  PCM_S16LE = 'pcm_s16le',
  PCM_S24LE = 'pcm_s24le',
  Copy = 'copy',
}

export enum Protocol {
  HLS = 'hls',
  DASH = 'dash',
  RTMP = 'rtmp',
  SRT = 'srt',
  UDP = 'udp',
  UDP_DVB = 'udp-dvb',
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

export type VideoQualityMode = 'bitrate' | 'crf' | 'cbr' | 'vbr' | 'cqp';

export interface TranscodingProfile {
  id: string;
  name: string;
  isAudioOnly?: boolean;

  // Video Settings
  videoEnabled?: boolean;
  videoCodec: VideoCodec | string;
  videoTrack?: string;
  resolution: string;
  videoQualityMode: VideoQualityMode;
  videoBitrate?: number; // in kbps
  crf?: number; // Constant Rate Factor (0-51)
  framerate?: number; // e.g., 24, 25, 30, 50, 59.94, 60
  fpsMode?: 'auto' | 'cfr' | 'vfr' | 'passthrough';
  scaleInterpolation?: 'default' | 'bicubic' | 'bilinear' | 'lanczos' | 'spline' | 'fast_bilinear';
  aspectRatio?: 'original' | '16:9' | '4:3' | '21:9' | '1:1' | string;
  
  // MPEG-4 AVC (H.264) / HEVC Advanced Parameters
  avcProfile?: 'baseline' | 'main' | 'high' | 'high10' | 'high422' | 'high444' | 'main10' | string;
  avcLevel?: 'auto' | '3.0' | '3.1' | '3.2' | '4.0' | '4.1' | '4.2' | '5.0' | '5.1' | '5.2' | '6.0' | '6.1' | '6.2' | string;
  rateControl?: 'cbr' | 'vbr' | 'cqp' | 'crf';
  bFrames?: number; // 0-16 B-frames
  cabac?: boolean;  // Context-adaptive binary arithmetic coding
  minrate?: number; // in kbps
  maxrate?: number; // in kbps
  bufsize?: number; // in kbps (VBV buffer)
  gopSize?: number; // Keyframe interval
  interlaced?: boolean; // Interlaced output mode
  accelerate?: boolean; // Hardware acceleration toggle
  
  // Subtitle Overlay
  subtitleOverlay?: 'off' | 'dvb_sub' | 'burnin' | 'teletext';
  subtitlePosition?: string;
  subtitleTrack?: string;
  
  // Audio Settings
  audioEnabled?: boolean;
  audioCodec: AudioCodec | string;
  audioTrack?: string;
  audioBitrate?: number; // in kbps
  sampleRate?: number; // e.g., 44100, 48000
  audioChannels?: number | string; // 1, 2, 6, 'all'
  audioUpmix?: string;
  audioSync?: 'default' | 'async' | number | string;
  volumeGainPercent?: number; // e.g. 0 (-100% to +100%)
  volumeGainDb?: number; // in dB

  // Advanced Settings
  preset?: string; // e.g., ultrafast, fast, medium, slow, p1-p7
  pixelFormat?: string; // e.g., yuv420p, yuv422p, uyvy422
  tune?: string; // e.g., zerolatency, film, animation, hq, ll
  advancedVideoFlags?: string;
  advancedAudioFlags?: string;
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
  width: number;
  height: number;
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
  
  // DVB Standard MPEG-TS over UDP / RTP Parameters
  dvbServiceId?: number;          // MPEG-TS Program / Service ID (default 1)
  dvbServiceName?: string;        // SDT Service Name (e.g. "Kashtrix TV")
  dvbServiceProvider?: string;    // SDT Service Provider (e.g. "Kashtrix Media")
  dvbVideoPid?: number;           // Video Element PID (default 256 / 0x100)
  dvbAudioPid?: number;           // Audio Element PID (default 257 / 0x101)
  dvbPcrPid?: number;             // PCR PID (default 256 / 0x100)
  dvbPmtPid?: number;             // PMT Table PID (default 4096 / 0x1000)
  dvbTsid?: number;               // Transport Stream ID (default 1)
  dvbOnid?: number;               // Original Network ID (default 1)
  dvbMuxrate?: number;            // CBR Muxrate in kbps (e.g. 6000, 8000, 10000 for null stuffing)
  dvbPacketSize?: number;         // 1316 (7 TS packets per UDP payload) or 188
  dvbTtl?: number;                // Multicast TTL (default 64)
  dvbLocalAddr?: string;          // Multicast interface IP / localaddr
  dvbBufferSize?: number;         // UDP buffer size in bytes (e.g. 65535, 1048576)
  dvbCbrMuxing?: boolean;         // Enable CBR Constant Bitrate DVB Muxing

  // SRT Protocol Parameters (All 3 Modes)
  srtMode?: 'caller' | 'listener' | 'rendezvous';
  srtLatency?: number;            // Latency in ms (default 200)
  srtPassphrase?: string;         // AES Passphrase
  srtPbKeyLen?: number;           // Key length in bytes: 16 (AES-128), 24 (AES-192), 32 (AES-256)
  srtStreamId?: string;           // SRT Stream ID
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

/* ══════════════════════════════════════════════════════════════════════
   NETWORK & SYSTEM MANAGEMENT
   ══════════════════════════════════════════════════════════════════════ */

export interface PhysicalInterface {
  interface: string;            // e.g. 'eth0', 'Ethernet 1'
  name?: string;                // Display name
  macAddress: string;           // e.g. '00:25:90:fd:ef:e0'
  igmp: 'V2' | 'V3';            // IGMP version
  negotiatedSpeed: string;      // e.g. '1000Mb/s Full', '10Gb/s Full'
  state: 'Up' | 'Down';         // Interface state
  method: 'Static' | 'DHCP';    // IP acquisition method
  address: string;              // IPv4 Address (e.g. '172.18.100.150')
  netmask: string;              // IPv4 Netmask (e.g. '255.255.255.0')
  gateway?: string;             // Default Gateway
  logicalName: string;          // Logical Interface alias (e.g. 'eth0', 'MGMT')
  linkSpeed: 'auto' | '100' | '1000' | '10000'; // Speed configuration
  isOnline?: boolean;
  type?: string;
  mtu?: number;
  duplex?: string;
}

export interface NicBondingItem {
  id: string;
  interface: string;            // e.g. 'bond0'
  mode: 'balance-rr' | 'active-backup' | 'balance-xor' | 'broadcast' | '802.3ad' | 'balance-tlb' | 'balance-alb';
  slaves: string[];             // e.g. ['eth0', 'eth1']
  state: 'Up' | 'Down';
  address?: string;
  netmask?: string;
}

export interface VlanItem {
  id: string;
  interface: string;            // Physical parent interface (e.g. 'eth0')
  vlanNumber: number;           // VLAN ID (e.g. 100)
  igmp: 'V2' | 'V3';
  state: 'Up' | 'Down';
  method: 'Static' | 'DHCP';
  address: string;
  netmask: string;
  logicalName: string;
}

export interface NetworkRouteItem {
  id: string;
  interface: string;            // Interface name (e.g. 'eth0', 'bond0')
  type: 'Default' | 'Network' | 'Host';
  destination: string;          // e.g. '0.0.0.0' or '10.0.0.0'
  netmask: string;              // e.g. '0.0.0.0' or '255.255.255.0'
  gateway: string;              // e.g. '172.18.100.1'
}

export interface DnsConfiguration {
  primaryDns: string;           // e.g. '8.8.8.8'
  secondaryDns: string;         // e.g. '1.1.1.1'
}

export interface StatmuxConfiguration {
  mode?: 'single' | 'range' | 'cidr' | 'list';
  multicastAddress: string;     // e.g. '239.100.1.1'
  multicastRangeStart?: string; // e.g. '239.100.1.1'
  multicastRangeEnd?: string;   // e.g. '239.100.1.50'
  multicastCidr?: string;       // e.g. '239.100.1.0/24'
  multicastIpList?: string;     // e.g. '239.100.1.1, 239.100.1.2, 239.100.2.1-239.100.2.20'
  port: number;                 // e.g. 1234
  portRangeEnd?: number;        // e.g. 1250
  ttl?: number;                 // Multicast TTL (1-255)
  enableKernelMulticastForwarding?: boolean;
  autoConfigureMulticastRoutes?: boolean;
  enableRedundancy?: boolean;   // Enable redundant secondary delivery NIC
  interface0: string;           // e.g. 'eth0' (Primary Delivery NIC)
  interface1: string;           // e.g. 'eth1' (Secondary Redundant NIC)
  activateIgmpV3: boolean;      // Activate IGMPv3 Source Filtering
  interface0Source1: string;    // e.g. '0.0.0.0'
  interface0Source2: string;    // e.g. '0.0.0.0'
  interface1Source1: string;    // e.g. '0.0.0.0'
  interface1Source2: string;    // e.g. '0.0.0.0'
  installed?: boolean;
  serviceStatus?: 'running' | 'stopped' | 'not_installed';
}

export interface SnmpConfiguration {
  readCommunity: string;        // e.g. 'public'
  writeCommunity: string;       // e.g. 'private'
  enableTraps: boolean;
  trapReceivers: string[];      // e.g. ['192.168.1.50', '', '']
}

export interface AlarmConfigurationItem {
  id: string;
  name: string;
  enabled: boolean;
  sendTrap: boolean;
  severity: 'critical' | 'warning' | 'minor' | 'info';
  timeoutMs?: number;
}

export interface SystemHardwareExtended {
  productName?: string;
  serverTime?: string;
  systemTime?: string;
  uptimeSeconds?: number;
  ntpStatus?: 'synchronized' | 'not synchronised';
  ntpServer?: string;
  ntpSynchronized?: boolean;
  cpuModel?: string;
  virtualization?: string;
  cpuFrequency?: string;
  coresCount?: number;
  cpuRealUsage?: number;
  cpuEstimatedUsage?: number;
  cpuRealLoad?: number;
  cpuEstLoad?: number;
  ramTotalGb?: number;
  ramUsedGb?: number;
  ramTotalBytes?: number;
  ramTotalFmt?: string;
  ramUsedBytes?: number;
  ramUsedFmt?: string;
  temperatures?: {
    cpu1?: number | string;
    cpu2?: number | string;
    ambient?: number | string;
    sdiFpga?: number | string;
  };
  cpu1Temp?: string;
  cpu2Temp?: string;
  fans?: { id?: string; name: string; rpm: number | string; status?: string }[];
  powerSupplies?: {
    name: string;
    status: string;
    inputVoltage?: string;
    wattage?: string;
    healthy?: boolean;
  }[];
  ps1Status?: string;
  ps2Status?: string;
  sdiHardware?: {
    isDetected?: boolean;
    boardName?: string;
    driverVersion?: string;
    firmwareFpga?: string;
    genlockStatus?: string;
    temperature?: string;
    pcieLink?: string;
    ports?: {
      port: string;
      standard: string;
      signalDetected?: boolean;
      active?: boolean;
      bmdCode?: string;
    }[];
  };
  sdiSerial?: string;
  sdiBoardId?: string;
  sdiBoardVersion?: string;
  sdiFpgaId?: string;
  sdiFpgaVersion?: string;
  vcaNodes?: {
    id: string;
    name: string;
    ip: string;
    status: string;
    role: string;
    cpuUsage: number;
    ramUsage: string;
    pingMs: number;
  }[];
  telemetryAvailability?: {
    cpuTemperature?: boolean;
    fans?: boolean;
    powerSupplies?: boolean;
    ntp?: boolean;
    decklink?: boolean;
  };
}

export interface SystemUpdateInfo {
  currentVersion?: string;
  currentFirmwareVersion?: string;
  currentBuild?: string;
  buildDate?: string;
  releaseChannel?: string;
  availableVersion?: string;
  hasUpdate?: boolean;
  updaterStatus?: 'IDLE' | 'DOWNLOADING' | 'VERIFYING' | 'INSTALLING' | 'REBOOT_REQUIRED';
  packages?: {
    id: string;
    name: string;
    version: string;
    date: string;
    status: string;
  }[];
  updateLogs?: string[];
  logs?: string[];
}

export interface VcaNodeItem {
  id: string;
  nodeName: string;
  macAddress: string;
  cpuLoad: number;
  memoryUsage: string;
  state: 'Online' | 'Offline' | 'Standby' | 'Degraded';
}

// =========================================================================
// MUX (MPTS / MULTI-PROGRAM TRANSPORT STREAM) TYPES
// =========================================================================

export type MuxProcessingMode = 'copy' | 'transcode';

export interface MuxAudioStreamConfig {
  streamIndex: number;
  audioPid: number | string; // e.g. 0x102 or 258
  lang?: string;
  codec?: string;
  bitrateKbps?: number;
  channels?: number;
  samplerate?: number;
  enabled?: boolean;
}

export interface MuxServiceInput {
  id: string;
  channelId?: string; // Reference to existing StreamOps Channel if imported
  sourceName: string;
  sourceType: 'channel' | 'vod' | 'udp' | 'rtmp' | 'srt' | 'custom';
  inputUrl: string;
  
  // Processing Mode: Pass Through (-c copy) or Transcode
  mode: MuxProcessingMode;
  
  // DVB PSI/SI Program Identification
  serviceId: number; // Program number e.g. 101
  serviceName: string; // e.g. 'Kantipur HD'
  providerName: string; // e.g. 'StreamOps'
  pmtPid: number | string; // e.g. 0x100 or 256
  videoPid: number | string; // e.g. 0x101 or 257
  pcrPid?: number | string;
  
  // Audio Streams
  audioStreams: MuxAudioStreamConfig[];
  includeAllAudio?: boolean;
  
  // Per-channel Transcode settings (when mode === 'transcode')
  videoCodec?: 'h264' | 'hevc' | 'copy';
  videoBitrateKbps?: number;
  resolution?: string; // e.g. '1920x1080', '1280x720', 'source'
  fps?: number; // e.g. 25, 50, 30, 59.94
  gop?: number; // e.g. 50
  encoder?: 'auto' | 'nvidia' | 'intel' | 'amd' | 'cpu';
  preset?: string;
  rateControl?: 'cbr' | 'vbr';
  audioCodec?: 'aac' | 'mp2' | 'ac3' | 'copy';
  audioBitrateKbps?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  
  // Order priority
  orderIndex?: number;
  enabled?: boolean;
}

export interface MuxConfig {
  id: string;
  name: string;
  description?: string;
  status: 'Running' | 'Stopped' | 'Starting' | 'Error' | 'Warning';
  
  // Output Network Configuration
  outputInterface?: string; // e.g. 'eth0', 'eth1', 'any'
  outputInterfaceAddress?: string; // current IPv4 address used as FFmpeg localaddr
  outputIp: string; // e.g. '239.10.10.10'
  outputPort: number; // e.g. 5000
  packetSize: number; // 1316 or 188
  ttl: number; // e.g. 16 or 64
  
  // Target MPTS Bitrate with CBR Null Stuffing
  targetBitrateMbps: number; // e.g. 30, 60
  
  // DVB Network Identifiers
  tsid: number; // Transport Stream ID e.g. 1
  onid: number; // Original Network ID e.g. 1
  nid: number; // Network ID e.g. 1
  
  // Services in this MPTS MUX
  services: MuxServiceInput[];
  
  // Output Processing & Transcoding Mode
  outputMode?: 'passthrough' | 'transcode' | 'hybrid';
  globalVideoCodec?: 'h264' | 'hevc' | 'copy';
  globalAudioCodec?: 'aac' | 'mp2' | 'ac3' | 'copy';
  globalResolution?: string; // 'source' | '1920x1080' | '1280x720' | '720x576'
  globalVideoBitrateKbps?: number;
  globalAudioBitrateKbps?: number;
  globalEncoder?: 'auto' | 'nvidia' | 'intel' | 'amd' | 'cpu';
  globalFps?: number;
  globalGop?: number;
  globalPreset?: string;
  
  // Automation & Reliability
  autoStart?: boolean;
  autoRestart?: boolean;
  filterNullPackets?: boolean; // Null Packet Filter (strip 0x1FFF CBR null stuffing)
  
  // Runtime State
  pid?: number;
  uptimeSeconds?: number;
  cpuUsage?: number;
  memoryMb?: number;
  generatedCommand?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MuxInputStats {
  serviceId: number;
  sourceName: string;
  inputUrl: string;
  state: 'ONLINE' | 'NO_TRAFFIC' | 'OFFLINE' | 'ERROR' | 'RECONNECTING';
  bitrateKbps: number;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  packetsPerSec: number;
  bytesReceived: number;
  codec?: string;
  resolution?: string;
  fps?: number;
  videoPid?: string | number;
  audioPid?: string | number;
  pmtPid?: string | number;
  lastPacketTime?: string;
  errorCount?: number;
}

export interface MuxTrafficHistoryPoint {
  time: string;
  totalInputMbps: number;
  outputMbps: number;
  targetMuxMbps: number;
  stuffingMbps: number;
}

export interface MuxStats {
  muxId: string;
  status: 'Running' | 'Stopped' | 'Starting' | 'Error' | 'Warning';
  uptimeSeconds: number;
  totalInputKbps: number;
  outputKbps: number;
  targetMuxKbps: number;
  stuffingKbps: number;
  capacityPercent: number;
  packetsPerSec: number;
  bytesSent: number;
  cpuPercent: number;
  memoryMb: number;
  isOverCapacity: boolean;
  isCapacityWarning: boolean;
  inputs: Record<string, MuxInputStats>;
  history?: MuxTrafficHistoryPoint[];
}

// =========================================================================
// LIVE SERVER / RTMP INGEST SECURITY TYPES
// =========================================================================

export interface RtmpStreamKey {
  id: string;
  name: string;
  key: string;
  allowedStreams?: string[];
  singlePublisherOnly?: boolean;
  playbackSecurity?: 'open' | 'secure' | 'inherit';
  playbackToken?: string;
  expiresAt?: string | null;
  enabled?: boolean;
  createdAt?: string;
  lastUsedAt?: string | null;
}

export interface RtmpPublisherAccount {
  id: string;
  username: string;
  password?: string;
  allowedStreams?: string[];
  singlePublisherOnly?: boolean;
  playbackSecurity?: 'open' | 'secure' | 'inherit';
  enabled?: boolean;
  createdAt?: string;
  lastUsedAt?: string | null;
}

export interface RtmpSecuritySettings {
  enabled: boolean;
  authMode: 'flexible' | 'key_only' | 'credentials_only';
  singlePublisherPerKey: boolean;
  playbackSecurityEnabled?: boolean;
  keys: RtmpStreamKey[];
  accounts: RtmpPublisherAccount[];
}

export interface RtmpActiveLock {
  keyPrefix?: string;
  keyId?: string;
  username?: string;
  accountId?: string;
  streamPath: string;
  sessionId: string | number;
  startTime: number;
}

export interface RtmpSecurityResponse {
  success: boolean;
  settings: RtmpSecuritySettings;
  activeLocks?: {
    keys: RtmpActiveLock[];
    accounts: RtmpActiveLock[];
  };
}
