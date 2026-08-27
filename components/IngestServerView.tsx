import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Video,
  Zap,
  ExternalLink,
  List,
  Search,
  ChevronLeft,
  ChevronRight,
  Square,
  Activity,
  Users,
  Cpu,
  Trash2,
  Play,
  X,
  Archive,
  Copy,
  Radio,
  Sliders,
  CheckCircle2,
  Tv,
  Plus,
  ArrowUpRight,
  Download,
  Film,
  HardDrive,
  AlertCircle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  Unlock,
  Send,
  Loader2
} from 'lucide-react';
import { AppSettings, IngestRecordingOptions, RecordingEncoderCapability, RecordingProfileSummary, TranscodingProfile, StorageStatusResponse } from '../types';
import toast from 'react-hot-toast';
import ProfessionalRecordingControl from './ProfessionalRecordingControl';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import DetailDrawer from './ui/DetailDrawer';
import MediaPreview from './ui/MediaPreview';
import StatusBadge from './ui/StatusBadge';
import ConfirmDialog from './ui/ConfirmDialog';
import LiveServerSecurityModal from './LiveServerSecurityModal';
import { sendRealtime, subscribeRealtime } from '../services/realtime';

const getRecordingFormat = (item: any): string => {
  if (item?.file_name && item.file_name.includes('.')) {
    const parts = item.file_name.split('.');
    const ext = parts.pop()?.toLowerCase();
    if (ext && ext !== item.file_name.toLowerCase() && ['mp4', 'mkv', 'mov', 'mxf', 'ts', 'flv', 'avi', 'webm'].includes(ext)) {
      return ext;
    }
  }
  if (item?.format && String(item.format).toLowerCase() !== 'file') {
    return String(item.format).toLowerCase();
  }
  return 'mp4';
};

const getRecordingUrl = (item: any): string => {
  if (!item) return '';
  if (item.id) return `/recording-preview/${encodeURIComponent(item.id)}`;
  const fileName = item.file_name || item.stream;
  return `/recording-preview/${encodeURIComponent(fileName || '')}`;
};

const getRecordingDownloadUrl = (item: any): string => {
  if (!item) return '';
  if (item.id) return `/api/ingest/recordings/${encodeURIComponent(item.id)}/download?download=1`;
  const fileName = item.file_name || item.stream;
  if (fileName) return `/api/ingest/recordings/file/${encodeURIComponent(fileName)}?download=1`;
  return `/recordings/${encodeURIComponent(fileName || '')}?download=1`;
};

const formatDeviceDisplayName = (deviceStr?: string, videoDevices: string[] = []) => {
  const raw = String(deviceStr || '').trim();
  if (!raw || raw.toLowerCase() === 'device') {
    return videoDevices.length > 0 ? videoDevices[0] : 'Capture Device';
  }
  const match = videoDevices.find(d => d === raw || d.toLowerCase() === raw.toLowerCase() || d.replace(/[\s_]+/g, '-').toLowerCase() === raw.toLowerCase());
  if (match) return match;

  if (/^75:[0-9a-f:]+/i.test(raw)) {
    return videoDevices.length > 0 ? videoDevices[0] : raw;
  }

  return raw.replace(/[-_]+/g, ' ');
};

