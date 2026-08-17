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
import { AppSettings, IngestRecordingOptions, TranscodingProfile } from '../types';
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
  const app = item.app || 'device';
  const stream = item.stream || 'stream';
  const fileName = item.file_name || item.stream;
  if (app && stream && fileName) {
    return `/recordings/${encodeURIComponent(app)}/${encodeURIComponent(stream)}/${encodeURIComponent(fileName)}`;
  }
  return `/recordings/${encodeURIComponent(fileName || '')}`;
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
  encoder: 'copy',
  videoBitrate: 12000,
  audioBitrate: 192,
  resolution: 'source',
  framerate: 0,
  preset: 'fast',
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

  // Recording Library Preview & Filter state
  const [recSearch, setRecSearch] = useState('');
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

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        fetchIngestHistory(),
        fetchRecordings(),
        fetchIngestStreams(),
      ]);
      fetchProcesses();
    } catch (e) {
      console.error(e);
    }
  }, [fetchIngestHistory, fetchRecordings, fetchIngestStreams]);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/record/config', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, ...data }));
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

    const unsubscribe = subscribeRealtime(
      msg => {
        if ((msg.type === 'capture_devices' || msg.type === 'capture_devices_response') && msg.payload) {
          const v = msg.payload.video || [];
          const a = msg.payload.audio || [];
          setVideoDevices(prev => Array.from(new Set([...prev, ...v])));
          setAudioDevices(prev => Array.from(new Set([...prev, ...a])));
          setDevicesLoading(false);
        }
      },
      isConnected => {
        if (isConnected) {
          sendRealtime({ type: 'capture_devices_request' });
          refreshDevices();
        }
      }
    );

    return () => unsubscribe();
  }, [fetchData, fetchConfig, refreshDevices]);

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
      const devName = videoDevice || audioDevice || 'device';
      return recordings.some((r: any) => r.is_active && (r.app === 'device' || r.stream === devName));
    }
    return !!activeRecordingKeys[selectedStreamKey] || recordings.some((r: any) => r.is_active && `${r.app}/${r.stream}` === selectedStreamKey);
  }, [sourceType, videoDevice, audioDevice, selectedStreamKey, activeRecordingKeys, recordings]);

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[18px] font-bold text-[#1B1024]">Ingest Server & Capture</h1>
              <span className="rounded-full bg-[#F4EEFF] border border-[#D8C6E8] px-2.5 py-0.5 text-[11px] font-semibold text-[#4A1B7A]">
                {videoDevices.length} Video Device{videoDevices.length !== 1 ? 's' : ''} Detected
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-[#6F6078]">
              Hardware device capture, professional recording profiles, and recording archives
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshDevices}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
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
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Video Devices</span>
            <p className="font-mono text-[20px] font-bold text-[#1B1024]">{videoDevices.length}</p>
          </div>
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Audio Devices</span>
            <p className="font-mono text-[20px] font-bold text-[#2563EB]">{audioDevices.length}</p>
          </div>
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Total Recordings</span>
            <p className="font-mono text-[20px] font-bold text-[#E11D72]">{recordings.length}</p>
          </div>
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Storage Used</span>
            <p className="font-mono text-[20px] font-bold text-[#4A1B7A]">{formatBytes(totalRecordingBytes)}</p>
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
        <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[#1B1024]">Recording Archives ({filteredRecordings.length})</h2>
              <p className="text-[11px] text-[#6F6078]">Completed and active stream recording items</p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={recSearch}
                onChange={e => setRecSearch(e.target.value)}
                placeholder="Search recordings..."
                className="h-8 w-48 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
              />
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Encoder</th>
                  <th className="px-4 py-3">Resolution</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0]">
                {filteredRecordings.map((rec: any) => (
                  <tr key={rec.id} className="transition-colors hover:bg-[#F4EEFF]/50">
                    <td className="px-4 py-3 font-semibold text-[#1B1024]">
                      <div className="flex items-center gap-2">
                        <Film size={14} className="text-[#6D32D9]" />
                        <span>{rec.file_name || rec.stream || `recording_${rec.id}`}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ProtocolBadge protocol={getRecordingFormat(rec).toUpperCase()} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078] uppercase">
                      {rec.encoder || 'CPU'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078]">
                      {rec.resolution || '1920x1080'}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#1B1024]">
                      {formatBytes(rec.size || 0)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setRecPreview(rec)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
                      >
                        <Play size={12} /> Preview
                      </button>

                      <a
                        href={getRecordingUrl(rec)}
                        download={rec.file_name || 'recording.mp4'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6D32D9] hover:bg-[#F4EEFF]"
                        title="Download recording file to computer"
                      >
                        <Download size={12} /> Download
                      </a>

                      {!!rec.is_active && (
                        <button
                          type="button"
                          onClick={() => handleToggleRecord(rec.app || 'live', rec.stream || rec.file_name)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-semibold text-[#DC3545] hover:bg-[#FEE2E2]"
                          title="Stop active recording"
                        >
                          <Square size={12} className="fill-[#DC3545]" /> Stop Recording
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeletingRec(rec)}
                        className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#451220] dark:hover:text-[#F87171]"
                        title="Delete recording archive"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredRecordings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#6F6078]">
                      No recording archives found. Start a recording above to capture live feeds or device inputs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
              />

              {!!recPreview.is_active && (
                <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#DC3545] animate-pulse" />
                    <span className="text-[12px] font-bold text-[#DC3545]">Active Recording Session</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await stopRecording(recPreview.app || 'live', recPreview.stream || recPreview.file_name);
                      toast.success('Recording stopped');
                      setRecPreview(null);
                      fetchData();
                    }}
                    className="flex items-center gap-1 rounded-md bg-[#DC3545] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#B91C1C]"
                  >
                    <Square size={12} className="fill-white" /> Stop Recording Now
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078]">File Size</span>
                  <p className="font-mono font-bold text-[#1B1024]">{formatBytes(recPreview.size || 0)}</p>
                </div>
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
                  <span className="text-[10px] font-semibold uppercase text-[#6F6078]">Format</span>
                  <p className="font-mono font-bold text-[#2563EB]">{getRecordingFormat(recPreview).toUpperCase()}</p>
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
