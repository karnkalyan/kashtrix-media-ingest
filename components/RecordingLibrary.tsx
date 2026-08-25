import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Archive,
  Calendar,
  Download,
  Film,
  Filter,
  Grid,
  List,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
  Radio,
  Clock,
  HardDrive,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Sliders,
  Cpu,
  StopCircle,
  FileVideo,
  ExternalLink,
  Sparkles,
  Layers,
  Activity
} from 'lucide-react';
import { AppSettings, ConversionJob, TranscodeJobOptions } from '../types';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import ConfirmDialog from './ui/ConfirmDialog';
import KashtrixMediaPlayer from './ui/KashtrixMediaPlayer';
import { subscribeRealtime } from '../services/realtime';

interface Props {
  realtimeRecordings: any[];
  settings: AppSettings;
  deleteRecording: (id: number | string) => Promise<any>;
  onOpenTranscodeStudio?: (file: { id?: string | number; name: string; path?: string; type: 'recording' }) => void;
}

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const durationSeconds = (recording: any) => {
  if (typeof recording?.duration === 'number' && Number.isFinite(recording.duration)) {
    return Math.max(0, recording.duration);
  }
  const start = new Date(recording?.start_time).getTime();
  if (isNaN(start)) return 0;

  if (recording?.is_active) {
    return Math.max(0, Math.floor((Date.now() - start) / 1000));
  }

  const end = recording?.end_time ? new Date(recording.end_time).getTime() : start;
  if (isNaN(end) || end < start) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
};

const formatDuration = (seconds: number) => {
  seconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':');
};

const formatSecondsToTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  }
  return `${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
};

const getRecordingFormat = (recording: any): string => {
  if (recording?.file_name && recording.file_name.includes('.')) {
    const parts = recording.file_name.split('.');
    const ext = parts.pop()?.toLowerCase();
    if (ext && ext !== recording.file_name.toLowerCase() && ['mp4', 'mkv', 'mov', 'mxf', 'ts', 'flv', 'avi', 'webm'].includes(ext)) {
      return ext;
    }
  }
  if (recording?.format && String(recording.format).toLowerCase() !== 'file') {
    return String(recording.format).toLowerCase();
  }
  return 'mp4';
};

const isUncompressedMaster = (recording: any): boolean => {
  const enc = String(recording?.encoder || '').toLowerCase();
  let configuredCodec = '';
  try {
    const settings = typeof recording?.settings_json === 'string'
      ? JSON.parse(recording.settings_json)
      : recording?.settings_json;
    configuredCodec = String(settings?.videoCodec || '').toLowerCase();
  } catch (_) {}
  return enc.includes('rawvideo') || enc.includes('uncompressed') || configuredCodec === 'rawvideo' || configuredCodec === 'uncompressed';
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
  if (fileName) return `/api/ingest/recordings/file/${encodeURIComponent(fileName)}/download?download=1`;
  return `/recordings/${encodeURIComponent(fileName || '')}?download=1`;
};

const TRANSCODE_PRESETS: { id: string; label: string; description: string; options: TranscodeJobOptions }[] = [
  {
    id: 'broadcast-1080p50',
    label: 'Broadcast Master 1080p50 (15 Mbps NVENC)',
    description: 'High-bitrate pristine 50fps broadcast standard with hardware NVENC acceleration and deinterlacing',
    options: {
      format: 'mp4',
      videoCodec: 'h264',
      encoder: 'nvidia',
      resolution: '1920x1080',
      framerate: 50,
      rateControl: 'cbr',
      videoBitrate: 15000,
      maxBitrate: 18000,
      preset: 'fast',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 256,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: true,
    }
  },
  {
    id: 'web-1080p',
    label: 'Web Standard 1080p (6 Mbps H.264)',
    description: 'Optimized for high compatibility across web browsers, OTT players, and mobile devices',
    options: {
      format: 'mp4',
      videoCodec: 'h264',
      encoder: 'nvidia',
      resolution: '1920x1080',
      framerate: 'source',
      rateControl: 'cbr',
      videoBitrate: 6000,
      maxBitrate: 7500,
      preset: 'fast',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: true,
    }
  },
  {
    id: 'uhd-4k',
    label: '4K UHD Archive (25 Mbps HEVC/H.265)',
    description: 'Ultra high definition master archive with high compression efficiency using HEVC NVENC',
    options: {
      format: 'mp4',
      videoCodec: 'hevc',
      encoder: 'nvidia',
      resolution: '3840x2160',
      framerate: 50,
      rateControl: 'cbr',
      videoBitrate: 25000,
      maxBitrate: 30000,
      preset: 'medium',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 320,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: false,
    }
  },
  {
    id: 'compact-720p',
    label: 'Compact 720p (2.5 Mbps)',
    description: 'Space-saving compressed version for rapid download and archival storage',
    options: {
      format: 'mp4',
      videoCodec: 'h264',
      encoder: 'nvidia',
      resolution: '1280x720',
      framerate: 25,
      rateControl: 'cbr',
      videoBitrate: 2500,
      maxBitrate: 3000,
      preset: 'fast',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 128,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: true,
    }
  },
  {
    id: 'copy-remux',
    label: 'Fast Stream Copy (No Re-encoding)',
    description: 'Instant MP4 container repackaging without altering video or audio streams',
    options: {
      format: 'mp4',
      videoCodec: 'copy',
      encoder: 'copy',
      resolution: 'source',
      framerate: 'source',
      rateControl: 'cbr',
      videoBitrate: 50000,
      maxBitrate: 55000,
      preset: 'fast',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: false,
    }
  },
  {
    id: 'custom',
    label: 'Custom Transcode Configuration',
    description: 'Manually specify custom encoder, bitrate, resolution, and audio parameters',
    options: {
      format: 'mp4',
      videoCodec: 'h264',
      encoder: 'nvidia',
      resolution: 'source',
      framerate: 'source',
      rateControl: 'cbr',
      videoBitrate: 12000,
      maxBitrate: 15000,
      crf: 20,
      preset: 'fast',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: true,
    }
  }
];

export const RecordingLibrary: React.FC<Props> = ({ realtimeRecordings, settings, deleteRecording, onOpenTranscodeStudio }) => {
  const [recordings, setRecordings] = useState<any[]>(realtimeRecordings);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('table');
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<any | null>(null);
  const [deletingRec, setDeletingRec] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const pageSize = 20;

  // --- Transcoding & Conversion Engine State ---
  const [conversions, setConversions] = useState<ConversionJob[]>([]);
  const [transcodeModalRecording, setTranscodeModalRecording] = useState<any | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('broadcast-1080p50');
  const [transcodeOptions, setTranscodeOptions] = useState<TranscodeJobOptions>(TRANSCODE_PRESETS[0].options);
  const [isStartingTranscode, setIsStartingTranscode] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const response = await fetch('/api/ingest/recordings?limit=5000', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load recording library');
      setRecordings(body.recordings || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadConversions = async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/recordings/conversions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data?.conversions) {
        setConversions(data.conversions);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadAll();
    loadConversions();
  }, []);

  useEffect(() => {
    if (!realtimeRecordings.length) return;
    setRecordings(current => {
      const updates = new Map(realtimeRecordings.map(item => [String(item.id), item]));
      const merged = current.map(item => (updates.has(String(item.id)) ? updates.get(String(item.id)) : item));
      realtimeRecordings.forEach(item => {
        if (!current.some(existing => String(existing.id) === String(item.id))) merged.push(item);
      });
      return merged;
    });
  }, [realtimeRecordings]);

  // Realtime WebSocket subscription for conversion progress and completion
  useEffect(() => {
    const unsubscribe = subscribeRealtime((msg) => {
      if (msg.type === 'conversion_progress' && msg.payload) {
        const job = msg.payload as ConversionJob;
        setConversions(prev => {
          const idx = prev.findIndex(c => c.id === job.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = job;
            return next;
          }
          return [job, ...prev];
        });
      } else if (msg.type === 'conversion_completed' && msg.payload) {
        const job = msg.payload as ConversionJob;
        setConversions(prev => {
          const idx = prev.findIndex(c => c.id === job.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = job;
            return next;
          }
          return [job, ...prev];
        });
        toast.success(`Transcoding completed: ${job.targetFileName}`, { icon: '🎬' });
        loadAll();
      } else if (msg.type === 'recordings_list' && Array.isArray(msg.payload)) {
        setRecordings(msg.payload);
      }
    });

    return () => unsubscribe();
  }, []);

  const openTranscodeModal = (rec: any) => {
    if (onOpenTranscodeStudio) {
      onOpenTranscodeStudio({ id: rec.id, name: rec.file_name, path: rec.file_path, type: 'recording' });
      return;
    }
    setTranscodeModalRecording(rec);
    setSelectedPreset('broadcast-1080p50');
    setTranscodeOptions({ ...TRANSCODE_PRESETS[0].options });
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const found = TRANSCODE_PRESETS.find(p => p.id === presetId);
    if (found) {
      setTranscodeOptions({ ...found.options });
    }
  };

  const startTranscodeJob = async () => {
    if (!transcodeModalRecording?.id) return;
    setIsStartingTranscode(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ingest/recordings/${transcodeModalRecording.id}/transcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(transcodeOptions),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start transcoding');
      toast.success(`Transcoding job started for ${transcodeModalRecording.file_name}`);
      if (data.job) {
        setConversions(prev => [data.job, ...prev.filter(c => c.id !== data.job.id)]);
      }
      setTranscodeModalRecording(null);
    } catch (err: any) {
      toast.error(err.message || 'Transcoding error');
    } finally {
      setIsStartingTranscode(false);
    }
  };

  const cancelConversion = async (jobId: string) => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      await fetch(`/api/ingest/recordings/conversions/${jobId}/cancel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast('Transcoding cancelled', { icon: '🛑' });
      loadConversions();
    } catch (_) {}
  };

  const dismissConversion = async (jobId: string) => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      await fetch(`/api/ingest/recordings/conversions/${jobId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setConversions(prev => prev.filter(c => c.id !== jobId));
    } catch (_) {}
  };

  const remove = (recording: any) => {
    setDeletingRec(recording);
  };

  const confirmDeleteRecording = async () => {
    if (!deletingRec) return;
    setDeleteLoading(true);
    try {
      await deleteRecording(deletingRec.id);
      setRecordings(current => current.filter(item => item.id !== deletingRec.id));
      toast.success('Recording deleted permanently');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleteLoading(false);
      setDeletingRec(null);
    }
  };

  const formats = useMemo(() => {
    const list = new Set<string>();
    recordings.forEach(item => {
      const fmt = getRecordingFormat(item);
      if (fmt) list.add(fmt);
    });
    return Array.from(list);
  }, [recordings]);

  const filtered = useMemo(() => {
    let result = [...recordings];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(item =>
        String(item.file_name || '').toLowerCase().includes(q) ||
        String(item.stream || '').toLowerCase().includes(q) ||
        String(item.app || '').toLowerCase().includes(q) ||
        String(item.encoder || '').toLowerCase().includes(q)
      );
    }
    if (format !== 'all') {
      result = result.filter(item => getRecordingFormat(item) === format);
    }

    result.sort((a, b) => {
      if (sort === 'newest') return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
      if (sort === 'oldest') return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      if (sort === 'size-desc') return Number(b.size || 0) - Number(a.size || 0);
      if (sort === 'duration-desc') return durationSeconds(b) - durationSeconds(a);
      return 0;
    });

    return result;
  }, [recordings, search, format, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const totalStorage = useMemo(() => {
    return recordings.reduce((acc, curr) => acc + Number(curr.size || 0), 0);
  }, [recordings]);

  const activeConversions = conversions.filter(c => c.status === 'converting' || c.status === 'queued');

  return (
    <div className="recording-library page-stack space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white flex items-center gap-2">
            <Archive size={20} className="text-[#7C3AED]" />
            Recording Library & Transcode Engine
          </h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Uncompressed master archival, real-time MP4 transcoding, high-speed conversion, and direct download
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenTranscodeStudio && (
            <button
              type="button"
              onClick={() => onOpenTranscodeStudio({ name: '', type: 'recording' })}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-3 text-[12px] font-bold text-white hover:bg-[#2B0D3A] shadow-xs dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
            >
              <Zap size={14} /> Open Transcode Studio
            </button>
          )}

          <button
            type="button"
            onClick={() => { loadAll(); loadConversions(); }}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2F1A4B]"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>

          <div className="flex h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 dark:bg-[#211335] dark:border-[#371F59]">
            <button
              onClick={() => setView('table')}
              className={`rounded p-1 text-[12px] ${view === 'table' ? 'bg-white text-[#351147] font-semibold shadow-xs dark:bg-[#371F59] dark:text-white' : 'text-[#6F6078] dark:text-[#8E78A6]'}`}
              title="Table View"
            >
              <List size={15} />
            </button>
            <button
              onClick={() => setView('cards')}
              className={`rounded p-1 text-[12px] ${view === 'cards' ? 'bg-white text-[#351147] font-semibold shadow-xs dark:bg-[#371F59] dark:text-white' : 'text-[#6F6078] dark:text-[#8E78A6]'}`}
              title="Grid View"
            >
              <Grid size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Master Recordings</span>
          <p className="font-mono text-[22px] font-bold text-[#1B1024] dark:text-white mt-1">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Archived Storage</span>
          <p className="font-mono text-[22px] font-bold text-[#7C3AED] dark:text-[#A78BFA] mt-1">{formatBytes(totalStorage)}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Active Transcodes</span>
          <p className="font-mono text-[22px] font-bold text-[#059669] dark:text-[#34D399] mt-1 flex items-center gap-1.5">
            {activeConversions.length}
            {activeConversions.length > 0 && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />}
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Uncompressed Masters</span>
          <p className="font-mono text-[22px] font-bold text-[#D97706] dark:text-[#FBBF24] mt-1">
            {recordings.filter(isUncompressedMaster).length}
          </p>
        </div>
      </div>

      {/* Real-time Live Transcoding HUD Card */}
      {conversions.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50/50 via-white to-purple-50/20 shadow-sm dark:bg-[#190E28] dark:border-[#3B1E63] overflow-hidden">
          <div className="flex items-center justify-between border-b border-purple-100 bg-purple-100/40 px-4 py-2.5 dark:bg-[#25123D] dark:border-[#3B1E63]">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[#7C3AED]" />
              <h3 className="text-[13px] font-bold text-[#1B1024] dark:text-white">Real-Time Transcoding Engine</h3>
              <span className="rounded-full bg-purple-200/70 px-2 py-0.5 text-[10px] font-mono font-bold text-[#5B21B6] dark:bg-purple-900/60 dark:text-purple-300">
                {activeConversions.length > 0 ? `${activeConversions.length} Active Jobs` : 'Queue Idle'}
              </span>
            </div>
            <button
              onClick={loadConversions}
              className="text-[11px] text-[#7C3AED] hover:underline font-semibold flex items-center gap-1"
            >
              <RefreshCw size={11} /> Refresh Jobs
            </button>
          </div>

          <div className="divide-y divide-purple-100 dark:divide-[#311B4E]">
            {conversions.slice(0, 5).map(job => (
              <div key={job.id} className="p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13px] text-[#1B1024] dark:text-white truncate" title={job.targetFileName}>
                        {job.targetFileName}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        job.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : job.status === 'converting'
                          ? 'bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800 animate-pulse'
                          : job.status === 'failed'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {job.status === 'converting' ? `Transcoding (${job.options?.encoder?.toUpperCase() || 'GPU'})` : job.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD] mt-0.5 truncate">
                      Source: {job.originalFileName} • {job.options?.resolution || '1080p'} • {job.options?.videoBitrate || 12000}k {job.options?.rateControl?.toUpperCase()} • {job.options?.videoCodec?.toUpperCase()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.status === 'converting' && (
                      <button
                        type="button"
                        onClick={() => cancelConversion(job.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300"
                        title="Cancel active transcode"
                      >
                        <StopCircle size={12} /> Cancel
                      </button>
                    )}
                    {job.status === 'completed' && (
                      <a
                        href={`/api/ingest/recordings/file/${encodeURIComponent(job.targetFileName)}/download?download=1`}
                        download={job.targetFileName}
                        className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-300"
                        title="Download transcoded MP4"
                      >
                        <Download size={12} /> Download MP4
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => dismissConversion(job.id)}
                      className="p-1 text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Telemetry */}
                {job.status === 'converting' && (
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-purple-100 dark:bg-[#311B4E] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-300"
                        style={{ width: `${Math.max(1, job.progress || 0)}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#7C3AED] dark:text-[#A78BFA] text-[11px]">{job.progress || 0}%</span>
                        <span>Speed: <strong className="text-[#1B1024] dark:text-white">{job.speed || '1.0x'}</strong></span>
                        <span>FPS: <strong className="text-[#1B1024] dark:text-white">{job.fps || 0}</strong></span>
                        <span>Time: {formatSecondsToTime(job.currentTime || 0)} / {formatSecondsToTime(job.duration || 0)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.etaSeconds && job.etaSeconds > 0 ? <span>ETA: <strong className="text-purple-700 dark:text-purple-300">{formatDuration(job.etaSeconds)}</strong></span> : null}
                        <span>Size: {job.outputSizeFmt || '0 B'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {job.status === 'failed' && (
                  <p className="text-[11px] font-mono text-rose-600 bg-rose-50 p-2 rounded border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
                    Error: {job.error || 'Conversion failed'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search filename, channel, uncompressed master..."
              className="h-8 w-full rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
            />
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
          </div>

          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-medium text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
          >
            <option value="all">All Formats</option>
            {formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>

          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-medium text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="size-desc">Largest First</option>
            <option value="duration-desc">Longest First</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
        {visible.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center p-8 text-center">
            <div>
              <Archive size={32} className="mx-auto text-[#6F6078] opacity-50" />
              <h3 className="mt-2 font-display text-[14px] font-bold text-[#1B1024] dark:text-white">No recordings found</h3>
              <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">No archived recordings matched the search criteria.</p>
            </div>
          </div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Channel / Source</th>
                  <th className="px-4 py-3">Recorded Date</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Format / Codec</th>
                  <th className="px-4 py-3">File Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {visible.map(recording => {
                  const uncompressed = isUncompressedMaster(recording);
                  return (
                    <tr key={recording.id} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#2F1A4B]/40">
                      <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white max-w-[260px] truncate" title={recording.file_name}>
                        <div className="flex items-center gap-1.5">
                          <FileVideo size={14} className={uncompressed ? 'text-purple-600' : 'text-slate-500'} />
                          <span className="truncate">{recording.file_name}</span>
                        </div>
                        {recording.capture_status === 'incomplete' && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <AlertCircle size={10} /> Incomplete capture
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#6F6078] dark:text-[#B9A5CD]">
                        <span className="font-semibold text-[#1B1024] dark:text-white">{recording.app}/{recording.stream}</span>
                        <span className="block text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                          {uncompressed ? (
                            <span className="font-semibold text-purple-600 dark:text-purple-400">Uncompressed Master (Raw)</span>
                          ) : (
                            `${recording.encoder || 'copy'} • ${recording.resolution || 'source'}`
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                        {new Date(recording.start_time).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                        {recording.is_active ? (
                          <span className="text-[#E11D72] font-semibold animate-pulse">LIVE • {formatDuration(durationSeconds(recording))}</span>
                        ) : (
                          formatDuration(durationSeconds(recording))
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <ProtocolBadge protocol={getRecordingFormat(recording).toUpperCase()} />
                          {uncompressed && (
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-800 border border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800">
                              Master Raw
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-[#1B1024] dark:text-white">
                        {formatBytes(Number(recording.size || 0))}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                        {/* Preview Button */}
                        <button
                          type="button"
                          onClick={() => setPreview(recording)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA] dark:hover:bg-[#2D1A45]"
                        >
                          <Play size={11} /> Preview
                        </button>

                        {/* Direct Download Button */}
                        <a
                          href={getRecordingDownloadUrl(recording)}
                          download={recording.file_name || 'recording.mp4'}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6F6078] hover:bg-[#F8F7FA] hover:text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#2D1A45] dark:hover:text-white"
                          title={`Download ${recording.file_name}`}
                        >
                          <Download size={11} /> Download
                        </a>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => remove(recording)}
                          className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#450A0A] dark:hover:text-[#FCA5A5]"
                          title="Delete Recording"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(recording => {
              const uncompressed = isUncompressedMaster(recording);
              return (
                <div key={recording.id} className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
                  <div>
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-950 mb-2.5">
                      <img
                        src={`/recording-thumbnail/${recording.id}.jpg`}
                        alt={recording.file_name}
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div className="absolute bottom-2 right-2 rounded-md bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-xs">
                        {formatDuration(durationSeconds(recording))}
                      </div>
                      {uncompressed && (
                        <div className="absolute top-2 left-2 rounded bg-purple-600/90 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow">
                          Master Raw
                        </div>
                      )}
                      {recording.capture_status === 'incomplete' && (
                        <div className="absolute top-2 right-2 rounded bg-amber-500/95 text-slate-950 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow">
                          Incomplete
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-[#1B1024] truncate text-[13px] dark:text-white" title={recording.file_name}>
                        {recording.file_name}
                      </h3>
                      <ProtocolBadge protocol={getRecordingFormat(recording).toUpperCase()} size="sm" />
                    </div>
                    <p className="mt-1 text-[11px] text-[#6F6078] truncate dark:text-[#B9A5CD]">
                      {recording.app}/{recording.stream} • {uncompressed ? 'Uncompressed Master' : (recording.encoder || 'copy')}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                      <span className="font-mono">{formatDuration(durationSeconds(recording))}</span>
                      <span className="font-mono font-semibold text-[#1B1024] dark:text-white">{formatBytes(Number(recording.size || 0))}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreview(recording)}
                        className="flex-1 flex items-center justify-center gap-1 rounded-md bg-[#F4EEFF] py-1 text-[11px] font-semibold text-[#4A1B7A] hover:bg-[#E8DFF0] dark:bg-[#311754] dark:text-white"
                      >
                        <Play size={11} /> Preview
                      </button>
                      <a
                        href={getRecordingDownloadUrl(recording)}
                        download={recording.file_name || 'recording.mp4'}
                        className="flex items-center justify-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2 py-1 text-[11px] font-semibold text-[#6D32D9] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#A78BFA]"
                        title={`Download ${recording.file_name}`}
                      >
                        <Download size={11} /> Download
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(recording)}
                        className="rounded-md border border-[#E8DFF0] p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:border-[#371F59] dark:text-[#B9A5CD]"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-[#E8DFF0] bg-[#F8F7FA] px-4 py-2.5 text-[11px] dark:bg-[#211335] dark:border-[#311B4E]">
            <span className="text-[#6F6078] dark:text-[#B9A5CD]">Page {page} of {pageCount} • {filtered.length} items</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded border border-[#E8DFF0] bg-white px-2.5 py-1 font-semibold text-[#6F6078] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                className="rounded border border-[#E8DFF0] bg-white px-2.5 py-1 font-semibold text-[#6F6078] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transcoding & Conversion Modal */}
      {transcodeModalRecording && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setTranscodeModalRecording(null); }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-2xl dark:bg-[#190E28] dark:border-[#3B1E63]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 px-5 py-4 dark:from-[#25123D] dark:to-[#190E28] dark:border-[#3B1E63]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-600 text-white shadow-sm">
                  <Zap size={18} />
                </div>
                <div>
                  <h3 className="font-display text-[16px] font-bold text-[#1B1024] dark:text-white">
                    Transcode Uncompressed Master to MP4
                  </h3>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                    High performance GPU accelerated broadcast transcoding engine
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTranscodeModalRecording(null)}
                className="rounded-lg p-1.5 text-[#6F6078] hover:bg-purple-100 dark:text-[#B9A5CD] dark:hover:bg-[#311B4E]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Source Info Card */}
              <div className="rounded-xl border border-purple-100 bg-[#F8F7FA] p-3.5 dark:bg-[#211335] dark:border-[#371F59]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Source Master</span>
                  <ProtocolBadge protocol={getRecordingFormat(transcodeModalRecording).toUpperCase()} size="sm" />
                </div>
                <p className="font-semibold text-[13px] text-[#1B1024] dark:text-white mt-1 truncate" title={transcodeModalRecording.file_name}>
                  {transcodeModalRecording.file_name}
                </p>
                <div className="flex items-center gap-4 mt-2 text-[11px] font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                  <span>Duration: <strong>{formatDuration(durationSeconds(transcodeModalRecording))}</strong></span>
                  <span>Size: <strong>{formatBytes(Number(transcodeModalRecording.size || 0))}</strong></span>
                  <span>Source: <strong>{transcodeModalRecording.app}/{transcodeModalRecording.stream}</strong></span>
                </div>
              </div>

              {/* Presets Grid */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#4A1B7A] dark:text-[#C4B5FD] mb-2 flex items-center gap-1.5">
                  <Layers size={13} /> Select Transcoding Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TRANSCODE_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        selectedPreset === preset.id
                          ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-500/20 dark:bg-purple-950/40 dark:border-purple-500'
                          : 'border-[#E8DFF0] bg-white hover:bg-slate-50 dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#2B1745]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[12px] text-[#1B1024] dark:text-white">{preset.label}</span>
                        {selectedPreset === preset.id && <CheckCircle2 size={14} className="text-purple-600 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] mt-1 leading-snug">{preset.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Configuration Section */}
              <div className="border-t border-[#E8DFF0] pt-4 dark:border-[#311B4E] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#4A1B7A] dark:text-[#C4B5FD] flex items-center gap-1.5">
                    <Sliders size={13} /> Encoding Parameters
                  </label>
                  <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">Fine-tune transcode settings</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Format */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Target Format</label>
                    <select
                      value={transcodeOptions.format}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, format: e.target.value as any }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value="mp4">MP4 (Default Web Standard)</option>
                      <option value="mkv">MKV (Matroska Container)</option>
                      <option value="mov">MOV (QuickTime Movie)</option>
                      <option value="ts">TS (MPEG-TS Stream)</option>
                    </select>
                  </div>

                  {/* Video Codec */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Video Codec</label>
                    <select
                      value={transcodeOptions.videoCodec}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, videoCodec: e.target.value as any }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value="h264">H.264 / AVC</option>
                      <option value="hevc">HEVC / H.265 (High Efficiency)</option>
                      <option value="copy">Stream Copy (Remux Only)</option>
                    </select>
                  </div>

                  {/* Hardware Encoder */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Acceleration</label>
                    <select
                      value={transcodeOptions.encoder}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, encoder: e.target.value as any }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value="nvidia">NVIDIA NVENC (GPU)</option>
                      <option value="amd">AMD AMF (GPU)</option>
                      <option value="intel">Intel QSV (GPU)</option>
                      <option value="cpu">CPU (Software x264/x265)</option>
                      <option value="copy">Direct Copy</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Resolution */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Resolution</label>
                    <select
                      value={transcodeOptions.resolution}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, resolution: e.target.value }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value="source">Source (Keep Original)</option>
                      <option value="3840x2160">3840x2160 (4K UHD)</option>
                      <option value="1920x1080">1920x1080 (1080p FHD)</option>
                      <option value="1280x720">1280x720 (720p HD)</option>
                      <option value="854x480">854x480 (480p SD)</option>
                    </select>
                  </div>

                  {/* Framerate */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Framerate</label>
                    <select
                      value={String(transcodeOptions.framerate)}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, framerate: e.target.value === 'source' ? 'source' : Number(e.target.value) }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value="source">Source (Keep Original)</option>
                      <option value="60">60 FPS (Smooth)</option>
                      <option value="50">50 FPS (Broadcast PAL)</option>
                      <option value="30">30 FPS (Standard NTSC)</option>
                      <option value="25">25 FPS (Broadcast)</option>
                      <option value="24">24 FPS (Cinema)</option>
                    </select>
                  </div>

                  {/* Video Bitrate */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Video Bitrate (Kbps)</label>
                    <input
                      type="number"
                      value={transcodeOptions.videoBitrate}
                      onChange={e => {
                        const vb = Number(e.target.value) || 6000;
                        setTranscodeOptions(prev => ({ ...prev, videoBitrate: vb, maxBitrate: Math.round(vb * 1.2) }));
                      }}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-mono font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                      step={500}
                      min={500}
                      max={100000}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Audio Codec */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Audio Codec</label>
                    <select
                      value={transcodeOptions.audioCodec}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, audioCodec: e.target.value as any }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value="aac">AAC (Broadcast standard)</option>
                      <option value="mp3">MP3</option>
                      <option value="opus">Opus</option>
                      <option value="copy">Audio Stream Copy</option>
                    </select>
                  </div>

                  {/* Audio Bitrate */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase mb-1">Audio Bitrate</label>
                    <select
                      value={transcodeOptions.audioBitrate}
                      onChange={e => setTranscodeOptions(prev => ({ ...prev, audioBitrate: Number(e.target.value) }))}
                      className="w-full h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[12px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    >
                      <option value={320}>320 kbps (High Fidelity)</option>
                      <option value={256}>256 kbps (Broadcast)</option>
                      <option value={192}>192 kbps (Standard)</option>
                      <option value={128}>128 kbps (Compact)</option>
                    </select>
                  </div>

                  {/* Deinterlacer */}
                  <div className="flex items-center h-full pt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-[12px] font-semibold text-[#1B1024] dark:text-white">
                      <input
                        type="checkbox"
                        checked={transcodeOptions.deinterlace !== false}
                        onChange={e => setTranscodeOptions(prev => ({ ...prev, deinterlace: e.target.checked }))}
                        className="rounded border-[#E8DFF0] text-purple-600 focus:ring-purple-500 h-4 w-4"
                      />
                      <span>Enable Yadif Deinterlacing</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-purple-100 bg-[#F8F7FA] px-5 py-3.5 dark:bg-[#211335] dark:border-[#3B1E63]">
              <button
                type="button"
                onClick={() => setTranscodeModalRecording(null)}
                className="rounded-lg border border-[#E8DFF0] bg-white px-4 py-2 text-[12px] font-semibold text-[#6F6078] hover:bg-slate-50 dark:bg-[#190E28] dark:border-[#371F59] dark:text-[#B9A5CD]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isStartingTranscode}
                onClick={startTranscodeJob}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-[13px] font-bold text-white shadow hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
              >
                {isStartingTranscode ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Start Real-time Transcode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null); }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-2xl dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-3 dark:border-[#311B4E]">
              <div className="min-w-0">
                <h3 className="truncate font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">
                  {preview.file_name || preview.stream}
                </h3>
                <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {preview.app || 'device'}/{preview.stream || preview.file_name} • {new Date(preview.start_time).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getRecordingDownloadUrl(preview)}
                  download={preview.file_name || 'recording.mp4'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F4EEFF] px-3 py-1.5 text-[12px] font-semibold text-[#4A1B7A] hover:bg-[#E8DFF0] dark:bg-[#311754] dark:border-[#4A1B7A] dark:text-[#A78BFA]"
                  title="Download video file"
                >
                  <Download size={14} /> Download File
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg p-1.5 text-[#6F6078] hover:bg-[#F8F7FA] dark:text-[#B9A5CD] dark:hover:bg-[#211335]"
                  title="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {preview.capture_status === 'incomplete' && (
              <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>
                  This capture is incomplete. The file contains {formatDuration(durationSeconds(preview))} of playable media from a {formatDuration(Number(preview.elapsed_duration || 0))} recording session; preview and download can only include media actually written to disk.
                </span>
              </div>
            )}

            <div className="aspect-video bg-black">
              <KashtrixMediaPlayer
                src={getRecordingUrl(preview)}
                title={preview.file_name || preview.stream}
                isLive={false}
                isRecording={Boolean(preview.is_active)}
                autoPlay={true}
                showAudioMeter={true}
                resolution={preview.resolution || undefined}
                framerate={preview.framerate ? `${preview.framerate} fps` : undefined}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingRec}
        title="Delete Recording File"
        message={`Are you sure you want to permanently delete recording "${deletingRec?.file_name || 'archive'}"? This cannot be undone.`}
        confirmLabel="Delete File"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteRecording}
        onCancel={() => setDeletingRec(null)}
      />
    </div>
  );
};

export default RecordingLibrary;
