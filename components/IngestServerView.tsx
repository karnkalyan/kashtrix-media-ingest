import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiRefreshCw, FiVideo, FiZap, FiExternalLink, FiList, FiSearch,
  FiChevronLeft, FiChevronRight, FiDisc, FiSquare, FiDownload,
  FiActivity, FiUsers, FiCpu, FiTrash2, FiPlay, FiX, FiArchive
} from 'react-icons/fi';
import { AppSettings, IngestRecordingOptions, TranscodingProfile } from '../types';
import toast from 'react-hot-toast';
import ProfessionalRecordingControl from './ProfessionalRecordingControl';
import { sendRealtime, subscribeRealtime } from '../services/realtime';

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
  mode?: 'recording' | 'live';
}

const formatBitrate = (kbps: number) => {
  if (kbps >= 1000) return <>{(kbps / 1000).toFixed(2)}<span className="text-[9px] ml-0.5 uppercase">Mbps</span></>;
  return <>{kbps}<span className="text-[9px] ml-0.5 uppercase">Kbps</span></>;
};

const formatDataSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDuration = (startTime: string, endTime?: string, currentTime = Date.now()) => {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : currentTime;
  const diff = Math.floor((end - start) / 1000);

  // Handle invalid durations (negative or zero)
if (diff <= 0) {
    return endTime ? '0s' : 'Interrupted';
  }

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatPlaybackTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return 'LIVE';
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const StatBadge: React.FC<{ label: string; value: React.ReactNode; sub?: string; color: string }> = ({ label, value, sub, color }) => (
  <div className="text-center">
    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mb-1">{label}</p>
    <p className={`metric-value text-[13px] font-bold ${color} leading-none`}>{value}</p>
    {sub && <p className="text-[9px] text-slate-400 mt-0.5 font-medium">{sub}</p>}
  </div>
);

const PaginationControls: React.FC<{ page: number; totalPages: number; onPageChange: (page: number) => void }> = ({ page, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white/50 px-4 py-3">
      <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
        <FiChevronLeft size={15} />
      </button>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Page {page} of {totalPages}</span>
      <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
        <FiChevronRight size={15} />
      </button>
    </div>
  );
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
  mode = 'recording'
}) => {
  const [recordingStatuses, setRecordingStatuses] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [recordingsPage, setRecordingsPage] = useState(1);
  const [selectedStreamKey, setSelectedStreamKey] = useState('');
  const [sourceType, setSourceType] = useState<'ingest' | 'device'>('device');
  const [videoDevices, setVideoDevices] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [videoDevice, setVideoDevice] = useState('');
  const [audioDevice, setAudioDevice] = useState('');
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [previewRecording, setPreviewRecording] = useState<any | null>(null);
  const [previewPosition, setPreviewPosition] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewOffsetInput, setPreviewOffsetInput] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [savingConfig, setSavingConfig] = useState(false);
  const [durationClock, setDurationClock] = useState(Date.now());
  const [recordingConfig, setRecordingConfig] = useState<IngestRecordingOptions>({
    fileName: '{channel}_{date}_{time}', formats: ['mp4'], encoder: 'copy', videoBitrate: 12000, audioBitrate: 192,
    resolution: '1920x1080', framerate: 30, preset: 'fast', continuous: true, autoRecord: false,
    sourceType: 'device', videoCodec: 'h264', rateControl: 'cbr', maxBitrate: 18000,
    crf: 20, gopSize: 60, pixelFormat: 'yuv420p', audioCodec: 'aac', sampleRate: 48000, audioChannels: 2,
  });
  const itemsPerPage = 10;

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        fetchIngestHistory(),
        fetchRecordings(),
        fetchIngestStreams()
      ]);
    } catch (e) {
      console.error(e);
    }
  }, [fetchIngestHistory, fetchRecordings, fetchIngestStreams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (mode !== 'recording' || !recordings.some((recording: any) => recording?.is_active)) return;
    setDurationClock(Date.now());
    const timer = window.setInterval(() => setDurationClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mode, recordings]);

  const localStreams = ingestStreams || {};
  const history = ingestHistory || [];
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

  useEffect(() => {
    const keys = Object.keys(localStreams);
    if (!selectedStreamKey || !localStreams[selectedStreamKey]) setSelectedStreamKey(keys[0] || '');
  }, [localStreams, selectedStreamKey]);

  useEffect(() => {
    const token = localStorage.getItem('kte-auth-token');
    fetch('/api/ingest/record/config', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Unable to load recording settings')))
      .then(config => setRecordingConfig(previous => ({ ...previous, ...config, encoder: config.encoder === 'copy' ? 'cpu' : (config.encoder || previous.encoder), sourceType: 'device' })))
      .catch(error => console.error(error));
  }, []);

  const fetchCaptureDevices = useCallback(() => {
    setDevicesLoading(true);
    sendRealtime({ type: 'capture_devices_request' });
  }, []);

  useEffect(() => subscribeRealtime(message => {
    if (message.type === 'capture_devices') {
      const body = message.payload || {};
      setVideoDevices(body.video || []);
      setAudioDevices(body.audio || []);
      setVideoDevice(current => current || body.video?.[0] || '');
      setAudioDevice(current => current || body.audio?.[0] || '');
      setDevicesLoading(false);
    } else if (message.type === 'capture_devices_error') {
      setDevicesLoading(false);
      toast.error(message.payload?.error || 'Unable to detect capture devices');
    }
  }), []);

  useEffect(() => { fetchCaptureDevices(); }, [fetchCaptureDevices]);

  const saveRecordingConfig = async () => {
    setSavingConfig(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const response = await fetch('/api/ingest/record/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(recordingConfig),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save recording settings');
      setRecordingConfig(previous => ({ ...previous, ...body.config }));
      toast.success('Recording defaults saved');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleFormat = (format: IngestRecordingOptions['formats'][number]) => {
    setRecordingConfig(previous => {
      const exists = previous.formats.includes(format);
      if (exists && previous.formats.length === 1) return previous;
      return { ...previous, formats: exists ? previous.formats.filter(item => item !== format) : [...previous.formats, format] };
    });
  };

const handleToggleRecord = async (app: string, stream: string) => {
  const key = `${app}/${stream}`;
  const isRecording = !!(recordingStatuses[key] || activeRecordingKeys[key]);
  try {
    if (isRecording) {
      await stopRecording(app, stream);
      setRecordingStatuses(prev => ({ ...prev, [key]: false }));
      toast.success(`Stopped recording ${stream}`);
    } else {
      await startRecording(app, stream, {
        ...recordingConfig,
        sourceType: 'ingest',
        videoDevice: '',
        audioDevice: '',
      });
      setRecordingStatuses(prev => ({ ...prev, [key]: true }));
      toast.success(`Started recording ${stream}`);
    }
    // ✅ Trigger a fresh fetch so the recordings table updates immediately
    fetchRecordings();
  } catch (e: any) {
    toast.error(e.message);
  }
};

  const handleStartSelected = async () => {
    try {
      if (sourceType === 'device') {
        if (!videoDevice && !audioDevice) return toast.error('Select a video or audio capture device');
        const label = (videoDevice || audioDevice).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'capture-device';
        await startRecording('device', label, { ...recordingConfig, sourceType, videoDevice, audioDevice, encoder: recordingConfig.encoder === 'copy' ? 'cpu' : recordingConfig.encoder });
        toast.success(`Device recording started: ${videoDevice || audioDevice}`);
      } else {
        const data: any = localStreams[selectedStreamKey];
        if (!data) return toast.error('Select an active ingest stream');
        await startRecording(data.app || 'live', data.name || selectedStreamKey.split('/').pop() || 'stream', { ...recordingConfig, sourceType: 'ingest' });
        toast.success(`Ingest recording started: ${data.name || selectedStreamKey}`);
      }
      await Promise.all([fetchRecordings(), fetchIngestStreams()]);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteRecording = async (id: number | string) => {
    try {
      if (String(previewRecording?.id) === String(id)) setPreviewRecording(null);
      await deleteRecording(id);
      toast.success('Recording deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (!previewRecording) return;
    setPreviewPosition(0);
    setPreviewDuration(0);
    setPreviewOffset(0);
    setPreviewOffsetInput(0);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewRecording(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewRecording]);

  useEffect(() => {
    if (ingestStreams) {
      const newStatuses: Record<string, boolean> = {};
      Object.entries(ingestStreams).forEach(([key, data]: [string, any]) => {
        newStatuses[key] = !!data.isRecording;
      });
      setRecordingStatuses(prev => ({ ...prev, ...newStatuses }));
    }
  }, [ingestStreams]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase();
    return history.filter((h: any) =>
      (h.stream || '').toLowerCase().includes(q) ||
      (h.app || '').toLowerCase().includes(q) ||
      (h.video_info && h.video_info.toLowerCase().includes(q))
    );
  }, [history, searchQuery]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * itemsPerPage;
    return filteredHistory.slice(start, start + itemsPerPage);
  }, [filteredHistory, historyPage]);

  const totalRecordingPages = Math.ceil(recordings.length / itemsPerPage);
  const paginatedRecordings = useMemo(() => {
    const start = (recordingsPage - 1) * itemsPerPage;
    return recordings.slice(start, start + itemsPerPage);
  }, [recordings, recordingsPage]);

  useEffect(() => { setHistoryPage(1); }, [searchQuery]);
  useEffect(() => {
    setHistoryPage(page => Math.min(page, Math.max(1, totalPages || 1)));
  }, [totalPages]);
  useEffect(() => {
    setRecordingsPage(page => Math.min(page, Math.max(1, totalRecordingPages || 1)));
  }, [totalRecordingPages]);

  const activeRecording = recordings.find((recording: any) => recording?.is_active);
  const selectedIngest: any = selectedStreamKey ? localStreams[selectedStreamKey] : null;
  const sourceLabel = sourceType === 'device'
    ? (videoDevice || audioDevice || 'No capture device selected')
    : (selectedIngest?.name || selectedStreamKey || 'No live ingest selected');

  return (
    <div className={`ingest-workspace page-stack pb-8 ${mode === 'live' ? 'live-server-workspace' : ''}`}>
      {mode === 'recording' && <section className="recording-console space-y-4">
        <div className="app-panel grid min-w-0 divide-y divide-slate-100 overflow-hidden lg:grid-cols-[1fr_1.35fr_1fr_1.35fr] lg:divide-x lg:divide-y-0">
          <div className="flex min-w-0 items-center gap-3 p-4">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${activeRecording ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}><FiActivity /></span>
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Ingest status</p><p className={`mt-1 text-sm font-semibold ${activeRecording ? 'text-emerald-600' : 'text-slate-700'}`}>{activeRecording ? 'Recording live' : 'Ready'}</p>{activeRecording && <p className="mt-0.5 text-[10px] text-slate-500">{formatDuration(activeRecording.start_time, undefined, durationClock)}</p>}</div>
          </div>
          <div className="flex min-w-0 items-center gap-3 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><FiVideo /></span>
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Source device</p><p className="mt-1 truncate text-xs font-semibold text-slate-800" title={sourceLabel}>{sourceLabel}</p><p className="mt-0.5 text-[10px] text-slate-500">{sourceType === 'device' ? (audioDevice || 'Video capture') : 'Live network ingest'}</p></div>
          </div>
          <div className="flex min-w-0 items-center gap-3 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fuchsia-50 text-fuchsia-600"><FiCpu /></span>
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Encoding profile</p><p className="mt-1 truncate text-xs font-semibold text-slate-800">Custom recording · {recordingConfig.encoder.toUpperCase()}</p><p className="mt-0.5 text-[10px] text-slate-500">{recordingConfig.videoCodec?.toUpperCase()} / {recordingConfig.resolution} / {recordingConfig.framerate || 'source'} fps</p></div>
          </div>
          <div className="flex flex-col justify-center gap-3 p-4">
            <label className="flex items-center justify-between gap-3 text-[10px] font-medium text-slate-600"><span>Automatically record incoming streams</span><input type="checkbox" checked={!!recordingConfig.autoRecord} onChange={event => setRecordingConfig(previous => ({ ...previous, autoRecord: event.target.checked }))} className="h-4 w-4 accent-fuchsia-600" /></label>
            <div className="flex gap-2"><button type="button" onClick={saveRecordingConfig} disabled={savingConfig} className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{savingConfig ? 'Saving...' : 'Save defaults'}</button>{activeRecording && <button type="button" onClick={() => handleToggleRecord(activeRecording.app, activeRecording.stream)} className="flex-1 rounded-md bg-red-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-red-700"><FiSquare className="mr-1 inline" />Stop recording</button>}</div>
          </div>
        </div>

        <ProfessionalRecordingControl
          config={recordingConfig} setConfig={setRecordingConfig}
          sourceType={sourceType} setSourceType={setSourceType}
          streams={localStreams} selectedStreamKey={selectedStreamKey} setSelectedStreamKey={setSelectedStreamKey}
          videoDevices={videoDevices} audioDevices={audioDevices} videoDevice={videoDevice} audioDevice={audioDevice}
          setVideoDevice={setVideoDevice} setAudioDevice={setAudioDevice}
          refreshDevices={fetchCaptureDevices} devicesLoading={devicesLoading}
          toggleFormat={toggleFormat} save={saveRecordingConfig} saving={savingConfig} start={handleStartSelected}
          profiles={profiles} mediaPort={settings.mediaPort}
        />
      </section>}
      {mode === 'live' && <section className="space-y-4">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <span className="text-violet-600"><FiZap size={19} /></span> Incoming live streams
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Real-time monitoring - {Object.keys(localStreams).length} active stream{Object.keys(localStreams).length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <FiRefreshCw size={15} />
          </button>
        </div>

        {Object.keys(localStreams).length === 0 ? (
          <div className="app-panel border-dashed p-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
              <span className="text-slate-300"><FiVideo size={19} /></span>
            </div>
            <h3 className="text-sm font-semibold text-slate-500">No active RTMP streams found</h3>
            <p className="mx-auto mt-1 max-w-sm text-[11px] text-slate-400">
              Push your content to the server to see them listed here.
            </p>
            <div className="mt-4 inline-block max-w-full break-all rounded-md bg-slate-800 px-4 py-2 font-mono text-[10px] text-slate-300">
              rtmp://{window.location.hostname}:{settings.rtmpPort}/live/stream_name
            </div>
          </div>
        ) : (
          <div className="data-panel data-table-wrap">
            <table className="data-table min-w-[980px]">
              <thead><tr><th>Stream</th><th>Protocols</th><th>Video / Audio</th><th>Ingress</th><th>Egress</th><th>Viewers</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
            {Object.entries(localStreams).map(([key, data]: [string, any]) => {
              const app = data.app || 'live';
              const stream = data.name || key;
              const rtmpUrl = `rtmp://${window.location.hostname}:${settings.rtmpPort}/${app}/${stream}`;
              const hlsUrl = `${window.location.origin}/${app}/${stream}/index.m3u8`;
              const isRecording = !!(data.isRecording || recordingStatuses[`${app}/${stream}`] || activeRecordingKeys[`${app}/${stream}`]);
              const video = data.publisher?.video;
              const audio = data.publisher?.audio;
              const resolutionText = video?.width && video?.height ? `${video.width}x${video.height}` : 'N/A';
              const inBytes = data.total_in_bytes || data.publisher?.bytes || 0;
              const outBytes = data.total_out_bytes || 0;

              return (
                <tr key={key}>
                  <td><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><div className="min-w-0"><p className="max-w-[180px] truncate font-semibold">{stream}</p><p className="text-[9px] text-slate-400">{app}</p></div></div></td>
                  <td><div className="flex items-center gap-2"><span className="rounded bg-[var(--primary-subtle)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--operational-purple)]">RTMP</span><a href={hlsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--primary)]">HLS <FiExternalLink size={10} /></a></div><p className="mt-1 max-w-[180px] truncate font-mono text-[9px] text-slate-400" title={rtmpUrl}>{rtmpUrl}</p></td>
                  <td><p className="font-mono font-semibold">{resolutionText}</p><p className="text-[9px] text-slate-400">{video?.codec || 'H264'} / {audio?.codec || 'AAC'}</p></td>
                  <td><p className="font-mono">{formatBitrate(data.incoming_kbps || 0)}</p><p className="text-[9px] text-slate-400">{formatDataSize(inBytes)}</p></td>
                  <td><p className="font-mono">{formatBitrate(data.outgoing_kbps || 0)}</p><p className="text-[9px] text-slate-400">{formatDataSize(outBytes)}</p></td>
                  <td className="font-mono">{data.viewers || 0}</td>
                  <td>{isRecording ? <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent)]"><FiDisc /> Recording</span> : <span className="text-slate-400">Live</span>}</td>
                  <td><div className="flex justify-end gap-2"><a href={hlsUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-600"><FiPlay /> Monitor</a><button onClick={() => handleToggleRecord(app, stream)} className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold text-white ${isRecording ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]'}`}>{isRecording ? <><FiSquare /> Stop</> : <><FiDisc /> Record</>}</button></div></td>
                </tr>
              );
            })}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {mode === 'recording' && <section className="app-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h2 className="panel-kicker">
              <FiArchive size={14} /> Recording archives
            </h2>
            <p className="mt-1 text-[11px] font-medium text-slate-500">Access and management · {recordings.length} recordings</p>
          </div>
        </div>

        {recordings.length === 0 ? (
          <div className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-400"><FiArchive size={24} /></span>
            <h3 className="mt-3 text-sm font-semibold text-slate-700">No recordings yet</h3>
            <p className="mt-1 text-[11px] text-slate-400">Your recorded television files will appear here.</p>
          </div>
        ) : (
          <div className="overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Recording</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Started</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Duration</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Size</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecordings.map((rec) => {
                    const isActive = !!rec.is_active;
                    return (
                    <tr key={rec.id} className="hover:bg-white/60 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700 block truncate max-w-[200px]">{rec.file_name}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{rec.app}/{rec.stream}</span>
                        <span className="mt-1 block text-[9px] font-bold uppercase text-indigo-500">{rec.format || rec.file_name?.split('.').pop()} · {rec.encoder || 'copy'}{rec.resolution ? ` · ${rec.resolution}` : ''}{rec.video_bitrate ? ` · ${rec.video_bitrate} Kbps` : ''}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-600 block">{new Date(rec.start_time).toLocaleDateString()}</span>
                        <span className="text-[10px] text-slate-400">{new Date(rec.start_time).toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4"><span className="text-xs font-bold text-slate-600">{isActive ? <span className="inline-flex items-center gap-1.5 text-rose-600"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />LIVE {'\u00b7'} {formatDuration(rec.start_time, undefined, durationClock)}</span> : rec.end_time ? formatDuration(rec.start_time, rec.end_time) : <span className="text-amber-500">Interrupted</span>}</span></td>
                      <td className="px-6 py-4"><span className="text-xs font-black text-slate-700">{formatDataSize(rec.size)}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <button onClick={() => handleToggleRecord(rec.app, rec.stream)} className="p-2 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-all shadow-sm flex items-center justify-center w-10" title="Stop recording">
                              <FiSquare size={15} />
                            </button>
                          )}
                          <button onClick={() => setPreviewRecording(rec)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center w-10" title="Preview recording">
                            <FiPlay size={15} />
                          </button>
                          <a href={`/recordings/${rec.app}/${rec.stream}/${rec.file_name}`} target="_blank" rel="noreferrer" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center w-10" title="Download">
                            <FiDownload size={15} />
                          </a>
                          <button onClick={() => handleDeleteRecording(rec.id)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-rose-600 transition-all shadow-sm flex items-center justify-center w-10" title="Delete recording">
                            <FiTrash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <PaginationControls page={recordingsPage} totalPages={totalRecordingPages} onPageChange={setRecordingsPage} />
          </div>
        )}
      </section>}

      {mode === 'live' && <section>
        <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="text-indigo-500"><FiList size={16} /></span> Stream history
            </h2>
          </div>
          <div className="relative max-w-sm w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><FiSearch size={16} /></span>
            <input type="text" placeholder="Search history..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-[11px] outline-none focus:border-[var(--primary)]" />
          </div>
        </div>

        <div className="data-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Stream</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Time</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedHistory.map((session) => (
                  <tr key={session.id} className="hover:bg-white/60">
                    <td className="px-6 py-4"><span className="text-sm font-bold text-slate-700 block">{session.stream}</span><span className="text-[10px] text-slate-400">{session.app}</span></td>
                    <td className="px-6 py-4"><span className="text-[11px] font-bold text-slate-600 block">{new Date(session.start_time).toLocaleString()}</span></td>
                    <td className="px-6 py-4">
                      {session.end_time ? (
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase text-slate-400">Finished</span>
                          <span className="text-xs font-bold text-slate-600">{formatDuration(session.start_time, session.end_time)}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black uppercase text-emerald-500 animate-pulse">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls page={historyPage} totalPages={totalPages} onPageChange={setHistoryPage} />
        </div>
      </section>}

      {previewRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Recording preview" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewRecording(null); }}>
          <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white">{previewRecording.file_name}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">{previewRecording.app}/{previewRecording.stream} · FFmpeg compatibility preview</p>
              </div>
              <button onClick={() => setPreviewRecording(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Close preview"><FiX size={18} /></button>
            </div>
            <div className="aspect-video w-full bg-black">
              <video key={`${previewRecording.id}-${previewVersion}`} controls autoPlay playsInline className="h-full w-full object-contain" src={`/recording-preview/${previewRecording.id}?start=${previewOffset}`} onTimeUpdate={event => setPreviewPosition(event.currentTarget.currentTime)} onLoadedMetadata={event => setPreviewDuration(event.currentTarget.duration)} onDurationChange={event => setPreviewDuration(event.currentTarget.duration)}>
                Your browser does not support video playback.
              </video>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3 text-[11px] text-slate-400 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="preview-offset" className="text-slate-300">Jump to second</label>
                <input id="preview-offset" type="number" min="0" step="1" value={previewOffsetInput} onChange={event => setPreviewOffsetInput(Math.max(0, Number(event.target.value) || 0))} className="w-24 rounded-md border border-white/15 bg-white/10 px-2 py-1.5 font-mono text-white outline-none focus:border-indigo-400" />
                <button type="button" onClick={() => { setPreviewOffset(previewOffsetInput); setPreviewPosition(0); setPreviewVersion(version => version + 1); }} className="rounded-md bg-indigo-500 px-3 py-1.5 font-semibold text-white hover:bg-indigo-400">Show this point</button>
                <span>Use the player timeline for fine seeking.</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{formatDataSize(previewRecording.size)} · {(previewRecording.format || previewRecording.file_name?.split('.').pop() || 'file').toUpperCase()}</span>
              <span className="font-mono text-slate-200">Position {formatPlaybackTime(previewOffset + previewPosition)} / {previewRecording.is_active ? 'LIVE' : formatPlaybackTime(previewOffset + previewDuration)}</span>
              {previewRecording.is_active && <span className="text-amber-300">This file is still recording; seek range grows as recording continues.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
