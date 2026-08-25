import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FastForward,
  FileVideo,
  Film,
  Filter,
  Grid,
  HardDrive,
  Layers,
  List,
  Loader2,
  Play,
  PlayCircle,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  StopCircle,
  Trash2,
  Upload,
  Video,
  X,
  Zap
} from 'lucide-react';
import { AppSettings, ConversionJob, TranscodeJobOptions, TranscodingProfile } from '../types';
import DetailDrawer from './ui/DetailDrawer';
import ConfirmDialog from './ui/ConfirmDialog';
import { KashtrixMediaPlayer } from './ui/KashtrixMediaPlayer';
import { subscribeRealtime } from '../services/realtime';

export const TRANSCODE_STUDIO_PRESETS: {
  id: string;
  label: string;
  badge: string;
  description: string;
  options: TranscodeJobOptions;
}[] = [
  {
    id: 'broadcast-1080p50',
    label: 'Broadcast Master 1080p50',
    badge: '15 Mbps NVENC',
    description: 'Pristine 50fps broadcast standard with hardware NVENC acceleration and deinterlacing',
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
    label: 'Web Standard 1080p',
    badge: '6 Mbps H.264',
    description: 'Optimized for high compatibility across web browsers, OTT players, and mobile streaming',
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
    label: '4K UHD Master Archive',
    badge: '25 Mbps HEVC',
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
    label: 'Compact 720p HD',
    badge: '2.5 Mbps H.264',
    description: 'Space-saving compressed version for rapid download, distribution, and archival storage',
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
    label: 'Fast Container Remux',
    badge: 'Stream Passthrough',
    description: 'Instant MP4 container repackaging without re-encoding audio or video streams',
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
      audioCodec: 'copy',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      deinterlace: false,
    }
  },
  {
    id: 'custom',
    label: 'Custom Encoding Settings',
    badge: 'Manual Control',
    description: 'Fine-tune encoder, resolution, bitrate, GOP, CRF, and audio channels manually',
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

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const formatSeconds = (seconds: number) => {
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

interface TranscodeStudioProps {
  userRole?: string;
  profiles?: TranscodingProfile[];
  preSelectedFile?: { id?: string | number; name: string; path?: string; type: 'recording' | 'vod' } | null;
  onClearPreSelected?: () => void;
  onNavigateToRecordings?: () => void;
  onNavigateToVod?: () => void;
}

export const TranscodeStudio: React.FC<TranscodeStudioProps> = ({
  userRole,
  profiles = [],
  preSelectedFile,
  onClearPreSelected,
  onNavigateToRecordings,
  onNavigateToVod,
}) => {
  const [conversions, setConversions] = useState<ConversionJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'queued' | 'converting' | 'completed' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Job Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceType, setSourceType] = useState<'recording' | 'vod'>('recording');
  const [recordingsList, setRecordingsList] = useState<any[]>([]);
  const [vodList, setVodList] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');

  const [selectedSource, setSelectedSource] = useState<{
    id?: string | number;
    fileName: string;
    filePath?: string;
    duration?: number;
    size?: number;
    format?: string;
    sourceType: 'recording' | 'vod';
  } | null>(null);

  const [selectedPresetId, setSelectedPresetId] = useState<string>('broadcast-1080p50');
  const [transcodeOptions, setTranscodeOptions] = useState<TranscodeJobOptions>(TRANSCODE_STUDIO_PRESETS[0].options);
  const [targetFileName, setTargetFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Preview & Delete State
  const [previewMedia, setPreviewMedia] = useState<{ url: string; title: string } | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  // Load Active Conversion Jobs
  const fetchConversions = async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/recordings/conversions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.conversions)) {
        setConversions(data.conversions);
      }
    } catch (e) {}
  };

  // Load Source Candidates
  const fetchSources = async () => {
    setLoadingSources(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [recRes, vodRes] = await Promise.all([
        fetch('/api/ingest/recordings?limit=200', { headers }).then(r => r.json()).catch(() => ({ recordings: [] })),
        fetch('/api/vod/list', { headers }).then(r => r.json()).catch(() => ([])),
      ]);

      if (Array.isArray(recRes.recordings)) {
        setRecordingsList(recRes.recordings);
      }
      if (Array.isArray(vodRes)) {
        setVodList(vodRes);
      }
    } catch (e) {
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    fetchConversions();
    const interval = setInterval(fetchConversions, 2500);
    return () => clearInterval(interval);
  }, []);

  // Handle Real-time WebSocket Updates
  useEffect(() => {
    const unsub = subscribeRealtime((event: any) => {
      if (event.type === 'conversion_progress' || event.type === 'conversion_completed' || event.type === 'conversion_started') {
        const payload = event.payload;
        if (!payload || !payload.id) return;
        setConversions(prev => {
          const idx = prev.findIndex(j => j.id === payload.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...payload };
            return next;
          }
          return [payload, ...prev];
        });
      }
    });
    return () => unsub();
  }, []);

  // Pre-select file if opened from other views
  useEffect(() => {
    if (preSelectedFile) {
      setSelectedSource({
        id: preSelectedFile.id,
        fileName: preSelectedFile.name,
        filePath: preSelectedFile.path,
        sourceType: preSelectedFile.type,
      });
      setSourceType(preSelectedFile.type);
      const cleanName = preSelectedFile.name.replace(/\.[^/.]+$/, '');
      setTargetFileName(`${cleanName}_transcoded.mp4`);
      setDrawerOpen(true);
      if (onClearPreSelected) onClearPreSelected();
    }
  }, [preSelectedFile]);

  const openNewJobDrawer = () => {
    fetchSources();
    if (!selectedSource) {
      setSelectedPresetId('broadcast-1080p50');
      setTranscodeOptions(TRANSCODE_STUDIO_PRESETS[0].options);
      setTargetFileName('');
    }
    setDrawerOpen(true);
  };

  const handleSelectSource = (item: any, type: 'recording' | 'vod') => {
    if (type === 'recording') {
      setSelectedSource({
        id: item.id,
        fileName: item.file_name || `Recording #${item.id}`,
        filePath: item.file_path,
        duration: item.duration,
        size: item.size,
        format: item.format,
        sourceType: 'recording',
      });
      const clean = (item.file_name || `recording_${item.id}`).replace(/\.[^/.]+$/, '');
      setTargetFileName(`${clean}_transcoded.${transcodeOptions.format || 'mp4'}`);
    } else {
      setSelectedSource({
        id: item.name,
        fileName: item.originalName || item.name,
        filePath: `media/vod/${item.name}`,
        size: item.size,
        format: 'vod',
        sourceType: 'vod',
      });
      const clean = (item.originalName || item.name).replace(/\.[^/.]+$/, '');
      setTargetFileName(`${clean}_transcoded.${transcodeOptions.format || 'mp4'}`);
    }
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = TRANSCODE_STUDIO_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setTranscodeOptions(preset.options);
      if (selectedSource && targetFileName) {
        const clean = targetFileName.replace(/\.[^/.]+$/, '');
        setTargetFileName(`${clean}.${preset.options.format || 'mp4'}`);
      }
    }
  };

  const submitTranscodeJob = async (startImmediately: boolean) => {
    if (!selectedSource) return toast.error('Please select a source video file to transcode');
    const finalTargetName = targetFileName.trim() || `${selectedSource.fileName.replace(/\.[^/.]+$/, '')}_transcoded.${transcodeOptions.format || 'mp4'}`;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const body = {
        recordingId: selectedSource.sourceType === 'recording' ? selectedSource.id : undefined,
        filePath: selectedSource.filePath,
        fileName: selectedSource.fileName,
        vodFileName: selectedSource.sourceType === 'vod' ? selectedSource.id : undefined,
        targetFileName: finalTargetName,
        startImmediately,
        ...transcodeOptions,
      };

      const res = await fetch('/api/ingest/recordings/convert', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to queue transcode job');

      toast.success(startImmediately ? 'Transcoding started!' : 'Job added to transcode queue');
      setDrawerOpen(false);
      fetchConversions();
    } catch (e: any) {
      toast.error(e.message || 'Failed to process transcode job');
    } finally {
      setSubmitting(false);
    }
  };

  const startJob = async (jobId: string) => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ingest/recordings/conversions/${jobId}/start`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to start job');
      toast.success('Transcoding started');
      fetchConversions();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ingest/recordings/conversions/${jobId}/cancel`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to cancel job');
      toast.success('Job cancelled');
      fetchConversions();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ingest/recordings/conversions/${jobId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to remove job');
      toast.success('Job removed from queue');
      setConversions(prev => prev.filter(j => j.id !== jobId));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeletingJobId(null);
    }
  };

  const startAllQueued = async () => {
    const queued = conversions.filter(j => j.status === 'queued');
    if (queued.length === 0) return toast('No queued jobs waiting to start');
    for (const j of queued) {
      await startJob(j.id);
    }
    toast.success(`Started ${queued.length} queued job(s)`);
  };

  const clearCompleted = () => {
    const finished = conversions.filter(j => j.status === 'completed' || j.status === 'cancelled' || j.status === 'failed');
    finished.forEach(j => deleteJob(j.id));
    toast.success('Cleared finished jobs');
  };

  // Filtered Jobs
  const filteredJobs = useMemo(() => {
    return conversions.filter(job => {
      if (activeTab === 'queued' && job.status !== 'queued') return false;
      if (activeTab === 'converting' && job.status !== 'converting') return false;
      if (activeTab === 'completed' && job.status !== 'completed') return false;
      if (activeTab === 'failed' && job.status !== 'failed' && job.status !== 'cancelled') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = job.originalFileName?.toLowerCase().includes(q) || job.targetFileName?.toLowerCase().includes(q) || job.id.toLowerCase().includes(q);
        if (!matchName) return false;
      }
      return true;
    });
  }, [conversions, activeTab, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const queued = conversions.filter(j => j.status === 'queued').length;
    const converting = conversions.filter(j => j.status === 'converting').length;
    const completed = conversions.filter(j => j.status === 'completed').length;
    const failed = conversions.filter(j => j.status === 'failed' || j.status === 'cancelled').length;
    return { queued, converting, completed, failed, total: conversions.length };
  }, [conversions]);

  return (
    <div className="transcode-studio page-stack space-y-4">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F4EEFF] text-[#7C3AED] dark:bg-[#311754] dark:text-[#A78BFA]">
              <Zap size={14} />
            </span>
            <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">
              Transcode Studio & Queue
            </h1>
          </div>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Select recordings or VOD files, configure encoding profiles, manage queue priorities and launch GPU hardware conversions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {metrics.queued > 0 && (
            <button
              type="button"
              onClick={startAllQueued}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <Play size={13} className="fill-current" /> Start All Queued ({metrics.queued})
            </button>
          )}

          <button
            type="button"
            onClick={fetchConversions}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2F1A4B]"
          >
            <RefreshCw size={13} /> Refresh
          </button>

          <button
            type="button"
            onClick={openNewJobDrawer}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-3.5 text-[12px] font-bold text-white hover:bg-[#2B0D3A] shadow-xs dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
          >
            <Plus size={15} /> Create Transcode Job
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-[#7C3AED] dark:bg-purple-950/50 dark:text-[#C4B5FD]">
            <FastForward size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Active Converting</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">{metrics.converting}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Queued In Batch</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">{metrics.queued}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[#16A36A] dark:bg-emerald-950/50 dark:text-[#34D399]">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Completed Jobs</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">{metrics.completed}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F8F7FA] text-[#6F6078] dark:bg-[#211335] dark:text-[#B9A5CD]">
            <Layers size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Total Processed</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">{metrics.total}</div>
          </div>
        </div>
      </div>

      {/* Main Jobs Section */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
        {/* Filter Bar & Tabs */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] p-3 dark:border-[#311B4E]">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
            {(['all', 'converting', 'queued', 'completed', 'failed'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-[#351147] text-white dark:bg-[#6D32D9]'
                    : 'text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#351147] dark:text-[#B9A5CD] dark:hover:bg-[#2F1A4B] dark:hover:text-white'
                }`}
              >
                {tab === 'all' ? 'All Jobs' : tab === 'converting' ? 'In Progress' : tab}
                {tab === 'queued' && metrics.queued > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] text-white">
                    {metrics.queued}
                  </span>
                )}
                {tab === 'converting' && metrics.converting > 0 && (
                  <span className="ml-1.5 rounded-full bg-purple-600 px-1.5 py-0.2 text-[9px] text-white animate-pulse">
                    {metrics.converting}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search jobs..."
                className="h-8 w-44 sm:w-56 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
              />
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
            </div>

            {conversions.length > 0 && (
              <button
                type="button"
                onClick={clearCompleted}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-white px-2.5 text-[11px] font-semibold text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
                title="Clear Completed and Cancelled Jobs"
              >
                <Trash2 size={12} /> Clear Finished
              </button>
            )}
          </div>
        </div>

        {/* Jobs List */}
        {filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F4EEFF] text-[#7C3AED] dark:bg-[#311754] dark:text-[#A78BFA]">
              <Zap size={24} />
            </div>
            <h3 className="mt-3 text-[14px] font-bold text-[#1B1024] dark:text-white">
              No transcode jobs in this view
            </h3>
            <p className="mt-1 max-w-sm text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
              Create a new transcode job by selecting a recording or VOD file to convert and optimize for distribution.
            </p>
            <button
              type="button"
              onClick={openNewJobDrawer}
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-[#351147] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
            >
              <Plus size={14} /> Start New Transcode
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
            {filteredJobs.map(job => {
              const isConverting = job.status === 'converting';
              const isQueued = job.status === 'queued';
              const isCompleted = job.status === 'completed';
              const isFailed = job.status === 'failed' || job.status === 'cancelled';

              return (
                <div key={job.id} className="p-4 transition-colors hover:bg-[#F8F7FA]/70 dark:hover:bg-[#211335]/40 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[13px] text-[#1B1024] dark:text-white flex items-center gap-1.5">
                          <FileVideo size={15} className="text-[#7C3AED]" />
                          {job.originalFileName}
                        </span>
                        <ArrowRight size={13} className="text-[#6F6078]" />
                        <span className="font-bold text-[13px] text-[#4A1B7A] dark:text-[#C4B5FD]">
                          {job.targetFileName}
                        </span>

                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isConverting
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 animate-pulse'
                            : isQueued
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : isCompleted
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {isConverting && <Loader2 size={10} className="animate-spin" />}
                          {isCompleted && <Check size={10} />}
                          {isQueued && <Clock size={10} />}
                          {job.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[#6F6078] dark:text-[#B9A5CD] flex-wrap">
                        <span>Format: <strong className="uppercase font-mono text-[#1B1024] dark:text-white">{job.targetFormat}</strong></span>
                        <span>•</span>
                        <span>Encoder: <strong className="font-mono text-[#1B1024] dark:text-white">{job.options?.encoder?.toUpperCase() || 'GPU'} ({job.options?.videoCodec})</strong></span>
                        <span>•</span>
                        <span>Bitrate: <strong className="font-mono text-[#1B1024] dark:text-white">{job.options?.videoBitrate ? `${job.options.videoBitrate} kbps` : 'Auto'}</strong></span>
                        <span>•</span>
                        <span>Resolution: <strong className="font-mono text-[#1B1024] dark:text-white">{job.options?.resolution || 'Source'}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isQueued && (
                        <button
                          type="button"
                          onClick={() => startJob(job.id)}
                          className="flex h-7 items-center gap-1 rounded-md bg-[#16A36A] px-2.5 text-[11px] font-bold text-white hover:bg-[#15803D] transition-colors"
                        >
                          <Play size={12} className="fill-current" /> Start Job
                        </button>
                      )}

                      {isConverting && (
                        <button
                          type="button"
                          onClick={() => cancelJob(job.id)}
                          className="flex h-7 items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          <StopCircle size={12} /> Cancel
                        </button>
                      )}

                      {isCompleted && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewMedia({ url: `/api/ingest/recordings/file/${encodeURIComponent(job.targetFileName)}`, title: job.targetFileName })}
                            className="flex h-7 items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9]"
                          >
                            <Play size={12} /> Preview
                          </button>
                          <a
                            href={`/api/ingest/recordings/file/${encodeURIComponent(job.targetFileName)}?download=1`}
                            download
                            className="flex h-7 items-center gap-1 rounded-md bg-[#351147] px-2.5 text-[11px] font-bold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9]"
                          >
                            <Download size={12} /> Download
                          </a>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeletingJobId(job.id)}
                        className="grid h-7 w-7 place-items-center rounded-md text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:text-[#B9A5CD]"
                        title="Remove from queue"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar & Telemetry */}
                  <div className="space-y-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#1B1024] dark:text-white">
                        {isConverting ? `Converting at ${job.speed || '1.0x'} (${job.fps || 0} FPS)` : isCompleted ? 'Transcode Finished 100%' : isQueued ? 'Queued — Waiting for execution' : 'Transcode Stopped / Failed'}
                      </span>
                      <span className="font-mono font-bold text-[#7C3AED] dark:text-[#C4B5FD]">
                        {job.progress?.toFixed(1)}%
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8DFF0] dark:bg-[#311B4E]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-[#16A36A]'
                            : isFailed
                              ? 'bg-rose-500'
                              : 'bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#C026D3]'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, job.progress || (isCompleted ? 100 : 0)))}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                      <span>Time: <strong className="font-mono text-[#1B1024] dark:text-white">{formatSeconds(job.currentTime || 0)} / {formatSeconds(job.duration || 0)}</strong></span>
                      {isConverting && job.etaSeconds !== undefined && job.etaSeconds > 0 && (
                        <span>ETA: <strong className="font-mono text-[#7C3AED] dark:text-[#C4B5FD]">{formatSeconds(job.etaSeconds)}</strong></span>
                      )}
                      <span>Output Size: <strong className="font-mono text-[#1B1024] dark:text-white">{job.outputSizeFmt || formatBytes(job.outputSize)}</strong></span>
                      <span>Job ID: <code className="text-[9px] text-[#6F6078]">{job.id}</code></span>
                    </div>

                    {job.error && (
                      <div className="mt-1 rounded bg-rose-50 p-1.5 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        <strong>Error:</strong> {job.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Transcode Job Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create Transcode Job"
        subtitle="Select a source video, choose target profile and queue for hardware conversion"
        width="max-w-[580px]"
        footer={
          <div className="flex justify-between items-center w-full">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="h-8 rounded-md border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => submitTranscodeJob(false)}
                disabled={submitting || !selectedSource}
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#7C3AED] bg-white px-3 text-[12px] font-bold text-[#7C3AED] hover:bg-[#F4EEFF] disabled:opacity-50 dark:bg-[#211335] dark:border-[#A78BFA] dark:text-[#C4B5FD]"
              >
                <Clock size={14} /> Add to Queue
              </button>

              <button
                type="button"
                onClick={() => submitTranscodeJob(true)}
                disabled={submitting || !selectedSource}
                className="flex h-8 items-center gap-1.5 rounded-md bg-[#351147] px-4 text-[12px] font-bold text-white hover:bg-[#2B0D3A] disabled:opacity-50 dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
              >
                <Play size={14} className="fill-current" /> Start Immediately
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Step 1: Select Source Video */}
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#1B1024] dark:text-white">
              1. Select Source Video File <span className="text-rose-500">*</span>
            </label>

            {/* Source Tab Toggle */}
            <div className="flex rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-1 mb-2 dark:bg-[#211335] dark:border-[#371F59]">
              <button
                type="button"
                onClick={() => setSourceType('recording')}
                className={`flex-1 rounded-md py-1 text-[11px] font-bold transition-all ${
                  sourceType === 'recording'
                    ? 'bg-white text-[#351147] shadow-2xs dark:bg-[#311754] dark:text-white'
                    : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD]'
                }`}
              >
                Recordings Library ({recordingsList.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceType('vod')}
                className={`flex-1 rounded-md py-1 text-[11px] font-bold transition-all ${
                  sourceType === 'vod'
                    ? 'bg-white text-[#351147] shadow-2xs dark:bg-[#311754] dark:text-white'
                    : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD]'
                }`}
              >
                Uploaded VOD Files ({vodList.length})
              </button>
            </div>

            {/* Candidate Search */}
            <div className="relative mb-2">
              <input
                type="text"
                value={sourceSearch}
                onChange={e => setSourceSearch(e.target.value)}
                placeholder="Search available files..."
                className="h-8 w-full rounded-md border border-[#E8DFF0] bg-white pl-8 pr-3 text-[11px] text-[#1B1024] outline-none dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              />
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
            </div>

            {/* List of Available Media */}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[#E8DFF0] bg-white divide-y divide-[#E8DFF0] dark:bg-[#190E28] dark:border-[#311B4E] dark:divide-[#311B4E]">
              {loadingSources ? (
                <div className="p-4 text-center text-[11px] text-[#6F6078]">
                  <Loader2 size={16} className="mx-auto mb-1 animate-spin text-[#7C3AED]" /> Loading sources...
                </div>
              ) : sourceType === 'recording' ? (
                recordingsList
                  .filter(r => (r.file_name || '').toLowerCase().includes(sourceSearch.toLowerCase()))
                  .slice(0, 30)
                  .map(rec => {
                    const isSelected = selectedSource?.id === rec.id && selectedSource?.sourceType === 'recording';
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => handleSelectSource(rec, 'recording')}
                        className={`w-full text-left p-2.5 flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-[#F4EEFF] text-[#351147] dark:bg-[#311754] dark:text-white font-bold' : 'hover:bg-[#F8F7FA] dark:hover:bg-[#211335]'
                        }`}
                      >
                        <div className="overflow-hidden pr-2">
                          <div className="truncate text-[12px] font-semibold flex items-center gap-1.5">
                            <Film size={13} className="text-[#7C3AED] shrink-0" />
                            {rec.file_name || `Recording #${rec.id}`}
                          </div>
                          <div className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                            {formatBytes(rec.size)} • {formatSeconds(rec.duration || 0)} • {rec.format?.toUpperCase() || 'MP4'}
                          </div>
                        </div>
                        {isSelected && <Check size={16} className="text-[#7C3AED] shrink-0" />}
                      </button>
                    );
                  })
              ) : (
                vodList
                  .filter(v => (v.originalName || v.name).toLowerCase().includes(sourceSearch.toLowerCase()))
                  .map(vod => {
                    const isSelected = selectedSource?.id === vod.name && selectedSource?.sourceType === 'vod';
                    return (
                      <button
                        key={vod.name}
                        type="button"
                        onClick={() => handleSelectSource(vod, 'vod')}
                        className={`w-full text-left p-2.5 flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-[#F4EEFF] text-[#351147] dark:bg-[#311754] dark:text-white font-bold' : 'hover:bg-[#F8F7FA] dark:hover:bg-[#211335]'
                        }`}
                      >
                        <div className="overflow-hidden pr-2">
                          <div className="truncate text-[12px] font-semibold flex items-center gap-1.5">
                            <FileVideo size={13} className="text-[#059669] shrink-0" />
                            {vod.originalName || vod.name}
                          </div>
                          <div className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                            VOD Upload • {formatBytes(vod.size)}
                          </div>
                        </div>
                        {isSelected && <Check size={16} className="text-[#059669] shrink-0" />}
                      </button>
                    );
                  })
              )}
            </div>

            {selectedSource && (
              <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50/70 p-2 text-[11px] text-purple-950 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200">
                <strong>Selected:</strong> {selectedSource.fileName} ({selectedSource.sourceType === 'recording' ? 'Recording' : 'VOD File'})
              </div>
            )}
          </div>

          {/* Step 2: Choose Transcode Preset */}
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#1B1024] dark:text-white">
              2. Choose Transcoding Profile Preset
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TRANSCODE_STUDIO_PRESETS.map(preset => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetChange(preset.id)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-[#7C3AED] bg-[#F4EEFF] shadow-2xs dark:border-[#A78BFA] dark:bg-[#311754]'
                        : 'border-[#E8DFF0] bg-white hover:border-[#7C3AED]/40 dark:bg-[#211335] dark:border-[#371F59]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[12px] text-[#1B1024] dark:text-white">{preset.label}</span>
                      <span className="rounded bg-purple-200 px-1.5 py-0.2 text-[9px] font-extrabold text-purple-900 dark:bg-purple-900 dark:text-purple-200">
                        {preset.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD] line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Custom Encoding Parameters (If Custom or fine-tuning) */}
          {selectedPresetId === 'custom' && (
            <div className="space-y-3 rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:bg-[#211335] dark:border-[#371F59]">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#1B1024] dark:text-white border-b border-[#E8DFF0] pb-1.5 dark:border-[#311B4E]">
                <span className="flex items-center gap-1.5">
                  <Sliders size={13} /> Custom Profile Parameters
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <label className="mb-1 block font-semibold text-[#1B1024] dark:text-white">Video Codec</label>
                  <select
                    value={transcodeOptions.videoCodec || 'h264'}
                    onChange={e => setTranscodeOptions(prev => ({ ...prev, videoCodec: e.target.value as any }))}
                    className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                  >
                    <option value="h264">H.264 / AVC</option>
                    <option value="hevc">H.265 / HEVC</option>
                    <option value="copy">Stream Copy (Passthrough)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-[#1B1024] dark:text-white">Encoder Hardware</label>
                  <select
                    value={transcodeOptions.encoder || 'nvidia'}
                    onChange={e => setTranscodeOptions(prev => ({ ...prev, encoder: e.target.value as any }))}
                    className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                  >
                    <option value="nvidia">NVIDIA NVENC (GPU)</option>
                    <option value="amd">AMD AMF (GPU)</option>
                    <option value="qsv">Intel QuickSync (QSV)</option>
                    <option value="cpu">Software (CPU x264/x265)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-[#1B1024] dark:text-white">Target Resolution</label>
                  <select
                    value={transcodeOptions.resolution || 'source'}
                    onChange={e => setTranscodeOptions(prev => ({ ...prev, resolution: e.target.value }))}
                    className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                  >
                    <option value="source">Source Original</option>
                    <option value="3840x2160">3840x2160 (4K UHD)</option>
                    <option value="1920x1080">1920x1080 (1080p FHD)</option>
                    <option value="1280x720">1280x720 (720p HD)</option>
                    <option value="854x480">854x480 (480p SD)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-[#1B1024] dark:text-white">Video Bitrate (kbps)</label>
                  <input
                    type="number"
                    value={transcodeOptions.videoBitrate || 12000}
                    onChange={e => setTranscodeOptions(prev => ({ ...prev, videoBitrate: Number(e.target.value) }))}
                    className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="deinterlace-check"
                  checked={transcodeOptions.deinterlace !== false}
                  onChange={e => setTranscodeOptions(prev => ({ ...prev, deinterlace: e.target.checked }))}
                  className="rounded text-[#7C3AED]"
                />
                <label htmlFor="deinterlace-check" className="text-[11px] font-semibold text-[#1B1024] dark:text-white cursor-pointer">
                  Enable Broadcast Hardware Deinterlacing (YADIF filter for 50i / 60i signals)
                </label>
              </div>
            </div>
          )}

          {/* Step 4: Output File Name & Format */}
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-[#1B1024] dark:text-white">
              3. Output File Name & Target Container
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={targetFileName}
                onChange={e => setTargetFileName(e.target.value)}
                placeholder="e.g. broadcast_master_1080p.mp4"
                className="h-9 flex-1 rounded-md border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              />

              <select
                value={transcodeOptions.format || 'mp4'}
                onChange={e => {
                  const newFmt = e.target.value as any;
                  setTranscodeOptions(prev => ({ ...prev, format: newFmt }));
                  if (targetFileName) {
                    const clean = targetFileName.replace(/\.[^/.]+$/, '');
                    setTargetFileName(`${clean}.${newFmt}`);
                  }
                }}
                className="h-9 w-24 rounded-md border border-[#E8DFF0] bg-white px-2 text-[12px] font-bold text-[#1B1024] outline-none dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              >
                <option value="mp4">.MP4</option>
                <option value="mkv">.MKV</option>
                <option value="mov">.MOV</option>
                <option value="ts">.TS</option>
              </select>
            </div>
          </div>
        </div>
      </DetailDrawer>

      {/* Video Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-purple-500/30">
            <div className="flex items-center justify-between p-3 bg-neutral-900 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-white font-semibold text-[13px]">
                <Film size={16} className="text-purple-400" />
                <span>{previewMedia.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700"
              >
                <X size={15} />
              </button>
            </div>
            <KashtrixMediaPlayer
              src={previewMedia.url}
              title={previewMedia.title}
              isLive={false}
              autoPlay={true}
              maxHeight="70vh"
            />
          </div>
        </div>
      )}

      {/* Confirm Delete Job Dialog */}
      <ConfirmDialog
        open={!!deletingJobId}
        title="Remove Transcode Job"
        message="Are you sure you want to remove this job record from the queue?"
        confirmLabel="Remove Job"
        variant="danger"
        onConfirm={() => deletingJobId && deleteJob(deletingJobId)}
        onCancel={() => setDeletingJobId(null)}
      />
    </div>
  );
};

export default TranscodeStudio;