interface Props {
  fetchIngestStreams: () => Promise<any>;
  fetchIngestHistory: () => Promise<any>;
  fetchRecordings: () => Promise<any>;
  startRecording: (app: string, stream: string, options?: Partial<IngestRecordingOptions>) => Promise<any>;
  stopRecording: (app: string, stream: string) => Promise<any>;
  deleteRecording: (id: number | string) => Promise<any>;
  settings: AppSettings;
  ingestStreams: any;
  ingestHistory: any[];
  recordings: any[];
  profiles: TranscodingProfile[];
  licenseStatus?: string;
  mode?: 'recording' | 'live';
  api?: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const formatBitrate = (kbps: number) => {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mbps`;
  return `${kbps || 0} Kbps`;
};

const formatRecordingTime = (startTimeStr?: string) => {
  if (!startTimeStr) return '';
  const start = new Date(startTimeStr).getTime();
  if (isNaN(start)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatRecordingDuration = (seconds = 0) => {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getLiveDurationSeconds = (rec: any): number => {
  if (!rec) return 0;
  if (rec.is_active) {
    const raw = rec.startTime || rec.start_time || rec.started_at || rec.created_at;
    if (raw) {
      const parsed = typeof raw === 'number' ? (raw > 1e11 ? raw : raw * 1000) : new Date(raw).getTime();
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.max(0, (Date.now() - parsed) / 1000);
      }
    }
  }
  if (Number.isFinite(Number(rec.duration)) && Number(rec.duration) > 0) {
    return Number(rec.duration);
  }
  const rawStart = rec.startTime || rec.start_time;
  const rawEnd = rec.endTime || rec.end_time;
  if (rawStart && rawEnd) {
    const s = new Date(rawStart).getTime();
    const e = new Date(rawEnd).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e >= s) {
      return Math.max(0, (e - s) / 1000);
    }
  }
  return 0;
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const defaultConfig: IngestRecordingOptions = {
  autoRecord: false,
  fileName: '{channel}_{date}_{time}',
  formats: ['mp4'],
  encoder: 'auto',
  encoderSelectionVersion: 2,
  videoCodec: 'h264',
  rateControl: 'cbr',
  resolution: 'source',
  framerate: 25,
  videoBitrate: 20000,
  maxBitrate: 20000,
  preset: 'p4',
  gopSize: 50,
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
  audioBitrate: 256,
  sampleRate: 48000,
  audioChannels: 2,
  continuous: true,
  storageType: 'local',
  storagePath: 'media/recordings',
  formatCode: 'Hi50',
  videoInput: 'sdi',
  rawFormat: 'uyvy422',
  nvencInterlaceMode: 'auto',
  profileOverrides: {},
};

export const IngestServerView: React.FC<Props> = ({
  fetchIngestStreams,
  fetchIngestHistory,
  fetchRecordings,
  startRecording,
  stopRecording,
  deleteRecording,
  settings,
  ingestStreams,
  ingestHistory,
  recordings,
  profiles,
  licenseStatus,
  mode = 'live',
  api,
}) => {
  const [selectedStreamKey, setSelectedStreamKey] = useState<string>('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectedStream, setInspectedStream] = useState<any>(null);
  const [recordingStatuses, setRecordingStatuses] = useState<Record<string, boolean>>({});
  const [, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTicker(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Recording control state
  const [sourceType, setSourceType] = useState<'ingest' | 'device'>('device');
  const [config, setConfig] = useState<IngestRecordingOptions>(defaultConfig);
  const [videoDevices, setVideoDevices] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [videoDevice, setVideoDevice] = useState<string>('');
  const [audioDevice, setAudioDevice] = useState<string>('');
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatusResponse | null>(null);
  const [recordingProfiles, setRecordingProfiles] = useState<RecordingProfileSummary[]>([]);
  const [recordingEncoders, setRecordingEncoders] = useState<RecordingEncoderCapability[]>([]);

  // Recording Library Preview & Filter state
  const [recSearch, setRecSearch] = useState('');
  const [recPage, setRecPage] = useState(1);
  const [recPerPage, setRecPerPage] = useState(10);
  const [recPreview, setRecPreview] = useState<any | null>(null);
  const [deletingRec, setDeletingRec] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // SRT Listener & Relay Modals (Live Server mode)
  const [srtModalOpen, setSrtModalOpen] = useState(false);
  const [srtStreamName, setSrtStreamName] = useState('srt-feed');
  const [srtPort, setSrtPort] = useState('8890');
  const [srtLatency, setSrtLatency] = useState('200');

  const [relayModalOpen, setRelayModalOpen] = useState(false);
  const [relayStreamPath, setRelayStreamPath] = useState('/live/srt-feed');
  const [relayDestinationUrl, setRelayDestinationUrl] = useState('');
  const [relayProfile, setRelayProfile] = useState('copy');
  const [relayCustomBitrate, setRelayCustomBitrate] = useState('3000');
  const [relayCustomResolution, setRelayCustomResolution] = useState('1920:1080');
  const [processes, setProcesses] = useState<any[]>([]);

  const activeSrtProcesses = useMemo(() => {
    return processes.filter((p: any) => p.type === 'srt-listener');
  }, [processes]);

  const effectiveHost = useMemo(() => {
    if (typeof window === 'undefined') return '127.0.0.1';
    const host = window.location.hostname;
    return (!host || host === 'localhost' || host === '127.0.0.1') ? '127.0.0.1' : host;
  }, []);

  // RTMP Ingest Security State (Live Server mode)
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<any>(null);
  const [rtmpSecurityEnabled, setRtmpSecurityEnabled] = useState(false);
  const [rtmpKeysCount, setRtmpKeysCount] = useState(0);

  const apiCall = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('kte-auth-token');
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Server error');
    return data;
  }, []);

  const fetchSecurityStatus = useCallback(async () => {
    try {
      const data = await apiCall('/api/live-server/security');
      if (data?.settings) {
        setSecuritySettings(data.settings);
        setRtmpSecurityEnabled(Boolean(data.settings.enabled));
        setRtmpKeysCount((data.settings.keys || []).length);
      }
    } catch (_) {}
  }, [apiCall]);

  const fetchStorageStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/storage/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setStorageStatus(data);
      }
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        fetchIngestHistory(),
        fetchRecordings(),
        fetchIngestStreams(),
        fetchStorageStatus(),
        fetchSecurityStatus(),
      ]);
      fetchProcesses();
    } catch (e) {
      console.error(e);
    }
  }, [fetchIngestHistory, fetchRecordings, fetchIngestStreams, fetchStorageStatus, fetchSecurityStatus]);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/record/config', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const safeFormats = data.formats && Array.isArray(data.formats) && data.formats.length > 0
          ? data.formats
          : ['mp4'];
        setConfig(prev => ({ ...prev, ...data, formats: safeFormats }));
      }
    } catch {}
  }, []);

  const fetchRecordingProfiles = useCallback(async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/record/profiles', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setRecordingProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        setRecordingEncoders(Array.isArray(data.encoders) ? data.encoders : []);
      }
    } catch {}
  }, []);

  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true);
    sendRealtime({ type: 'capture_devices_request', payload: { refresh: true } });
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ffmpeg/devices?refresh=true', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.video) setVideoDevices(data.video);
        if (data.audio) setAudioDevices(data.audio);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const fetchProcesses = async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/processes', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setProcesses(data.processes || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    fetchConfig();
    fetchRecordingProfiles();
    refreshDevices();
    fetchStorageStatus();

    const unsubscribe = subscribeRealtime(
      msg => {
        if ((msg.type === 'capture_devices' || msg.type === 'capture_devices_response') && msg.payload) {
          const v = msg.payload.video || [];
          const a = msg.payload.audio || [];
          setVideoDevices(prev => Array.from(new Set([...prev, ...v])));
          setAudioDevices(prev => Array.from(new Set([...prev, ...a])));
          setDevicesLoading(false);
        }
        if (msg.type === 'system_stats' && msg.payload?.storageDetails) {
          setStorageStatus(prev => ({ ...(prev || {}), ...msg.payload.storageDetails, success: true }));
        }
      },
      isConnected => {
        if (isConnected) {
          sendRealtime({ type: 'capture_devices_request' });
          refreshDevices();
          fetchStorageStatus();
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [fetchData, fetchConfig, fetchRecordingProfiles, refreshDevices, fetchStorageStatus]);

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/record/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(config),
      });
      if (res.ok) toast.success('Recording config saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleFormat = (format: IngestRecordingOptions['formats'][number]) => {
    setConfig(prev => {
      const requestedProfile = recordingProfiles.find(item => item.extension === format);
      if (requestedProfile?.available === false) {
        toast.error(requestedProfile.warning || `${requestedProfile.label} is unavailable on this server.`);
        return prev;
      }
      const current = prev.formats || ['mp4'];
      const next = current.includes(format)
        ? current.filter(f => f !== format)
        : [...current, format];
      const selectedFormats = next.length ? next : [format];
      const activeFormat = current.includes(format) && next.length ? next[next.length - 1] : format;
      const profile = recordingProfiles.find(item => item.extension === activeFormat);
      if (!profile) return { ...prev, formats: next.length ? next : ['mp4'] };
      return {
        ...prev,
        formats: selectedFormats,
        encoder: profile.compressed ? 'auto' : 'standard',
        videoCodec: profile.compressed ? 'h264' : profile.videoCodec,
        rateControl: 'cbr',
        resolution: '1920x1080',
        framerate: profile.frameRate,
        videoBitrate: profile.videoBitrate,
        maxBitrate: profile.maxBitrate || profile.videoBitrate,
        preset: (profile.preset || 'fast') as IngestRecordingOptions['preset'],
        gopSize: profile.gop || 1,
        pixelFormat: profile.pixelFormat,
        audioCodec: profile.audioCodec,
        audioBitrate: profile.audioBitrate,
        sampleRate: profile.audioSampleRate,
        audioChannels: profile.audioChannels,
        formatCode: 'Hi50',
        videoInput: 'sdi',
        rawFormat: profile.capturePixelFormat,
        profileOverrides: Object.fromEntries(
          Object.entries(prev.profileOverrides || {}).filter(([extension]) => extension !== activeFormat),
        ),
      };
    });
  };

  const handleStartControlRecording = async () => {
    if (licenseStatus === 'expired') {
      return toast.error('Cannot start recording: License has expired. Please activate a valid license.');
    }
    if (licenseStatus && licenseStatus !== 'activated') {
      return toast.error('Recording is disabled in Trial / Unlicensed Mode. Please activate a full license.');
    }

    const selected = sourceType === 'device'
      ? (videoDevice || audioDevice || 'device')
      : selectedStreamKey;

    if (!selected) return toast.error('Select a valid stream or device source');

    const [appName, streamName] = sourceType === 'device'
      ? ['device', selected]
      : selected.includes('/')
      ? selected.split('/')
      : ['live', selected];

    try {
      await startRecording(appName, streamName, {
        ...config,
        sourceType,
        videoDevice,
        audioDevice,
      });
      toast.success(`Started recording: ${selected}`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to start recording');
    }
  };

  const localStreams = ingestStreams || {};
  const history = ingestHistory || [];
  const activeStreamKeys = Object.keys(localStreams);
  const totalBitrateKbps = Object.values(localStreams).reduce((sum: number, s: any) => sum + Number(s.bitrate || s.incoming_kbps || s.incomingBitrate || 0), 0);

  const activeRecordingKeys = useMemo(() => {
    const keys: Record<string, boolean> = {};
    Object.entries(localStreams).forEach(([key, data]: [string, any]) => {
      if (data?.isRecording) keys[key] = true;
    });
    recordings.forEach((rec: any) => {
      if (rec?.is_active) keys[`${rec.app}/${rec.stream}`] = true;
    });
    return keys;
  }, [localStreams, recordings]);

  const handleToggleRecord = async (app: string, stream: string) => {
    const key = `${app}/${stream}`;
    const isRecording = !!(recordingStatuses[key] || activeRecordingKeys[key]);
    if (!isRecording) {
      if (licenseStatus === 'expired') {
        return toast.error('Cannot start recording: License has expired. Please activate a valid license.');
      }
      if (licenseStatus && licenseStatus !== 'activated') {
        return toast.error('Recording is disabled in Trial / Unlicensed Mode. Please activate a full license.');
      }
    }
    try {
      if (isRecording) {
        await stopRecording(app, stream);
        setRecordingStatuses(prev => ({ ...prev, [key]: false }));
        toast.success(`Stopped recording ${stream}`);
      } else {
        await startRecording(app, stream, { sourceType: 'ingest', videoDevice: '', audioDevice: '' });
        setRecordingStatuses(prev => ({ ...prev, [key]: true }));
        toast.success(`Started recording ${stream}`);
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle recording');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`, { icon: '📋' });
  };

  const getStreamUrls = (streamKey: string, streamData?: any) => {
    const rawName = (streamData?.name || streamKey || '').replace(/^live\//, '');
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const mediaPort = settings?.mediaPort || 8080;
    const rtmpPort = settings?.rtmpPort || 1935;
    
    // Check if this is an SRT stream
    const isSrt = streamData?.protocol === 'SRT' || rawName.includes('srt') || processes.some((p: any) => p.type === 'srt-listener' && (p.streamName === rawName || p.streamName === streamKey));
    const srtProc = processes.find((p: any) => p.type === 'srt-listener' && (p.streamName === rawName || p.streamName === streamKey)) || processes.find((p: any) => p.type === 'srt-listener');
    const srtPortNum = srtProc?.port || 8890;
    const srtLatencyNum = srtProc?.latency || 200;

    const srtObsUrl = `srt://${effectiveHost}:${srtPortNum}`;
    const srtCallerUrl = `srt://${effectiveHost}:${srtPortNum}?mode=caller&latency=${srtLatencyNum}`;

    // Find matching security key if any
    const matchingKey = (securitySettings?.keys || []).find((k: any) => 
      k.key === rawName ||
      (Array.isArray(k.allowedStreams) && (k.allowedStreams.includes('*') || k.allowedStreams.includes(rawName)))
    );

    const playToken = matchingKey?.playbackToken || (matchingKey?.playbackSecurity === 'secure' ? matchingKey.key : '');
    
    const openHlsUrl = `http://${host}:${mediaPort}/live/${rawName}/index.m3u8`;
    const secureHlsUrl = playToken 
      ? `http://${host}:${mediaPort}/live/${rawName}/index.m3u8?token=${playToken}`
      : `http://${host}:${mediaPort}/live/${rawName}/index.m3u8?token=viewer_token`;
    
    const openRtmpUrl = `rtmp://${host}:${rtmpPort}/live/${rawName}`;
    const secureRtmpUrl = playToken
      ? `rtmp://${host}:${rtmpPort}/live/${rawName}?token=${playToken}`
      : `rtmp://${host}:${rtmpPort}/live/${rawName}?token=viewer_token`;

    const ingestRtmpUrl = matchingKey?.key
      ? `rtmp://${host}:${rtmpPort}/live/${rawName}?key=${matchingKey.key}`
      : `rtmp://${host}:${rtmpPort}/live/${rawName}`;

    const srtEgress = processes.find((p: any) => p.type === 'relay' && p.destinationUrl?.startsWith('srt://') && (p.streamPath?.includes(rawName) || p.destinationUrl?.includes(rawName)));
    const srtEgressPort = srtEgress?.destinationUrl ? (srtEgress.destinationUrl.match(/:(\d+)/)?.[1] || '9998') : null;
    const srtEgressVlcUrl = srtEgressPort ? `srt://${effectiveHost}:${srtEgressPort}?mode=caller` : `srt://${effectiveHost}:9998?mode=caller`;

    return {
      rawName,
      isSrt,
      srtPort: srtPortNum,
      srtLatency: srtLatencyNum,
      srtObsUrl,
      srtCallerUrl,
      srtEgress,
      srtEgressPort,
      srtEgressVlcUrl,
      openHlsUrl,
      secureHlsUrl,
      openRtmpUrl,
      secureRtmpUrl,
      ingestRtmpUrl,
      matchingKey,
      hasSecureToken: Boolean(playToken)
    };
  };

  const openAddSrtModal = () => {
    const usedPorts = new Set<number>();
    for (const p of processes) {
      if (p.port) usedPorts.add(Number(p.port));
      if (p.destinationUrl) {
        const match = p.destinationUrl.match(/:(\d+)/);
        if (match) usedPorts.add(Number(match[1]));
      }
    }
    for (const p of activeSrtProcesses) {
      if (p.port) usedPorts.add(Number(p.port));
    }

    let nextPort = 8890;
    while (usedPorts.has(nextPort)) {
      nextPort++;
    }

    const activeNames = new Set(processes.map((p: any) => p.streamName || '').filter(Boolean));
    let nextName = 'srt-feed';
    if (activeNames.has(nextName)) {
      let count = 2;
      while (activeNames.has(`srt-feed-${count}`)) {
        count++;
      }
      nextName = `srt-feed-${count}`;
    }

    setSrtPort(String(nextPort));
    setSrtStreamName(nextName);
    setSrtModalOpen(true);
  };

  const startSrtListener = async () => {
    if (licenseStatus === 'expired') {
      return toast.error('Cannot start SRT listener: License has expired. Please activate a valid license.');
    }
    if (licenseStatus && licenseStatus !== 'activated') {
      return toast.error('SRT listener is disabled in Trial / Unlicensed Mode. Please activate a full license.');
    }
    if (!srtPort || !srtStreamName) return toast.error('Port and stream name are required');
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/srt/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ port: Number(srtPort), streamName: srtStreamName, latency: Number(srtLatency) || 200 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start SRT listener');
      toast.success(`SRT Ingest Server active on port ${srtPort}`);
      setSrtModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startEgressPush = async () => {
    if (licenseStatus === 'expired') {
      return toast.error('Cannot start push: License has expired. Please activate a valid license.');
    }
    if (licenseStatus && licenseStatus !== 'activated') {
      return toast.error('Push / Re-transcode is disabled in Trial / Unlicensed Mode. Please activate a full license.');
    }
    if (!relayStreamPath || !relayDestinationUrl) return toast.error('Source stream path and destination URL are required');
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/relay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          streamPath: relayStreamPath,
          destinationUrl: relayDestinationUrl,
          profile: relayProfile,
          customBitrate: relayCustomBitrate,
          customResolution: relayCustomResolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start egress push');
      toast.success('Push / Re-transcoding output started!');
      setRelayModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const [startingPlayoutFor, setStartingPlayoutFor] = useState<string | null>(null);

  const handleStartAutoSrtPlayout = async (rawName: string) => {
    if (licenseStatus === 'expired') {
      return toast.error('Cannot start playout: License has expired. Please activate a valid license.');
    }
    if (licenseStatus && licenseStatus !== 'activated') {
      return toast.error('Playout is disabled in Trial / Unlicensed Mode. Please activate a full license.');
    }
    try {
      setStartingPlayoutFor(rawName);
      // Find all used ports across active processes
      const usedPorts = new Set<number>();
      for (const p of processes) {
        if (p.port) usedPorts.add(Number(p.port));
        if (p.destinationUrl) {
          const match = p.destinationUrl.match(/:(\d+)/);
          if (match) usedPorts.add(Number(match[1]));
        }
      }

      // Auto-assign first free port starting from 9998
      let autoPort = 9998;
      while (usedPorts.has(autoPort)) {
        autoPort++;
      }

      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/relay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          streamPath: `/live/${rawName}`,
          destinationUrl: `srt://0.0.0.0:${autoPort}?mode=listener`,
          profile: 'copy',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start SRT Playout');

      const vlcUrl = `srt://${effectiveHost}:${autoPort}?mode=caller`;
      copyToClipboard(vlcUrl, 'VLC SRT Playout URL');
      toast.success(`🎬 SRT Playout active on port ${autoPort}! VLC URL copied.`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Error starting SRT Playout');
    } finally {
      setStartingPlayoutFor(null);
    }
  };

  const stopProcess = async (id: string) => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ingest/processes/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to stop process');
      toast.success('Process terminated');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteRecordItem = (idOrRec: any) => {
    if (typeof idOrRec === 'object' && idOrRec !== null) {
      setDeletingRec(idOrRec);
    } else {
      const rec = recordings.find((r: any) => String(r.id) === String(idOrRec));
      setDeletingRec(rec || { id: idOrRec });
    }
  };

  const confirmDeleteRecording = async () => {
    if (!deletingRec) return;
    setDeleteLoading(true);
    try {
      await deleteRecording(Number(deletingRec.id) || deletingRec.id);
      toast.success('Recording deleted');
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete recording');
    } finally {
      setDeleteLoading(false);
      setDeletingRec(null);
    }
  };

  const openInspector = (streamKey: string, streamData: any) => {
    setSelectedStreamKey(streamKey);
    setInspectedStream(streamData);
    setInspectorOpen(true);
  };

  const isCurrentRecordingActive = useMemo(() => {
    if (sourceType === 'device') {
      const devName = videoDevice || audioDevice;
      const normalizedDeviceName = devName
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-');
      return recordings.some((r: any) => r.is_active && (
        (r.app === 'device' || r.source_type === 'device') &&
        devName &&
        (r.stream === normalizedDeviceName || r.inputDevice === devName || r.input_device === devName)
      ));
    }
    if (!selectedStreamKey) return false;
    const [app, stream] = selectedStreamKey.includes('/') ? selectedStreamKey.split('/') : ['live', selectedStreamKey];
    return !!(
      activeRecordingKeys[selectedStreamKey] ||
      activeRecordingKeys[`${app}/${stream}`] ||
      recordingStatuses[`${app}/${stream}`] ||
      recordings.some((r: any) => r.is_active && (r.stream === stream || `${r.app}/${r.stream}` === `${app}/${stream}` || `${r.app}/${r.stream}` === selectedStreamKey))
    );
  }, [sourceType, videoDevice, audioDevice, selectedStreamKey, activeRecordingKeys, recordingStatuses, recordings]);

  const handleStopControlRecording = async () => {
    const selected = sourceType === 'device'
      ? (videoDevice || audioDevice || 'device')
      : selectedStreamKey;

    if (!selected) return toast.error('Select an active stream or device source');

    const [appName, streamName] = sourceType === 'device'
      ? ['device', selected]
      : selected.includes('/')
      ? selected.split('/')
      : ['live', selected];

    try {
      await stopRecording(appName, streamName);
      toast.success(`Stopped recording: ${selected}`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to stop recording');
    }
  };

  const filteredRecordings = recordings.filter((r: any) =>
    (r.file_name || r.stream || '').toLowerCase().includes(recSearch.toLowerCase())
  );

  const totalRecordingBytes = recordings.reduce((sum, r) => sum + Number(r.size || 0), 0);
  const rtmpEndpointUrl = `rtmp://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${settings.rtmpPort || 1935}/live/{stream_key}`;

  /* ══════════════════════════════════════════════════════════════════════════
     INGEST SERVER MODE (RECORDS & DEVICE CAPTURE ONLY - NO LIVE STREAMS TABLE)
     ══════════════════════════════════════════════════════════════════════════ */
  if (mode === 'recording') {
    return (
      <div className="ingest-workspace page-stack space-y-4">
        {/* Ingest Server Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3.5 rounded-2xl shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-[20px] font-extrabold text-[#1B1024] dark:text-white">Ingest Server</h1>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:border-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Licensed
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
              Capture live video &amp; audio and record broadcast-quality files
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={refreshDevices}
              className="flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-[12px] font-bold text-white shadow-xs hover:bg-violet-700 transition-colors"
            >
              <RefreshCw size={14} className={devicesLoading ? 'animate-spin' : ''} /> Detect Devices
            </button>
          </div>
        </div>

        {/* License Warning Banner */}
        {licenseStatus && licenseStatus !== 'activated' && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-[12px] text-amber-900 shadow-xs">
            <Radio className="h-4 w-4 text-amber-600 shrink-0 animate-pulse" />
            <span>
              <strong>{licenseStatus === 'expired' ? 'License Expired' : 'Trial Mode Notice'}:</strong> Hardware capture and stream recording operations are disabled in {licenseStatus === 'expired' ? 'unlicensed' : 'trial'} mode. Please activate a full server license to enable recordings.
            </span>
          </div>
        )}

        {/* Ingest Top 4 KPI Cards */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Video Devices */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 border border-violet-100 dark:bg-violet-950/60 dark:border-violet-900 dark:text-violet-300">
              <Video size={22} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Video Devices</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="font-mono text-[22px] font-extrabold text-[#1B1024] dark:text-white leading-tight">
                  {videoDevices.length}
                </p>
                <span className="text-[11px] font-medium text-slate-500 dark:text-[#B9A5CD]">Connected</span>
              </div>
            </div>
          </div>

          {/* 2. Audio Devices */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/60 dark:border-blue-900 dark:text-blue-300">
              <Users size={22} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Audio Devices</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="font-mono text-[22px] font-extrabold text-[#1B1024] dark:text-white leading-tight">
                  {audioDevices.length}
                </p>
                <span className="text-[11px] font-medium text-slate-500 dark:text-[#B9A5CD]">Connected</span>
              </div>
            </div>
          </div>

          {/* 3. Total Recordings */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100 dark:bg-fuchsia-950/60 dark:border-fuchsia-900 dark:text-fuchsia-300">
              <Archive size={22} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Total Recordings</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="font-mono text-[22px] font-extrabold text-[#1B1024] dark:text-white leading-tight">
                  {recordings.length}
                </p>
                <span className="text-[11px] font-medium text-slate-500 dark:text-[#B9A5CD]">All time</span>
              </div>
            </div>
          </div>

          {/* 4. Storage Usage */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-950/60 dark:border-purple-900 dark:text-purple-300">
              <HardDrive size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
                  {storageStatus ? `Storage (${storageStatus.mount})` : 'Storage (checking…)'}
                </span>
                <span className="font-mono text-[11px] font-bold text-violet-700 dark:text-violet-300">
                  {storageStatus ? `${storageStatus.usePercent.toFixed(1)}%` : '—'}
                </span>
              </div>
              <p className="font-mono text-[11px] font-bold text-[#1B1024] dark:text-white truncate mt-0.5">
                {storageStatus
                  ? `${storageStatus.usedFmt} / ${storageStatus.sizeFmt} used`
                  : 'Storage status unavailable'}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 mt-1.5">
                <div
                  className="h-full rounded-full bg-violet-600 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, storageStatus?.usePercent ?? 0))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Professional Device Capture & Recording Control */}
        <ProfessionalRecordingControl
          config={config}
          setConfig={setConfig}
          sourceType={sourceType}
          setSourceType={setSourceType}
          streams={localStreams}
          selectedStreamKey={selectedStreamKey}
          setSelectedStreamKey={setSelectedStreamKey}
          videoDevices={videoDevices}
          audioDevices={audioDevices}
          videoDevice={videoDevice}
          audioDevice={audioDevice}
          setVideoDevice={setVideoDevice}
          setAudioDevice={setAudioDevice}
          refreshDevices={refreshDevices}
          devicesLoading={devicesLoading}
          toggleFormat={toggleFormat}
          save={saveConfig}
          saving={savingConfig}
          start={handleStartControlRecording}
          isRecordingActive={isCurrentRecordingActive}
          stopRecording={handleStopControlRecording}
          profiles={profiles}
          recordingProfiles={recordingProfiles}
          recordingEncoders={recordingEncoders}
          activeRecordings={recordings.filter((recording: any) => recording?.is_active)}
          api={api}
        />

        {/* Recent Recordings Table */}
        <div className="rounded-2xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#1E1130] dark:border-[#371F59]">
          <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#371F59]">
            <div>
              <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">Recent Recordings</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Master broadcast captures and recent stream recordings</p>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <input
                  type="text"
                  value={recSearch}
                  onChange={e => setRecSearch(e.target.value)}
                  placeholder="Search recordings..."
                  className="h-8 w-48 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-violet-600 dark:bg-[#25163C] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
                />
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
              </div>

              <a
                href="#recordings"
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof window !== 'undefined') {
                    window.location.hash = 'recordings';
                  }
                }}
                className="flex h-8 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-bold text-violet-700 hover:bg-violet-100 dark:bg-violet-950/60 dark:border-violet-800 dark:text-violet-300"
              >
                View Library <ArrowUpRight size={13} />
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335]/70 dark:border-[#311B4E] dark:text-[#B9A5CD]">
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Input Device / Source</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Encoder</th>
                  <th className="px-4 py-3">Resolution</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {filteredRecordings.slice((recPage - 1) * recPerPage, recPage * recPerPage).map((rec: any) => (
                  <tr key={rec.id} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#281640]/50">
                    <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">
                      <div className="flex items-center gap-2">
                        <Film size={14} className="text-[#6D32D9] dark:text-[#A78BFA]" />
                        <span className="truncate max-w-[220px]" title={rec.file_name || rec.stream || `recording_${rec.id}`}>{rec.file_name || rec.stream || `recording_${rec.id}`}</span>
                      </div>
                      {rec.capture_status === 'incomplete' && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <AlertCircle size={10} /> Incomplete capture
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-700 dark:text-[#B9A5CD]">
                      <span className="rounded bg-violet-50 px-2 py-0.5 font-semibold text-[#6D32D9] border border-violet-200 dark:bg-violet-950/50 dark:border-violet-800/40 dark:text-violet-300">
                        {formatDeviceDisplayName(rec.input_device || rec.stream, videoDevices)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProtocolBadge protocol={getRecordingFormat(rec).toUpperCase()} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078] uppercase dark:text-[#B9A5CD]">
                      {rec.encoder || 'CPU'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                      {rec.resolution || '1920x1080'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {rec.is_active ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px] whitespace-nowrap dark:bg-rose-950/50 dark:border-rose-900/60 dark:text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                          REC {formatRecordingDuration(getLiveDurationSeconds(rec))}
                        </span>
                      ) : (
                        <span className="text-[#6F6078] text-[11px] dark:text-[#8E78A6]">
                          {formatRecordingDuration(getLiveDurationSeconds(rec))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#1B1024] dark:text-white">
                      {formatBytes(rec.size || 0)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setRecPreview(rec)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2D1A45]"
                      >
                        <Play size={12} /> Preview
                      </button>

                      <a
                        href={getRecordingDownloadUrl(rec)}
                        download={rec.file_name || 'recording.mp4'}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6D32D9] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#A78BFA] dark:hover:bg-[#2D1A45]"
                        title="Download recording file to computer"
                      >
                        <Download size={12} /> Download
                      </a>

                      {!!rec.is_active && (
                        <button
                          type="button"
                          onClick={() => handleToggleRecord(rec.app || 'live', rec.stream || rec.file_name)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-semibold text-[#DC3545] hover:bg-[#FEE2E2] dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/70"
                          title="Stop active recording"
                        >
                          <Square size={12} className="fill-[#DC3545] dark:fill-rose-400" /> Stop Recording
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeletingRec(rec)}
                        className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#451220] dark:hover:text-[#F87171]"
                        title="Delete recording archive"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredRecordings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#6F6078] dark:text-[#8E78A6]">
                      No recording archives found. Start a recording above to capture live feeds or device inputs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Bar */}
          <div className="flex flex-col gap-3 border-t border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between bg-[#F8F7FA]/60 dark:bg-[#211335]/50 dark:border-[#311B4E]">
            <div className="flex items-center gap-2 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
              <span>Showing</span>
              <span className="font-semibold text-[#1B1024] dark:text-white">
                {filteredRecordings.length === 0 ? 0 : (recPage - 1) * recPerPage + 1}
              </span>
              <span>to</span>
              <span className="font-semibold text-[#1B1024] dark:text-white">
                {Math.min(recPage * recPerPage, filteredRecordings.length)}
              </span>
              <span>of</span>
              <span className="font-semibold text-[#1B1024] dark:text-white">{filteredRecordings.length}</span>
              <span>recordings</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
                <span>Rows:</span>
                <select
                  value={recPerPage}
                  onChange={e => {
                    setRecPerPage(Number(e.target.value));
                    setRecPage(1);
                  }}
                  className="h-7 rounded border border-[#E8DFF0] bg-white px-2 text-[11px] text-[#1B1024] outline-none dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={recPage <= 1}
                  onClick={() => setRecPage(p => Math.max(1, p - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[#E8DFF0] bg-white text-[#1B1024] hover:bg-[#F4EEFF] disabled:opacity-40 disabled:hover:bg-white dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:hover:bg-[#2D1A45] dark:disabled:hover:bg-[#211335]"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>

                <span className="px-2 text-[11px] font-medium text-[#6F6078] dark:text-[#B9A5CD]">
                  Page {recPage} of {Math.max(1, Math.ceil(filteredRecordings.length / recPerPage))}
                </span>

                <button
                  type="button"
                  disabled={recPage >= Math.max(1, Math.ceil(filteredRecordings.length / recPerPage))}
                  onClick={() => setRecPage(p => Math.min(Math.max(1, Math.ceil(filteredRecordings.length / recPerPage)), p + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[#E8DFF0] bg-white text-[#1B1024] hover:bg-[#F4EEFF] disabled:opacity-40 disabled:hover:bg-white dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:hover:bg-[#2D1A45] dark:disabled:hover:bg-[#211335]"
                  title="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Video Preview Modal */}
        <DetailDrawer
          open={!!recPreview}
          onClose={() => setRecPreview(null)}
          title={`Recording Preview — ${recPreview?.file_name || recPreview?.id}`}
          subtitle="Video file playback and recording specifications"
          width="max-w-[560px]"
        >
          {recPreview && (
            <div className="space-y-4">
              <MediaPreview
                url={getRecordingUrl(recPreview)}
                title={recPreview.file_name}
                maxHeight={320}
                isLive={false}
                isRecording={Boolean(recPreview.is_active)}
              />

              {!!recPreview.is_active && (
                <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 dark:bg-rose-950/40 dark:border-rose-900/60">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#DC3545] animate-pulse dark:bg-rose-400" />
                    <span className="text-[12px] font-bold text-[#DC3545] dark:text-rose-300">Active Recording Session</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await stopRecording(recPreview.app || 'live', recPreview.stream || recPreview.file_name);
                      toast.success('Recording stopped');
                      setRecPreview(null);
                      fetchData();
                    }}
                    className="flex items-center gap-1 rounded-md bg-[#DC3545] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#B91C1C] dark:bg-rose-600 dark:hover:bg-rose-700"
                  >
                    <Square size={12} className="fill-white" /> Stop Recording Now
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">File Size</span>
                  <p className="font-mono font-bold text-[#1B1024] dark:text-white">{formatBytes(recPreview.size || 0)}</p>
                </div>
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Format</span>
                  <p className="font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">{getRecordingFormat(recPreview).toUpperCase()}</p>
                </div>
              </div>
              <CodeField
                value={recPreview.file_path || `media/recordings/${recPreview.file_name}`}
                label="Recording Storage Path"
              />
            </div>
          )}
        </DetailDrawer>

        <ConfirmDialog
          open={!!deletingRec}
          title="Delete Recording File"
          message={`Are you sure you want to delete recording "${deletingRec?.file_name || deletingRec?.stream || 'archive'}"? The file will be permanently deleted.`}
          confirmLabel="Delete File"
          variant="danger"
          loading={deleteLoading}
          onConfirm={confirmDeleteRecording}
          onCancel={() => setDeletingRec(null)}
        />
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LIVE SERVER MODE (LIVE STREAMS, SRT LISTENERS & RTMP RELAYS ONLY)
     ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="ingest-workspace page-stack space-y-4">
      {/* Live Server Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">Live Server & Relay Controls</h1>
            <span className="rounded-full bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A36A] dark:bg-[#064E3B] dark:border-[#047857] dark:text-[#34D399]">
              {activeStreamKeys.length} Live Stream{activeStreamKeys.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Incoming RTMP, SRT streams, background relays, and live monitoring
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* RTMP Ingest Security & Stream Keys Button */}
          <button
            type="button"
            onClick={() => setSecurityModalOpen(true)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-bold shadow-xs transition-colors cursor-pointer ${
              rtmpSecurityEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
            title="Configure URL-based stream keys (?key=...) and publisher security"
          >
            {rtmpSecurityEnabled ? (
              <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" />
            )}
            <span>{rtmpSecurityEnabled ? 'Secure Ingest (Active)' : 'Open / Unsecure Ingest'}</span>
            {rtmpKeysCount > 0 && (
              <span className="ml-1 rounded-full bg-violet-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white">
                {rtmpKeysCount} {rtmpKeysCount === 1 ? 'Key' : 'Keys'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={openAddSrtModal}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:hover:bg-[#2F1A4B] cursor-pointer"
          >
            <Activity size={13} className="text-[#16A36A] dark:text-[#34D399]" /> Add SRT Listener
          </button>
          <button
            type="button"
            onClick={() => {
              const defaultStream = activeStreamKeys[0] ? `/live/${activeStreamKeys[0].replace(/^live\//, '')}` : '/live/srt-feed';
              setRelayStreamPath(defaultStream);
              setRelayModalOpen(true);
            }}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:bg-[#0F172A] dark:border-[#334155] dark:text-white dark:hover:bg-[#334155] cursor-pointer"
          >
            <Send size={13} className="text-[#6D32D9] dark:text-[#A78BFA]" /> Push / Re-Transcode
          </button>
          <button
            type="button"
            onClick={fetchData}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#0F172A] dark:border-[#334155] dark:text-[#F8FAFC] dark:hover:bg-[#334155]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* License Warning Banner */}
      {licenseStatus && licenseStatus !== 'activated' && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-[12px] text-amber-900 shadow-xs dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
          <Radio className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
          <span>
            <strong>{licenseStatus === 'expired' ? 'License Expired' : 'Trial Mode Notice'}:</strong> Live RTMP ingest, SRT listener, and background relay operations are disabled in {licenseStatus === 'expired' ? 'unlicensed' : 'trial'} mode. Please activate a full server license to enable live operations.
          </span>
        </div>
      )}

      {/* Live Server Summary KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#1E293B] dark:border-[#334155]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#94A3B8]">Active Ingests</span>
          <p className="font-mono text-[20px] font-bold text-[#1B1024] dark:text-white">{activeStreamKeys.length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#1E293B] dark:border-[#334155]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#94A3B8]">Incoming Bitrate</span>
          <p className="font-mono text-[20px] font-bold text-[#7C3AED] dark:text-[#34D399]">{formatBitrate(Number(totalBitrateKbps) || 0)}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#1E293B] dark:border-[#334155]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#94A3B8]">Active Recordings</span>
          <p className="font-mono text-[20px] font-bold text-[#E11D72] dark:text-[#F472B6]">{Object.keys(activeRecordingKeys).length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#1E293B] dark:border-[#334155]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#94A3B8]">Relays & Listeners</span>
          <p className="font-mono text-[20px] font-bold text-[#4A1B7A] dark:text-[#C4B5FD]">{processes.length}</p>
        </div>
      </div>

      {/* Dual Ingest Servers Architecture: RTMP Server & SRT Server */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* RTMP Server Card */}
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-bold text-sm text-[#1B1024] dark:text-white flex items-center gap-1.5">
                  <Zap size={15} className="text-violet-600 dark:text-violet-400" />
                  RTMP Ingest Server
                </h3>
              </div>
              <span className="rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 px-2 py-0.5 text-[10px] font-extrabold uppercase">
                Port {settings.rtmpPort || 1935} • Zero-Encode
              </span>
            </div>

            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD] mb-2.5">
              Receives live FLV/RTMP streams from OBS, vMix, and encoders with direct zero-CPU passthrough to HLS/RTMP viewers.
            </p>

            <div className="bg-[#F8F7FA] dark:bg-[#120820] border border-[#E8DFF0] dark:border-[#371F59] rounded-lg p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] uppercase font-bold text-[#8E78A6]">Sender Ingest URL</span>
                <span className="font-mono text-xs font-bold text-violet-700 dark:text-emerald-300 truncate block select-all">
                  {rtmpEndpointUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(rtmpEndpointUrl, 'RTMP Ingest URL')}
                className="shrink-0 inline-flex items-center gap-1 rounded-md bg-violet-600 hover:bg-violet-700 text-white px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer"
              >
                <Copy size={11} /> Copy
              </button>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#E8DFF0] dark:border-[#311B4E] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-[#6F6078] dark:text-[#B9A5CD]">
              {rtmpSecurityEnabled ? <Lock size={12} className="text-emerald-500" /> : <Unlock size={12} className="text-amber-500" />}
              <span>{rtmpSecurityEnabled ? `Protected (${rtmpKeysCount} key${rtmpKeysCount !== 1 ? 's' : ''})` : 'Open Ingest'}</span>
            </div>
            <button
              type="button"
              onClick={() => setSecurityModalOpen(true)}
              className="font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 cursor-pointer"
            >
              Configure Keys &rarr;
            </button>
          </div>
        </div>

        {/* SRT Server Card */}
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`flex h-2.5 w-2.5 rounded-full ${activeSrtProcesses.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <h3 className="font-bold text-sm text-[#1B1024] dark:text-white flex items-center gap-1.5">
                  <Radio size={15} className="text-purple-600 dark:text-purple-400" />
                  SRT Ingest Server
                </h3>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                activeSrtProcesses.length > 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {activeSrtProcesses.length > 0 ? `Port ${activeSrtProcesses[0].port || 8890} • Listening` : 'Ready to Start'}
              </span>
            </div>

            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD] mb-2.5">
              Zero-encode receiver: Ingests incoming SRT streams from field cameras or hardware encoders and demuxes directly to HLS live preview without re-encoding.
            </p>

            {activeSrtProcesses.length > 0 ? (
              <div className="space-y-2">
                <div className="bg-[#F8F7FA] dark:bg-[#120820] border border-emerald-300 dark:border-emerald-900 rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="block text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400">SRT Caller Ingest Address (Encoder Feed)</span>
                      <span className="text-[9px] font-extrabold px-1 rounded bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200 uppercase">Input Feed</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300 truncate block select-all mt-0.5">
                      {`srt://${effectiveHost}:${activeSrtProcesses[0].port || 8890}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`srt://${effectiveHost}:${activeSrtProcesses[0].port || 8890}`, 'SRT Ingest Address')}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    <Copy size={11} /> Copy Address
                  </button>
                </div>

                <div className="bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 rounded-lg p-2.5 text-[10px] text-purple-900 dark:text-purple-300 space-y-1">
                  <div><strong>Encoder Setup:</strong> Protocol: <code>SRT (Caller mode)</code> &bull; Server: <code>srt://{effectiveHost}:{activeSrtProcesses[0].port || 8890}</code> &bull; Latency: <code>200ms</code></div>
                  <div className="text-[9.5px] text-[#6F6078] dark:text-[#B9A5CD] border-t border-purple-200/60 dark:border-purple-800/40 pt-1 mt-1">
                    💡 <strong>VLC &amp; Media Players:</strong> Open <strong>Media &rarr; Open Network Stream</strong> with the <strong>HLS URL</strong> (<code>http://{effectiveHost}:{settings?.mediaPort || 8080}/live/{activeSrtProcesses[0].streamName || 'srt-feed'}/index.m3u8</code>). To stream raw SRT packets to VLC, start an <strong>SRT Playout</strong> transmitter on a separate port (e.g. <code>srt://{effectiveHost}:9998</code>).
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#F8F7FA] dark:bg-[#120820] border border-[#E8DFF0] dark:border-[#371F59] rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[9px] uppercase font-bold text-[#8E78A6]">Default SRT Listener</span>
                  <span className="font-mono text-xs text-[#6F6078] dark:text-[#B9A5CD] truncate block">
                    Port {srtPort || 8890} • Target: /live/{srtStreamName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={openAddSrtModal}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-[11px] font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  <Play size={12} /> Start SRT Server
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#E8DFF0] dark:border-[#311B4E] flex items-center justify-between text-[11px]">
            {activeSrtProcesses.length > 0 ? (
              <>
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                  <Activity size={12} className="text-emerald-500 animate-pulse" />
                  Playing directly to: /live/{activeSrtProcesses[0].streamName || 'srt-feed'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openAddSrtModal}
                    className="font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 cursor-pointer"
                  >
                    + Add Port
                  </button>
                  <button
                    type="button"
                    onClick={() => stopProcess(activeSrtProcesses[0].id)}
                    className="font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 cursor-pointer"
                  >
                    Stop Server
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-[#6F6078] dark:text-[#B9A5CD]">
                  Direct pass-through (0% CPU load)
                </span>
                <button
                  type="button"
                  onClick={openAddSrtModal}
                  className="font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 cursor-pointer"
                >
                  Launch SRT Server &rarr;
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Active Ingest Streams Table */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#1E293B] dark:border-[#334155]">
        <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#334155]">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Active Ingest Streams</h2>
            <p className="text-[11px] text-[#6F6078] dark:text-[#94A3B8]">Currently publishing RTMP and SRT live streams</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Dual RTMP &amp; SRT Ingest Receiver
            </span>
          </div>
        </div>

        {activeStreamKeys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#0F172A] dark:border-[#334155] dark:text-[#94A3B8]">
                  <th className="px-4 py-3">Stream Identity &amp; Auth</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Video Incoming</th>
                  <th className="px-4 py-3">Audio Stream</th>
                  <th className="px-4 py-3">Playback URLs (Open &amp; Secure)</th>
                  <th className="px-4 py-3">Recording</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#334155]">
                {Object.entries(localStreams).map(([key, stream]: [string, any]) => {
                  const isRec = !!(recordingStatuses[key] || activeRecordingKeys[key]);
                  const bitrateKbps = Number(stream.bitrate || stream.incoming_kbps || stream.incomingBitrate || stream.publisher?.video?.bitrate || 0);
                  const recItem = stream.recording || recordings.find((r: any) => r.is_active && (`${r.app}/${r.stream}` === key || r.stream === stream.name || (r.file_name && r.file_name.includes(stream.name))));
                  const recStartTime = recItem?.start_time || recItem?.created_at;
                  const urls = getStreamUrls(key, stream);

                  return (
                    <tr key={key} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#334155]/50">
                      <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#16A36A] animate-pulse shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-[13px] text-[#1B1024] dark:text-white truncate">
                              {urls.rawName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                              {urls.matchingKey ? (
                                <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-200">
                                  <Lock size={9} /> {urls.matchingKey.name || 'Protected Key'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  Open Ingest
                                </span>
                              )}
                              {stream.ip && <span>• IP: {stream.ip}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {(() => {
                          const isSrt = activeSrtProcesses.some((p: any) => p.streamName === stream.name || p.streamName === urls.rawName || String(stream.name || '').includes('srt') || String(urls.rawName || '').includes('srt'));
                          return <ProtocolBadge protocol={isSrt ? 'SRT' : (stream.protocol || 'RTMP')} />;
                        })()}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#1B1024] dark:text-white">
                        <div className="flex items-center gap-1.5 font-bold text-[#7C3AED] dark:text-[#C4B5FD]">
                          <span className={`h-1.5 w-1.5 rounded-full ${bitrateKbps > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          <span>{formatBitrate(bitrateKbps)}</span>
                        </div>
                        <div className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] mt-0.5 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span className="font-bold uppercase text-purple-700 dark:text-purple-300">
                              {stream.videoCodec || stream.publisher?.video?.codec || 'H.264'}
                            </span>
                            {(stream.videoProfile || stream.publisher?.video?.profile) && (
                              <span className="text-[9px] text-[#8E78A6]">({stream.videoProfile || stream.publisher?.video?.profile})</span>
                            )}
                          </div>
                          <div>
                            {stream.resolution || (stream.width && stream.height ? `${stream.width}x${stream.height}` : '1920x1080')} @ {stream.fps || 30} fps
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#1B1024] dark:text-white">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          <span className="uppercase text-violet-700 dark:text-violet-300">
                            {stream.audioCodec || stream.publisher?.audio?.codec || 'AAC'}
                          </span>
                          <span className="opacity-80"> ({stream.audioBitrate || stream.publisher?.audio?.bitrate || 128} kbps)</span>
                        </div>
                        <div className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] mt-0.5 space-y-0.5">
                          <div>
                            {stream.audioSamplerate || stream.sampleRate || 48000} Hz &bull; {stream.audioChannels || 2}ch
                          </div>
                          <div className="text-[9px] text-[#8E78A6]">
                            {Number(stream.audioChannels || 2) === 1 ? 'Mono' : 'Stereo'}
                          </div>
                        </div>
                      </td>

                      {/* Playback & Ingest URLs Quick Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                          {urls.isSrt ? (
                            <>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(urls.openHlsUrl, 'Open HLS URL')}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300 cursor-pointer"
                                title={urls.openHlsUrl}
                              >
                                <Tv size={10} /> 🔓 HLS Preview
                              </button>

                              {urls.srtEgress ? (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(urls.srtEgressVlcUrl, 'VLC SRT Playout URL')}
                                  className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300 cursor-pointer"
                                  title={`Live SRT Playout for VLC: Open Network Stream -> ${urls.srtEgressVlcUrl}`}
                                >
                                  <Play size={10} className="text-amber-600" /> 🎬 VLC SRT :{urls.srtEgressPort}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={startingPlayoutFor === urls.rawName}
                                  onClick={() => handleStartAutoSrtPlayout(urls.rawName)}
                                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50/70 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 cursor-pointer disabled:opacity-50"
                                  title="1-Click Auto-Start SRT Playout on next free port and copy VLC address"
                                >
                                  {startingPlayoutFor === urls.rawName ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin text-amber-600" /> Starting...
                                    </>
                                  ) : (
                                    <>
                                      <Play size={10} /> 🎬 SRT Playout (VLC)
                                    </>
                                  )}
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(urls.openHlsUrl, 'Open HLS URL')}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300 cursor-pointer"
                                title={urls.openHlsUrl}
                              >
                                <Tv size={10} /> 🔓 HLS
                              </button>

                              <button
                                type="button"
                                onClick={() => copyToClipboard(urls.secureHlsUrl, 'Secure Tokenized HLS URL')}
                                className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-800 hover:bg-purple-100 dark:bg-purple-950/60 dark:border-purple-800 dark:text-purple-300 cursor-pointer"
                                title={urls.secureHlsUrl}
                              >
                                <Lock size={10} /> 🔒 HLS Token
                              </button>

                              <button
                                type="button"
                                onClick={() => copyToClipboard(urls.openRtmpUrl, 'RTMP Playback URL')}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                                title={urls.openRtmpUrl}
                              >
                                <Radio size={10} /> RTMP
                              </button>

                              <button
                                type="button"
                                onClick={() => copyToClipboard(urls.openRtmpUrl, 'VLC Network Stream URL')}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300 cursor-pointer"
                                title={`Play in VLC: Open Network Stream -> ${urls.openRtmpUrl}`}
                              >
                                <Play size={10} /> 🎬 VLC
                              </button>

                              <button
                                type="button"
                                onClick={() => copyToClipboard(urls.ingestRtmpUrl, 'RTMP Ingest URL')}
                                className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800 hover:bg-violet-100 dark:bg-violet-950/60 dark:border-violet-800 dark:text-violet-300 cursor-pointer"
                                title={urls.ingestRtmpUrl}
                              >
                                <Zap size={10} /> Ingest
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isRec ? 'bg-[#FCE7F3] text-[#E11D72] dark:bg-[#831843] dark:text-[#F472B6]' : 'bg-[#F8F7FA] text-[#6F6078] dark:bg-[#211335] dark:text-[#B9A5CD]'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isRec ? 'bg-[#E11D72] animate-pulse dark:bg-[#F472B6]' : 'bg-[#8E8895]'}`} />
                            {isRec ? 'RECORDING' : 'Idle'}
                          </span>
                          {isRec && recStartTime && (
                            <span className="font-mono text-[10px] font-bold text-[#E11D72] dark:text-[#F472B6] flex items-center gap-1">
                              ⏱ {formatRecordingTime(recStartTime)}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openInspector(key, stream)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-bold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] cursor-pointer"
                        >
                          <Activity size={12} /> Monitor
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRelayStreamPath(`/live/${urls.rawName}`);
                            setRelayModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:border-purple-800 dark:text-purple-300 px-2.5 py-1 text-[11px] font-bold cursor-pointer"
                          title="Push / Re-transcode to UDP / SRT / RTMP / RTSP"
                        >
                          <Send size={12} /> Push / Transcode
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleRecord(stream.app || 'live', stream.name || key)}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                            isRec
                              ? 'border border-[#FECACA] bg-[#FEF2F2] text-[#DC3545] dark:bg-rose-950 dark:border-rose-800'
                              : 'border border-[#E8DFF0] bg-white text-[#1B1024] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-white'
                          }`}
                        >
                          {isRec ? <Square size={12} /> : <Radio size={12} />}
                          {isRec ? 'Stop' : 'Record'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid min-h-[160px] place-items-center p-6 text-center">
            <div>
              <Zap size={24} className="mx-auto text-[#6F6078]" />
              <h3 className="mt-2 font-display text-[14px] font-bold text-[#1B1024]">No active streams</h3>
              <p className="mt-1 text-[11px] text-[#6F6078] max-w-md">
                Incoming RTMP or SRT feeds will appear here automatically when published to this server endpoint.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Active Background Ingest Processes Table */}
      {(() => {
        const activeListeners = processes.filter(p => p.type === 'srt-listener' || p.type === 'srt' || (p.url?.startsWith('srt://') && p.url?.includes('mode=listener')));
        if (activeListeners.length === 0) return null;
        return (
          <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-2.5 bg-[#F8F7FA] dark:bg-[#120820] dark:border-[#311B4E]">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-purple-600 dark:text-purple-400" />
                <span className="font-display text-[13px] font-bold text-[#1B1024] dark:text-white">
                  Active Ingest Servers &amp; Listeners ({activeListeners.length})
                </span>
              </div>
              <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">Zero-re-encoding SRT ingest &amp; playout listeners</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#120820] dark:border-[#311B4E] dark:text-[#94A3B8]">
                    <th className="px-4 py-2.5">Protocol &amp; Port</th>
                    <th className="px-4 py-2.5">Field Sender Address</th>
                    <th className="px-4 py-2.5">Local Live Target</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                  {activeListeners.map(proc => {
                  const isSrt = proc.type === 'srt-listener';
                  const obsDirectUrl = isSrt ? `srt://${effectiveHost}:${proc.port || 8890}` : '';
                  const srtSenderUrl = isSrt
                    ? `srt://${effectiveHost}:${proc.port || 8890}?mode=caller&latency=${proc.latency || 200}`
                    : '';
                  const targetStreamKey = isSrt ? (proc.streamName || 'srt-feed') : (proc.streamPath || '');
                  const hasSignal = Boolean(
                    localStreams[targetStreamKey] ||
                    localStreams[`live/${targetStreamKey}`] ||
                    localStreams[targetStreamKey.replace(/^\//, '')]
                  );

                  const isSrtPlayout = !isSrt && proc.url?.startsWith('srt://') && proc.url?.includes('mode=listener');
                  const playoutPort = isSrtPlayout ? (proc.url.match(/:(\d+)/)?.[1] || '9998') : null;
                  const vlcUrl = playoutPort ? `srt://${effectiveHost}:${playoutPort}` : '';
                  const fullVlcUrl = playoutPort ? `srt://${effectiveHost}:${playoutPort}?mode=caller` : '';

                  return (
                    <tr key={proc.id} className="transition-colors hover:bg-[#F4EEFF]/40 dark:hover:bg-[#25153A]/40">
                      <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${hasSignal ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                          <div>
                            <div className="font-bold text-[12px] text-[#1B1024] dark:text-white flex items-center gap-1.5 flex-wrap">
                              {isSrt ? (
                                <span className="rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.2 text-[10px] font-extrabold">
                                  SRT Server :{proc.port || 8890}
                                </span>
                              ) : isSrtPlayout ? (
                                <span className="rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-1.5 py-0.2 text-[10px] font-extrabold flex items-center gap-1">
                                  <Play size={10} />
                                  SRT Playout :{playoutPort}
                                </span>
                              ) : (
                                <>
                                  <span className="rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 px-1.5 py-0.2 text-[10px] font-extrabold flex items-center gap-1">
                                    <Send size={10} />
                                    {proc.url?.startsWith('udp://') ? 'UDP Egress' : proc.url?.startsWith('srt://') ? 'SRT Push' : proc.url?.startsWith('rtsp') ? 'RTSP Feed' : 'RTMP Push'}
                                  </span>
                                  <span className="rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-1 py-0.2 text-[9px] font-semibold">
                                    {proc.profile === 'nvenc_1080p' ? 'NVENC 1080p' : proc.profile === 'nvenc_720p' ? 'NVENC 720p' : proc.profile === 'software_1080p' ? 'x264 1080p' : proc.profile === 'software_720p' ? 'x264 720p' : proc.profile === 'software_576p_dvb' ? 'DVB CBR' : 'Direct Pass-Through'}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-[#8E78A6] mt-0.5">{proc.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {isSrt ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-extrabold uppercase px-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">INGEST</span>
                              <code className="font-mono text-[11px] font-bold text-purple-700 dark:text-purple-300 select-all truncate max-w-[220px]">
                                {obsDirectUrl}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(obsDirectUrl, 'SRT Ingest Address')}
                                className="shrink-0 rounded p-1 text-[#8E78A6] hover:bg-purple-100 dark:hover:bg-purple-950 hover:text-purple-700 transition-colors"
                                title="Copy Ingest Address"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                            <div className="text-[10px] text-[#8E78A6] flex items-center gap-1">
                              <span>Full:</span>
                              <code className="font-mono text-[10px] truncate max-w-[210px] select-all">{srtSenderUrl}</code>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(srtSenderUrl, 'Full Caller SRT URL')}
                                className="shrink-0 text-[#8E78A6] hover:text-purple-700 p-0.5"
                                title="Copy Full Parameters Address"
                              >
                                <Copy size={10} />
                              </button>
                            </div>
                          </div>
                        ) : isSrtPlayout ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-extrabold uppercase px-1 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">VLC PLAY</span>
                              <code className="font-mono text-[11px] font-bold text-amber-800 dark:text-amber-300 select-all truncate max-w-[220px]">
                                {vlcUrl}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(fullVlcUrl, 'VLC Network Stream URL')}
                                className="shrink-0 rounded p-1 text-[#8E78A6] hover:bg-amber-100 dark:hover:bg-amber-950 hover:text-amber-700 transition-colors cursor-pointer"
                                title={`Copy for VLC Player: ${fullVlcUrl}`}
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                            <div className="text-[10px] text-[#8E78A6] flex items-center gap-1">
                              <span>Server Bind:</span>
                              <code className="font-mono text-[10px] truncate max-w-[210px] select-all">{proc.url}</code>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-[11px] text-[#1B1024] dark:text-white truncate max-w-[280px] select-all">
                              {proc.url}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(proc.url, 'Target URL')}
                              className="shrink-0 text-[#8E78A6] hover:text-purple-700 p-0.5 cursor-pointer"
                              title="Copy Target URL"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] font-bold text-[#4A1B7A] dark:text-[#C4B5FD]">
                        {isSrt ? `/live/${targetStreamKey}` : `From: ${proc.streamPath}`}
                      </td>

                      <td className="px-4 py-3">
                        {hasSignal ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Transmitting Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Ready / Listening
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const cleanName = (targetStreamKey || '').replace(/^\/?(live\/)?/, '') || (isSrt ? (proc.streamName || 'srt-feed') : 'feed');
                            const matchedKey = `live/${cleanName}`;
                            const streamObj = localStreams[matchedKey] || localStreams[cleanName] || { name: cleanName, protocol: isSrt ? 'SRT' : 'RTMP' };
                            openInspector(matchedKey, streamObj);
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                          title="Watch incoming stream preview"
                        >
                          <Play size={11} /> Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => stopProcess(proc.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-1 text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          Terminate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}

      {/* SRT Ingest Server Modal */}
      <DetailDrawer
        open={srtModalOpen}
        onClose={() => setSrtModalOpen(false)}
        title="Launch SRT Ingest Server"
        subtitle="Listen on a local UDP port for incoming SRT streams with direct zero-CPU passthrough"
        width="max-w-[440px]"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSrtModalOpen(false)} className="h-8 rounded-md border px-3 text-[12px] font-semibold text-[#6F6078] hover:bg-slate-50 dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#211335]">Cancel</button>
            <button onClick={startSrtListener} className="h-8 rounded-md bg-purple-600 hover:bg-purple-700 px-4 text-[12px] font-bold text-white transition-colors">Start SRT Server</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-2.5 text-[11px] text-emerald-900 dark:text-emerald-200">
            <strong>Zero CPU Overhead:</strong> Incoming SRT stream packets are received and passed through directly without re-encoding, immediately playable via HLS, RTMP, and recording.
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">Target Live Stream Name</label>
            <input
              className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              value={srtStreamName}
              onChange={e => setSrtStreamName(e.target.value)}
              placeholder="srt-feed"
            />
            <span className="text-[10px] text-[#8E78A6] mt-0.5 block">Will be published locally as /live/{srtStreamName || 'stream'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">SRT Listener Port</label>
              <input
                type="number"
                className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                value={srtPort}
                onChange={e => setSrtPort(e.target.value)}
                placeholder="8890"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">Latency (ms)</label>
              <input
                type="number"
                className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                value={srtLatency}
                onChange={e => setSrtLatency(e.target.value)}
                placeholder="200"
              />
            </div>
          </div>

          <div className="rounded-lg bg-[#F8F7FA] dark:bg-[#120820] border border-[#E8DFF0] dark:border-[#371F59] p-2.5">
            <span className="block text-[10px] uppercase font-bold text-[#8E78A6] mb-1">Field Sender Target URL Preview</span>
            <code className="block font-mono text-[11px] text-purple-700 dark:text-purple-300 break-all select-all">
              {`srt://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${srtPort || 8890}?mode=caller&latency=${srtLatency || 200}`}
            </code>
          </div>
        </div>
      </DetailDrawer>

      {/* Push / Re-Transcoder Modal */}
      <DetailDrawer
        open={relayModalOpen}
        onClose={() => setRelayModalOpen(false)}
        title="Live Stream Egress & Re-Transcoder"
        subtitle="Push & re-encode incoming SRT or RTMP feeds to UDP Multicast, SRT Caller, RTMP, or RTSP"
        width="max-w-[480px]"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setRelayModalOpen(false)} className="h-8 rounded-md border px-3 text-[12px] font-semibold text-[#6F6078] hover:bg-slate-50 dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#211335]">Cancel</button>
            <button onClick={startEgressPush} className="h-8 rounded-md bg-purple-600 hover:bg-purple-700 px-4 text-[12px] font-bold text-white transition-colors cursor-pointer">Start Push / Transcode</button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div className="rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 p-2.5 text-[11px] text-purple-900 dark:text-purple-200">
            <strong>Universal Stream Egress:</strong> Take any incoming stream (e.g. from SRT Server or RTMP Ingest) and re-stream it to UDP Multicast (for IPTV / DVB modulators), remote SRT listeners, RTMP CDNs, or RTSP servers with optional GPU/CPU re-encoding.
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">Source Stream Path</label>
            <div className="flex gap-2">
              <input
                className="h-9 flex-1 rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                value={relayStreamPath}
                onChange={e => setRelayStreamPath(e.target.value)}
                placeholder="/live/srt-feed"
              />
              {activeStreamKeys.length > 0 && (
                <select
                  className="h-9 rounded-md border border-[#E8DFF0] px-2 text-[11px] font-semibold bg-white dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                  onChange={e => {
                    if (e.target.value) setRelayStreamPath(`/live/${e.target.value.replace(/^live\//, '')}`);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Active Streams...</option>
                  {activeStreamKeys.map(k => {
                    const clean = k.replace(/^live\//, '');
                    return <option key={k} value={clean}>{clean}</option>;
                  })}
                </select>
              )}
            </div>
            <span className="text-[10px] text-[#8E78A6] mt-0.5 block">Format: /live/&lt;stream_name&gt; (e.g. /live/srt-feed)</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-[#1B1024] dark:text-white">Destination Target URL</label>
              <span className="text-[10px] text-[#8E78A6]">Presets:</span>
            </div>

            {/* Quick URL Presets */}
            <div className="grid grid-cols-5 gap-1 mb-1.5">
              <button
                type="button"
                onClick={() => setRelayDestinationUrl('udp://239.1.1.1:5000?pkt_size=1316')}
                className="rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-1 py-1 text-[9.5px] font-bold text-center hover:bg-emerald-100"
                title="UDP Multicast for IPTV & DVB Modulators"
              >
                📡 UDP
              </button>
              <button
                type="button"
                onClick={() => setRelayDestinationUrl('srt://0.0.0.0:9998?mode=listener')}
                className="rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-1 py-1 text-[9.5px] font-bold text-center hover:bg-amber-100"
                title="SRT Egress Listener: Open srt://127.0.0.1:9998 in VLC"
              >
                🎬 SRT (VLC)
              </button>
              <button
                type="button"
                onClick={() => setRelayDestinationUrl('srt://127.0.0.1:9000?mode=caller&latency=200')}
                className="rounded border border-purple-200 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-800 text-purple-800 dark:text-purple-300 px-1 py-1 text-[9.5px] font-bold text-center hover:bg-purple-100"
                title="Push to remote SRT Receiver"
              >
                🟣 SRT Push
              </button>
              <button
                type="button"
                onClick={() => setRelayDestinationUrl('rtmp://remote-server/live/streamkey')}
                className="rounded border border-violet-200 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-800 text-violet-800 dark:text-violet-300 px-1 py-1 text-[9.5px] font-bold text-center hover:bg-violet-100"
                title="Push to RTMP Server / CDN"
              >
                ⚡ RTMP
              </button>
              <button
                type="button"
                onClick={() => setRelayDestinationUrl('rtsp://127.0.0.1:8554/live')}
                className="rounded border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-300 px-1 py-1 text-[9.5px] font-bold text-center hover:bg-slate-100"
                title="RTSP Server Output"
              >
                🌐 RTSP
              </button>
            </div>

            <input
              className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              value={relayDestinationUrl}
              onChange={e => setRelayDestinationUrl(e.target.value)}
              placeholder="udp://239.1.1.1:5000?pkt_size=1316"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">Transcoding & Processing Mode</label>
            <select
              className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 text-[12px] font-medium bg-white text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              value={relayProfile}
              onChange={e => setRelayProfile(e.target.value)}
            >
              <option value="copy">⚡ Direct Pass-Through (Zero CPU Copy / Ultra Fast)</option>
              <option value="nvenc_1080p">🟢 NVIDIA NVENC Hardware 1080p (4.5 Mbps H.264)</option>
              <option value="nvenc_720p">🔵 NVIDIA NVENC Hardware 720p (2.5 Mbps H.264)</option>
              <option value="software_1080p">🟣 Software x264 1080p High Quality (4.0 Mbps)</option>
              <option value="software_720p">🟡 Software x264 720p Stable (2.2 Mbps)</option>
              <option value="software_576p_dvb">📡 DVB / Cable CBR MPTS (2.0 Mbps + MP2 Audio)</option>
              <option value="custom">⚙️ Custom Bitrate & Resolution...</option>
            </select>
          </div>

          {relayProfile === 'custom' && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5">
              <div>
                <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] mb-1">Video Bitrate (Kbps)</label>
                <input
                  type="number"
                  className="h-8 w-full rounded border border-[#E8DFF0] px-2 font-mono text-[11px] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                  value={relayCustomBitrate}
                  onChange={e => setRelayCustomBitrate(e.target.value)}
                  placeholder="3000"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] mb-1">Resolution (W:H)</label>
                <input
                  className="h-8 w-full rounded border border-[#E8DFF0] px-2 font-mono text-[11px] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                  value={relayCustomResolution}
                  onChange={e => setRelayCustomResolution(e.target.value)}
                  placeholder="1920:1080"
                />
              </div>
            </div>
          )}
        </div>
      </DetailDrawer>

      {/* Stream Inspector Drawer */}
      {(() => {
        const liveInspected = localStreams[selectedStreamKey] || inspectedStream;
        const inspectorBitrate = Number(liveInspected?.bitrate || liveInspected?.incoming_kbps || liveInspected?.incomingBitrate || liveInspected?.publisher?.video?.bitrate || 0);
        const urls = getStreamUrls(selectedStreamKey, liveInspected);

        return (
          <DetailDrawer
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            title={`Stream Inspector — ${urls.rawName}`}
            subtitle="Real-time live video player, incoming feed telemetry, and playback URLs"
            width="max-w-[620px]"
          >
            <div className="space-y-4">
              <MediaPreview
                url={urls.openHlsUrl}
                title={urls.rawName}
                maxHeight={320}
                isRecording={Boolean(activeRecordingKeys[selectedStreamKey] || recordingStatuses[selectedStreamKey] || liveInspected?.isRecording)}
              />

              {/* Feed Telemetry Grid */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD] block">
                  📡 Incoming Stream Diagnostics
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px]">
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Resolution &amp; FPS</span>
                    <p className="font-mono font-bold text-[#1B1024] dark:text-white">
                      {liveInspected?.resolution || (liveInspected?.width && liveInspected?.height ? `${liveInspected.width}x${liveInspected.height}` : '1920x1080')} @ {liveInspected?.fps || 30}fps
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Bitrate</span>
                    <p className="font-mono font-bold text-[#7C3AED] dark:text-[#34D399]">{formatBitrate(inspectorBitrate)}</p>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Video Codec &amp; Profile</span>
                    <p className="font-mono font-bold text-[#1B1024] dark:text-white">
                      {liveInspected?.videoCodec || liveInspected?.publisher?.video?.codec || 'H.264'}
                      {(liveInspected?.videoProfile || liveInspected?.publisher?.video?.profile) && (
                        <span className="text-[10px] text-[#8E78A6] font-normal"> ({liveInspected?.videoProfile || liveInspected?.publisher?.video?.profile})</span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Audio Codec &amp; Bitrate</span>
                    <p className="font-mono font-bold text-[#1B1024] dark:text-white">
                      {liveInspected?.audioCodec || liveInspected?.publisher?.audio?.codec || 'AAC'}
                      <span className="text-[10px] text-[#8E78A6] font-normal"> ({liveInspected?.audioBitrate || liveInspected?.publisher?.audio?.bitrate || 128} kbps)</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Sampling Rate &amp; Channels</span>
                    <p className="font-mono font-bold text-[#1B1024] dark:text-white">
                      {liveInspected?.audioSamplerate || liveInspected?.sampleRate || 48000} Hz
                      <span className="text-[10px] text-[#8E78A6] font-normal"> ({liveInspected?.audioChannels || 2}ch {Number(liveInspected?.audioChannels || 2) === 1 ? 'Mono' : 'Stereo'})</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Source Protocol &amp; IP</span>
                    <p className="font-mono font-bold text-[#1B1024] dark:text-white truncate">
                      <span className="uppercase text-purple-700 dark:text-purple-300">{liveInspected?.protocol || 'RTMP'}</span> &bull; {liveInspected?.ip || '127.0.0.1'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </DetailDrawer>
        );
      })()}

      <ConfirmDialog
        open={!!deletingRec}
        title="Delete Recording File"
        message={`Are you sure you want to delete recording "${deletingRec?.file_name || deletingRec?.stream || 'archive'}"? The file will be permanently deleted.`}
        confirmLabel="Delete File"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteRecording}
        onCancel={() => setDeletingRec(null)}
      />

      {/* Live Server RTMP Ingest Security & Keys Modal */}
      <LiveServerSecurityModal
        open={securityModalOpen}
        onClose={() => {
          setSecurityModalOpen(false);
          fetchSecurityStatus();
        }}
        rtmpPort={settings.rtmpPort || 1935}
        api={apiCall}
      />
    </div>
  );
};

export default IngestServerView;
