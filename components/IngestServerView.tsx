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
  HardDrive
} from 'lucide-react';
import { AppSettings, IngestRecordingOptions, TranscodingProfile, StorageStatusResponse } from '../types';
import toast from 'react-hot-toast';
import ProfessionalRecordingControl from './ProfessionalRecordingControl';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import DetailDrawer from './ui/DetailDrawer';
import MediaPreview from './ui/MediaPreview';
import StatusBadge from './ui/StatusBadge';
import ConfirmDialog from './ui/ConfirmDialog';
import { sendRealtime, subscribeRealtime } from '../services/realtime';

const getRecordingFormat = (item: any): string => {
  if (item?.file_name && item.file_name.includes('.')) {
    const parts = item.file_name.split('.');
    const ext = parts.pop()?.toLowerCase();
    if (ext && ext !== item.file_name.toLowerCase() && ['mp4', 'mkv', 'mov', 'ts', 'flv', 'avi', 'webm'].includes(ext)) {
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
  const fmt = getRecordingFormat(item);
  if (fmt === 'mp4' || fmt === 'webm') {
    if (item.id) return `/api/ingest/recordings/${encodeURIComponent(item.id)}/file`;
    const fileName = item.file_name || item.stream;
    if (fileName) return `/api/ingest/recordings/file/${encodeURIComponent(fileName)}`;
  }
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
  encoder: 'nvidia',
  videoCodec: 'h264',
  rateControl: 'cbr',
  resolution: 'source',
  framerate: 50,
  videoBitrate: 50000,
  maxBitrate: 55000,
  preset: 'fast',
  gopSize: 60,
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
  audioBitrate: 192,
  sampleRate: 48000,
  audioChannels: 2,
  continuous: true,
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

  const [relayModalOpen, setRelayModalOpen] = useState(false);
  const [relayStreamPath, setRelayStreamPath] = useState('/live/main-feed');
  const [relayDestinationUrl, setRelayDestinationUrl] = useState('');
  const [processes, setProcesses] = useState<any[]>([]);

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
      ]);
      fetchProcesses();
    } catch (e) {
      console.error(e);
    }
  }, [fetchIngestHistory, fetchRecordings, fetchIngestStreams, fetchStorageStatus]);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/record/config', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const safeFormats = (data.formats && Array.isArray(data.formats) && data.formats.length > 0 && !(data.formats.length === 1 && data.formats[0] === 'mov'))
          ? data.formats
          : ['mp4'];
        setConfig(prev => ({ ...prev, ...data, formats: safeFormats }));
      }
    } catch {}
  }, []);

  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true);
    sendRealtime({ type: 'capture_devices_request' });
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ffmpeg/devices', {
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
    refreshDevices();
    fetchStorageStatus();

    const storageTimer = setInterval(fetchStorageStatus, 5000);

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
      clearInterval(storageTimer);
      unsubscribe();
    };
  }, [fetchData, fetchConfig, refreshDevices, fetchStorageStatus]);

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
      const current = prev.formats || ['mp4'];
      const next = current.includes(format)
        ? current.filter(f => f !== format)
        : [...current, format];
      return { ...prev, formats: next.length ? next : ['mp4'] };
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
        body: JSON.stringify({ port: Number(srtPort), streamName: srtStreamName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start SRT listener');
      toast.success(`SRT Listener active on port ${srtPort}`);
      setSrtModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startRtmpRelay = async () => {
    if (licenseStatus === 'expired') {
      return toast.error('Cannot start RTMP relay: License has expired. Please activate a valid license.');
    }
    if (licenseStatus && licenseStatus !== 'activated') {
      return toast.error('RTMP relay is disabled in Trial / Unlicensed Mode. Please activate a full license.');
    }
    if (!relayStreamPath || !relayDestinationUrl) return toast.error('Stream path and destination URL required');
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/relay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ streamPath: relayStreamPath, destinationUrl: relayDestinationUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start RTMP relay');
      toast.success('RTMP relay established');
      setRelayModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
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
      return recordings.some((r: any) => r.is_active && (
        r.app === 'device' ||
        r.source_type === 'device' ||
        (devName && (r.stream === devName || r.file_name?.includes(devName.replace(/[^a-z0-9._-]+/gi, '-'))))
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">Ingest Server & Capture</h1>
              <span className="rounded-full bg-[#F4EEFF] border border-[#D8C6E8] px-2.5 py-0.5 text-[11px] font-semibold text-[#4A1B7A] dark:bg-[#2A1744] dark:border-[#4A267A] dark:text-[#C4B5FD]">
                {videoDevices.length} Video Device{videoDevices.length !== 1 ? 's' : ''} Detected
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
              Hardware device capture, professional recording profiles, and recording archives
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshDevices}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:hover:bg-[#2D1845]"
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

        {/* Ingest Summary KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Video Devices</span>
              <p className="font-mono text-[20px] font-bold text-[#1B1024] dark:text-white">{videoDevices.length}</p>
            </div>
            <span className="text-[11px] text-[#6F6078] dark:text-[#8E78A6] mt-1 truncate">
              {videoDevices.length > 0 ? videoDevices[0] : 'No hardware device'}
            </span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Audio Devices</span>
              <p className="font-mono text-[20px] font-bold text-[#2563EB] dark:text-[#60A5FA]">{audioDevices.length}</p>
            </div>
            <span className="text-[11px] text-[#6F6078] dark:text-[#8E78A6] mt-1 truncate">
              {audioDevices.length > 0 ? audioDevices[0] : 'System audio / none'}
            </span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Total Recordings</span>
              <p className="font-mono text-[20px] font-bold text-[#E11D72] dark:text-[#F472B6]">{recordings.length}</p>
            </div>
            <span className="text-[11px] text-[#6F6078] dark:text-[#8E78A6] mt-1">
              {recordings.filter((r: any) => r.is_active).length > 0
                ? `${recordings.filter((r: any) => r.is_active).length} recording active`
                : 'All recordings idle'}
            </span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Storage Used</span>
                {storageStatus && (
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                    storageStatus.isFull
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 animate-pulse'
                      : storageStatus.isWarning
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                      : 'bg-[#F4EEFF] text-[#4A1B7A] dark:bg-[#2A1744] dark:text-[#C4B5FD]'
                  }`}>
                    {storageStatus.usePercent !== undefined ? `${storageStatus.usePercent.toFixed(1)}% Disk` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="font-mono text-[20px] font-bold text-[#4A1B7A] dark:text-[#C4B5FD]">
                  {formatBytes(totalRecordingBytes)}
                </p>
                <span className="text-[10px] font-medium text-[#6F6078] dark:text-[#B9A5CD]">
                  (Recordings)
                </span>
              </div>
            </div>

            {storageStatus ? (
              <div className="mt-2 pt-1.5 border-t border-[#E8DFF0]/70 dark:border-[#311B4E]/70 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6F6078] dark:text-[#B9A5CD]">Total Disk:</span>
                  <span className="font-mono font-semibold text-[#1B1024] dark:text-white">
                    {storageStatus.usedFmt} / {storageStatus.sizeFmt}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6F6078] dark:text-[#B9A5CD]">Remaining:</span>
                  <span className={`font-mono font-semibold ${
                    storageStatus.isFull
                      ? 'text-rose-600 dark:text-rose-400 font-bold'
                      : storageStatus.isWarning
                      ? 'text-amber-600 dark:text-amber-400 font-bold'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {storageStatus.availableFmt} Free
                  </span>
                </div>
                <div className="w-full bg-[#E8DFF0] h-1.5 rounded-full overflow-hidden dark:bg-[#311B4E]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      storageStatus.isFull
                        ? 'bg-rose-600'
                        : storageStatus.isWarning
                        ? 'bg-amber-500'
                        : 'bg-[#4A1B7A] dark:bg-[#A78BFA]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, storageStatus.usePercent || 0))}%` }}
                  />
                </div>
              </div>
            ) : (
              <span className="text-[11px] text-[#6F6078] dark:text-[#8E78A6] mt-1">
                Recordings directory storage
              </span>
            )}
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
        />

        {/* Recording Archives & Items Table */}
        <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#311B4E]">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Recording Archives ({filteredRecordings.length})</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Completed and active stream recording items</p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={recSearch}
                onChange={e => setRecSearch(e.target.value)}
                placeholder="Search recordings..."
                className="h-8 w-48 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
              />
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
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
                          REC {formatRecordingDuration(rec.duration || (rec.start_time ? (Date.now() - new Date(rec.start_time).getTime()) / 1000 : 0))}
                        </span>
                      ) : (
                        <span className="text-[#6F6078] text-[11px] dark:text-[#8E78A6]">
                          {formatRecordingDuration(rec.duration || (rec.start_time && rec.end_time ? (new Date(rec.end_time).getTime() - new Date(rec.start_time).getTime()) / 1000 : 0))}
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
                        target="_blank"
                        rel="noreferrer"
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
              <CodeField value={`/media/recordings/${recPreview.file_name}`} label="Recording Storage Path" />
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
          <button
            type="button"
            onClick={() => setSrtModalOpen(true)}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:hover:bg-[#2F1A4B]"
          >
            <Activity size={13} className="text-[#16A36A] dark:text-[#34D399]" /> Add SRT Listener
          </button>
          <button
            type="button"
            onClick={() => setRelayModalOpen(true)}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:bg-[#0F172A] dark:border-[#334155] dark:text-white dark:hover:bg-[#334155]"
          >
            <ArrowUpRight size={13} className="text-[#6D32D9] dark:text-[#A78BFA]" /> Add RTMP Relay
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

      {/* Active Ingest Streams Table */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#1E293B] dark:border-[#334155]">
        <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#334155]">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Active Ingest Streams</h2>
            <p className="text-[11px] text-[#6F6078] dark:text-[#94A3B8]">Currently publishing RTMP and SRT live streams</p>
          </div>

          <CodeField value={rtmpEndpointUrl} label="" className="max-w-xs" />
        </div>

        {activeStreamKeys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#0F172A] dark:border-[#334155] dark:text-[#94A3B8]">
                  <th className="px-4 py-3">Stream Name</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Resolution / FPS</th>
                  <th className="px-4 py-3">Bitrate</th>
                  <th className="px-4 py-3">Audio</th>
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

                  return (
                    <tr key={key} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#334155]/50">
                      <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#16A36A] animate-pulse" />
                          <span>{stream.name || key}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ProtocolBadge protocol={stream.protocol || 'RTMP'} />
                      </td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#94A3B8]">
                        {stream.resolution || '1920x1080'} @ {stream.fps || 30}fps
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-[#7C3AED] dark:text-[#34D399]">
                        {formatBitrate(bitrateKbps)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                        {stream.audioCodec || 'AAC'} ({stream.audioBitrate || 128}k)
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
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => openInspector(key, stream)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
                        >
                          <Activity size={12} /> Monitor
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleRecord(stream.app || 'live', stream.name || key)}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                            isRec
                              ? 'border border-[#FECACA] bg-[#FEF2F2] text-[#DC3545]'
                              : 'border border-[#E8DFF0] bg-white text-[#1B1024] hover:bg-[#F4EEFF]'
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

      {/* Active Processes Table */}
      {processes.length > 0 && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden">
          <div className="border-b border-[#E8DFF0] px-4 py-2.5 bg-[#F8F7FA]">
            <span className="font-display text-[13px] font-bold text-[#1B1024]">
              Active Background Ingest Processes ({processes.length})
            </span>
          </div>
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase text-[#6F6078]">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">URL / Target</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFF0]">
              {processes.map(proc => (
                <tr key={proc.id}>
                  <td className="px-4 py-2 font-mono font-bold text-[#4A1B7A]">{proc.id}</td>
                  <td className="px-4 py-2 uppercase font-semibold text-[#6F6078]">{proc.type}</td>
                  <td className="px-4 py-2 font-mono text-[#1B1024]">{proc.url || proc.streamPath}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => stopProcess(proc.id)}
                      className="rounded border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-bold text-[#DC3545]"
                    >
                      Terminate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SRT Modal */}
      <DetailDrawer
        open={srtModalOpen}
        onClose={() => setSrtModalOpen(false)}
        title="Add SRT Listener Input"
        subtitle="Listen on a local UDP port for incoming SRT streams"
        width="max-w-[420px]"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setSrtModalOpen(false)} className="h-8 rounded-md border px-3 text-[12px] font-semibold text-[#6F6078]">Cancel</button>
            <button onClick={startSrtListener} className="h-8 rounded-md bg-[#351147] px-4 text-[12px] font-semibold text-white">Start Listener</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Target Stream Name</label>
            <input className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 text-[12px]" value={srtStreamName} onChange={e => setSrtStreamName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">SRT Listener Port</label>
            <input type="number" className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 text-[12px]" value={srtPort} onChange={e => setSrtPort(e.target.value)} />
          </div>
        </div>
      </DetailDrawer>

      {/* Relay Modal */}
      <DetailDrawer
        open={relayModalOpen}
        onClose={() => setRelayModalOpen(false)}
        title="Add RTMP Relay Output"
        subtitle="Forward an active ingest stream to a remote RTMP destination"
        width="max-w-[440px]"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setRelayModalOpen(false)} className="h-8 rounded-md border px-3 text-[12px] font-semibold text-[#6F6078]">Cancel</button>
            <button onClick={startRtmpRelay} className="h-8 rounded-md bg-[#351147] px-4 text-[12px] font-semibold text-white">Start Relay</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Source Ingest Stream Path</label>
            <input className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px]" value={relayStreamPath} onChange={e => setRelayStreamPath(e.target.value)} placeholder="/live/main-feed" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Destination RTMP URL</label>
            <input className="h-9 w-full rounded-md border border-[#E8DFF0] px-3 font-mono text-[12px]" value={relayDestinationUrl} onChange={e => setRelayDestinationUrl(e.target.value)} placeholder="rtmp://remote-server/live/streamkey" />
          </div>
        </div>
      </DetailDrawer>

      {/* Stream Inspector Drawer */}
      {(() => {
        const liveInspected = localStreams[selectedStreamKey] || inspectedStream;
        const inspectorBitrate = Number(liveInspected?.bitrate || liveInspected?.incoming_kbps || liveInspected?.incomingBitrate || liveInspected?.publisher?.video?.bitrate || 0);

        return (
          <DetailDrawer
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            title={`Stream Inspector — ${selectedStreamKey}`}
            subtitle="Real-time live video player, telemetry and output parameters"
            width="max-w-[560px]"
          >
            <div className="space-y-4">
              <MediaPreview
                url={`${typeof window !== 'undefined' ? window.location.origin : ''}/live/${selectedStreamKey.split('/')[1] || selectedStreamKey}/index.m3u8`}
                title={selectedStreamKey}
                maxHeight={320}
                isRecording={Boolean(activeRecordingKeys[selectedStreamKey] || recordingStatuses[selectedStreamKey] || localStreams[selectedStreamKey]?.isRecording)}
              />

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Resolution</span>
                  <p className="font-mono font-bold text-[#1B1024] dark:text-white">{liveInspected?.resolution || '1920x1080'}</p>
                </div>
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#0F172A] dark:border-[#334155]">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#94A3B8]">Bitrate</span>
                  <p className="font-mono font-bold text-[#7C3AED] dark:text-[#34D399]">{formatBitrate(inspectorBitrate)}</p>
                </div>
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">FPS</span>
                  <p className="font-mono font-bold text-[#1B1024] dark:text-white">{liveInspected?.fps || 30}</p>
                </div>
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Audio Codec</span>
                  <p className="font-mono font-bold text-[#1B1024] dark:text-white">{liveInspected?.audioCodec || 'AAC'}</p>
                </div>
              </div>

              <CodeField
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/live/${selectedStreamKey.split('/')[1] || selectedStreamKey}/index.m3u8`}
                label="HLS Output Playback URL"
              />
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
    </div>
  );
};

export default IngestServerView;
