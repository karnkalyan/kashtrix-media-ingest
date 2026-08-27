import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tv,
  Zap,
  Radio,
  Archive,
  HardDrive,
  Users,
  RefreshCw,
  Play,
  X,
  Activity,
  Server,
  ChevronRight,
  Cpu,
  Layers,
  Wifi,
  ShieldCheck,
  CheckCircle2,
  LayoutGrid,
  List,
  Volume2,
  Maximize2,
  ExternalLink
} from 'lucide-react';
import Button from './ui/Button';
import ProtocolBadge from './ui/ProtocolBadge';
import KashtrixMediaPlayer from './ui/KashtrixMediaPlayer';
import { subscribeRealtime } from '../services/realtime';
import RecordingElapsedTimer from './RecordingElapsedTimer';

const formatSpeedRate = (bytesPerSec: number): string => {
  if (!bytesPerSec || isNaN(bytesPerSec)) return '0 B/s';
  const bits = bytesPerSec * 8;
  if (bits >= 1_000_000_000) return `${(bits / 1_000_000_000).toFixed(2)} Gbps`;
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(2)} Mbps`;
  if (bits >= 1_000) return `${(bits / 1_000).toFixed(1)} Kbps`;
  return `${bits.toFixed(0)} bps`;
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

const getRecordingUrl = (item: any): string => {
  if (!item) return '';
  if (item.id) return `/recording-preview/${encodeURIComponent(item.id)}/index.m3u8`;
  const fileName = item.file_name || item.stream;
  return `/recording-preview/${encodeURIComponent(fileName || '')}/index.m3u8`;
};

interface DashboardOverview {
  generatedAt: string;
  totals: {
    channels: number;
    runningChannels: number;
    activeIngests: number;
    activeRecordings: number;
    recordings: number;
    recordingBytes: number;
    sessions: number;
    viewers: number;
    incomingBytes: number;
    outgoingBytes: number;
  };
  streams: Record<string, any>;
  recentSessions: any[];
  recentRecordings: any[];
  activeRecordingsList?: any[];
  system?: any;
}

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const formatDuration = (seconds = 0) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const emptyOverview: DashboardOverview = {
  generatedAt: '',
  totals: { channels: 0, runningChannels: 0, activeIngests: 0, activeRecordings: 0, recordings: 0, recordingBytes: 0, sessions: 0, viewers: 0, incomingBytes: 0, outgoingBytes: 0 },
  streams: {},
  recentSessions: [],
  recentRecordings: [],
  activeRecordingsList: [],
};

const dashboardCacheKey = 'kte-dashboard-overview';

const readCachedOverview = (): DashboardOverview => {
  try {
    const cached = sessionStorage.getItem(dashboardCacheKey);
    return cached ? { ...emptyOverview, ...JSON.parse(cached) } : emptyOverview;
  } catch {
    return emptyOverview;
  }
};

export const KashtrixDashboard: React.FC<{ onNavigate?: (tab: string) => void; mediaPort?: number }> = ({ onNavigate, mediaPort = 8080 }) => {
  const [overview, setOverview] = useState<DashboardOverview>(readCachedOverview);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [previewRecording, setPreviewRecording] = useState<any | null>(null);
  const [previewService, setPreviewService] = useState<any | null>(null);
  const [activeServices, setActiveServices] = useState<any[]>([]);
  const [servicesViewMode, setServicesViewMode] = useState<'thumbnails' | 'list'>('thumbnails');

  const [systemStats, setSystemStats] = useState<any>(null);

  const fetchOverview = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Also fetch active broadcast processes & channel previews
      fetch('/api/dashboard/active-services', { headers })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.services) setActiveServices(data.services); })
        .catch(() => {});

      const response = await fetch('/api/dashboard/overview', { headers });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setOverview(body);
        sessionStorage.setItem(dashboardCacheKey, JSON.stringify(body));
      } else if (response.status === 404) {
        const [stateResponse, streamsResponse, recordingsResponse, historyResponse] = await Promise.all([
          fetch('/api/state', { headers }),
          fetch('/api/ingest/streams', { headers }),
          fetch('/api/ingest/recordings', { headers }),
          fetch('/api/ingest/history', { headers }),
        ]);
        if (![stateResponse, streamsResponse, recordingsResponse, historyResponse].every(item => item.ok)) {
          throw new Error('Main API server is loading');
        }
        const [state, streamData, recordingData, historyData] = await Promise.all([
          stateResponse.json(),
          streamsResponse.json(),
          recordingsResponse.json(),
          historyResponse.json(),
        ]);
        const recordings = recordingData.recordings || [];
        const sessions = historyData.history || [];
        const streams = streamData.streams || {};
        const streamValues = Object.values(streams) as any[];
        const fallbackOverview = {
          generatedAt: new Date().toISOString(),
          streams,
          recentSessions: sessions.slice(0, 8),
          recentRecordings: recordings.slice(0, 8),
          totals: {
            channels: state.channels?.length || 0,
            runningChannels: state.channels?.filter((channel: any) => channel.status === 'Running').length || 0,
            activeIngests: Object.keys(streams).length,
            activeRecordings: recordings.filter((recording: any) => recording.is_active).length,
            recordings: recordings.length,
            recordingBytes: recordings.reduce((total: number, recording: any) => total + Number(recording.size || 0), 0),
            sessions: sessions.length,
            viewers: streamValues.reduce((total, stream) => total + Number(stream.viewers || 0), 0),
            incomingBytes: streamValues.reduce((total, stream) => total + Number(stream.total_in_bytes || 0), 0),
            outgoingBytes: streamValues.reduce((total, stream) => total + Number(stream.total_out_bytes || 0), 0),
          },
        };
        setOverview(fallbackOverview);
        sessionStorage.setItem(dashboardCacheKey, JSON.stringify(fallbackOverview));
      } else {
        throw new Error(body.error || `Dashboard request failed (${response.status})`);
      }
      setError('');
    } catch (cause: any) {
      if (showIndicator || !sessionStorage.getItem(dashboardCacheKey)) {
        setError(cause.message || 'Unable to load dashboard overview');
      }
    } finally {
      if (showIndicator) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);
  }, [fetchOverview]);

  useEffect(() => {
    const commit = (updater: (current: DashboardOverview) => DashboardOverview) => {
      setOverview(current => {
        const next = updater(current);
        sessionStorage.setItem(dashboardCacheKey, JSON.stringify(next));
        return next;
      });
      setError('');
    };

    return subscribeRealtime(message => {
      if (message.type === 'dashboard_overview' && message.payload) {
        commit(() => message.payload);
      } else if (message.type === 'system_stats' && message.payload) {
        setSystemStats(message.payload);
      } else if (message.type === 'ingest_stats') {
        const streams = message.payload || {};
        const streamValues = Object.values(streams) as any[];
        commit(current => ({
          ...current,
          generatedAt: new Date().toISOString(),
          streams,
          totals: {
            ...current.totals,
            activeIngests: streamValues.length,
            activeRecordings: streamValues.filter(stream => stream?.isRecording).length,
            viewers: streamValues.reduce((total, stream) => total + Number(stream?.viewers || 0), 0),
          },
        }));
      } else if (message.type === 'recordings_list') {
        const recordings = Array.isArray(message.payload) ? message.payload : [];
        commit(current => ({
          ...current,
          generatedAt: new Date().toISOString(),
          recentRecordings: recordings.slice(0, 8),
          totals: {
            ...current.totals,
            recordings: recordings.length,
            activeRecordings: recordings.filter(recording => recording?.is_active).length,
            recordingBytes: recordings.reduce((total, recording) => total + Number(recording?.size || 0), 0),
          },
        }));
      }
    }, setRealtimeConnected);
  }, []);

  return (
    <div className="dashboard-workspace page-stack space-y-4">
      {/* Header Strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">StreamOps Overview</h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Live API telemetry from this ingest and transcoding node
          </p>
        </div>

        <button
          type="button"
          onClick={() => { fetchOverview(true); }}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2F1A4B]"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-[12px] font-semibold text-[#DC3545] dark:bg-[#450A0A] dark:border-[#7F1D1D] dark:text-[#FCA5A5]">
          {error}
        </div>
      )}

      <RecordingElapsedTimer
        recordings={overview.activeRecordingsList || []}
        title="Current Recording Timer"
      />

      {/* Server Operational Status & Subsystem Health Panel */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A36A] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#16A36A]"></span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">
                  Server Core Operational
                </h2>
                <span className="rounded-md bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 text-[10px] font-bold text-[#16A36A] dark:bg-[#064E3B]/60 dark:border-[#059669]/60 dark:text-[#34D399]">
                  All Subsystems Healthy
                </span>
              </div>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                Stream Ingest, GPU acceleration, Transcoder, and Database active • Uptime: <strong className="font-mono text-[#1B1024] dark:text-white">{systemStats?.uptimeFmt || 'Active'}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate?.('monitor')}
            className="flex items-center gap-1.5 self-start rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 py-1.5 text-[11px] font-semibold text-[#4A1B7A] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#C4B5FD] dark:hover:bg-[#2D1A45] sm:self-auto transition-colors"
          >
            <Activity size={13} className="text-[#6D32D9] dark:text-[#A78BFA]" />
            <span>Open System Telemetry</span>
            <ChevronRight size={12} />
          </button>
        </div>

        {/* Subsystem Health Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A]" />
            <span className="font-medium text-[11px]">Stream Ingest (RTMP / SRT)</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]">
            <Zap size={12} className="text-amber-500 dark:text-amber-400" />
            <span className="font-medium text-[11px]">GPU Acceleration: <strong>{systemStats?.gpuDetails?.model || 'Hardware Video Engine'}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A]" />
            <span className="font-medium text-[11px]">Transcoder</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A]" />
            <span className="font-medium text-[11px]">Database</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A]" />
            <span className="font-medium text-[11px]">Realtime Sync Engine</span>
          </div>
        </div>

        {/* Real-time Hardware & GPU Strip */}
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5 border-t border-[#E8DFF0] pt-3 dark:border-[#311B4E]">
          <div
            onClick={() => onNavigate?.('monitor')}
            className="cursor-pointer rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 hover:bg-[#F4EEFF]/60 dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#2D1A45] transition-colors"
          >
            <div className="flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              <span className="font-semibold uppercase tracking-wider">CPU Load</span>
              <Cpu size={12} className="text-[#6D32D9] dark:text-[#A78BFA]" />
            </div>
            <p className="font-mono text-[16px] font-bold text-[#1B1024] dark:text-white mt-0.5">
              {systemStats ? `${systemStats.cpuLoad?.toFixed(1)}%` : '—'}
            </p>
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">{systemStats?.cpusCount || 1} cores active</span>
          </div>

          <div
            onClick={() => onNavigate?.('monitor')}
            className="cursor-pointer rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 hover:bg-[#F4EEFF]/60 dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#2D1A45] transition-colors"
          >
            <div className="flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              <span className="font-semibold uppercase tracking-wider">GPU Engine</span>
              <Zap size={12} className="text-amber-500 dark:text-amber-400" />
            </div>
            <p className="font-mono text-[16px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {systemStats?.gpuDetails ? `${systemStats.gpuDetails.load?.toFixed(1)}%` : '—'}
            </p>
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] truncate block" title={systemStats?.gpuDetails?.model}>
              {systemStats?.gpuDetails?.vramFmt || 'VRAM'} ({systemStats?.gpuDetails?.memoryLoad?.toFixed(0) || 0}%)
            </span>
          </div>

          <div
            onClick={() => onNavigate?.('monitor')}
            className="cursor-pointer rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 hover:bg-[#F4EEFF]/60 dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#2D1A45] transition-colors"
          >
            <div className="flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              <span className="font-semibold uppercase tracking-wider">System RAM</span>
              <Layers size={12} className="text-[#2563EB]" />
            </div>
            <p className="font-mono text-[16px] font-bold text-[#2563EB] dark:text-[#60A5FA] mt-0.5">
              {systemStats ? `${systemStats.memLoad?.toFixed(1)}%` : '—'}
            </p>
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] truncate block">
              {systemStats?.memoryDetails ? `${systemStats.memoryDetails.usedFmt}` : 'Allocated'}
            </span>
          </div>

          <div
            onClick={() => onNavigate?.('monitor')}
            className={`cursor-pointer rounded-lg border p-2.5 transition-colors ${
              (systemStats?.diskLoad || 0) >= 90
                ? 'border-rose-300 bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/60'
                : (systemStats?.diskLoad || 0) >= 85
                ? 'border-amber-300 bg-amber-50/80 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-900/60'
                : 'border-[#E8DFF0] bg-[#F8F7FA] hover:bg-[#F4EEFF]/60 dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#2D1A45]'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              <span className="font-semibold uppercase tracking-wider">Storage Disk</span>
              <HardDrive size={12} className={(systemStats?.diskLoad || 0) >= 90 ? 'text-rose-600 dark:text-rose-400 animate-pulse' : (systemStats?.diskLoad || 0) >= 85 ? 'text-amber-500' : 'text-[#16A36A]' } />
            </div>
            <p className={`font-mono text-[16px] font-bold mt-0.5 ${(systemStats?.diskLoad || 0) >= 90 ? 'text-rose-600 dark:text-rose-400' : (systemStats?.diskLoad || 0) >= 85 ? 'text-amber-600 dark:text-amber-400' : 'text-[#16A36A] dark:text-[#34D399]'}`}>
              {systemStats ? `${systemStats.diskLoad?.toFixed(1)}%` : '—'}
            </p>
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] truncate block">
              {systemStats?.storageDetails ? `${systemStats.storageDetails.usedFmt} (${systemStats.storageDetails.availableFmt} free)` : 'Used'}
            </span>
          </div>

          <div
            onClick={() => onNavigate?.('monitor')}
            className="cursor-pointer rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 hover:bg-[#F4EEFF]/60 dark:bg-[#211335] dark:border-[#371F59] dark:hover:bg-[#2D1A45] transition-colors col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              <span className="font-semibold uppercase tracking-wider">Network I/O</span>
              <Wifi size={12} className="text-[#0284C7]" />
            </div>
            <p className="font-mono text-[16px] font-bold text-[#0284C7] dark:text-[#38BDF8] mt-0.5">
              {formatSpeedRate((systemStats?.lastRx || 0) + (systemStats?.lastTx || 0))}
            </p>
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              ↓ {formatSpeedRate(systemStats?.lastRx || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          onClick={() => onNavigate?.('channels')}
          className="cursor-pointer transition-all hover:scale-[1.01] rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Channels</span>
          <p className="font-mono text-[20px] font-bold text-[#1B1024] dark:text-white">{overview.totals.channels}</p>
          <span className="text-[10px] text-[#16A36A] font-medium dark:text-[#34D399]">{overview.totals.runningChannels} active</span>
        </div>
        <div
          onClick={() => onNavigate?.('ingest')}
          className="cursor-pointer transition-all hover:scale-[1.01] rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Live Ingests</span>
          <p className="font-mono text-[20px] font-bold text-[#16A36A] dark:text-[#34D399]">{overview.totals.activeIngests}</p>
          <span className="text-[10px] text-[#6F6078] dark:text-[#8E78A6]">RTMP / SRT feeds</span>
        </div>
        <div
          onClick={() => onNavigate?.('ingest')}
          className={`cursor-pointer transition-all hover:scale-[1.01] rounded-xl border p-3 shadow-xs ${
            overview.totals.activeRecordings > 0
              ? 'border-rose-300 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20'
              : 'border-[#E8DFF0] bg-white dark:bg-[#190E28] dark:border-[#311B4E]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Active Recs</span>
            {overview.totals.activeRecordings > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
              </span>
            )}
          </div>
          <p className="font-mono text-[20px] font-bold text-[#E11D72] dark:text-[#F472B6]">{overview.totals.activeRecordings}</p>
          <span className="text-[10px] text-[#6F6078] dark:text-[#8E78A6]">{overview.totals.recordings} archived</span>
        </div>
        <div
          onClick={() => onNavigate?.('recordings')}
          className="cursor-pointer transition-all hover:scale-[1.01] rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#1E293B] dark:border-[#334155]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#94A3B8]">Storage</span>
          <p className="font-mono text-[20px] font-bold text-[#7C3AED] dark:text-[#A78BFA]">{formatBytes(overview.totals.recordingBytes)}</p>
          <span className="text-[10px] text-[#6F6078] dark:text-[#94A3B8]">On disk</span>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs col-span-2 sm:col-span-1 dark:bg-[#1E293B] dark:border-[#334155]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#94A3B8]">Viewers</span>
          <p className="font-mono text-[20px] font-bold text-[#4A1B7A] dark:text-[#C4B5FD]">{overview.totals.viewers}</p>
          <span className="text-[10px] text-[#6F6078] dark:text-[#94A3B8]">{overview.totals.sessions} sessions</span>
        </div>
      </div>

      {/* Active Master Recording Status Banner */}
      {overview.activeRecordingsList && overview.activeRecordingsList.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm dark:border-rose-900/60 dark:bg-[#1E0C22]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-rose-100 pb-3 dark:border-rose-900/40">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[14px] font-bold text-rose-950 dark:text-rose-200">
                    Live Recording in Progress
                  </h2>
                  <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase shadow-xs">
                    {overview.activeRecordingsList.length} Active Session{overview.activeRecordingsList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                  Direct capture & archive engine is currently recording uncompressed broadcast feeds
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate?.('ingest')}
              className="flex items-center gap-1.5 self-start rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-xs hover:bg-rose-700 sm:self-auto transition-colors"
            >
              Open Recording Studio <ChevronRight size={13} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {overview.activeRecordingsList.map(rec => (
              <div
                key={rec.key}
                className="rounded-lg border border-rose-200/80 bg-white/90 p-3 shadow-2xs dark:border-rose-900/50 dark:bg-[#1E1130]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-bold text-slate-900 dark:text-white truncate max-w-[200px]" title={rec.stream}>
                    {rec.app === 'device' ? `Device: ${rec.stream}` : `${rec.app}/${rec.stream}`}
                  </span>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 animate-pulse">
                    REC {formatDuration(rec.duration || 0)}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-[10px] font-mono dark:border-slate-800">
                  <div>
                    <span className="block text-[9px] uppercase text-slate-400 font-sans">Size</span>
                    <b className="text-slate-800 dark:text-slate-200">{formatBytes(rec.size || 0)}</b>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-slate-400 font-sans">Quality</span>
                    <b className="text-purple-600 dark:text-purple-400">{rec.videoBitrate}k</b>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-slate-400 font-sans">FPS / Codec</span>
                    <b className="text-slate-800 dark:text-slate-200">{rec.framerate || 50} fps</b>
                  </div>
                </div>

                {rec.fileName && (
                  <p className="mt-2 truncate font-mono text-[9px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-800" title={rec.filePath || rec.fileName}>
                    {rec.fileName}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Broadcast Services & Channels Multiviewer */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs space-y-3 dark:bg-[#190E28] dark:border-[#311B4E]">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">
                Active Broadcast Services & Playout Matrix
              </h2>
              <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
                {activeServices.filter(s => s.isRunning).length} Online / {activeServices.length} Total
              </span>
            </div>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
              Real-time video confidence preview, audio VU meters, and encoding status across Channels, Ingest & VOD
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {/* View Mode Toggle: Thumbnails vs List */}
            <div className="flex items-center rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 dark:bg-[#211335] dark:border-[#371F59]">
              <button
                type="button"
                onClick={() => setServicesViewMode('thumbnails')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  servicesViewMode === 'thumbnails'
                    ? 'bg-[#7C3AED] text-white shadow-2xs'
                    : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'
                }`}
                title="Thumbnails Multiviewer View"
              >
                <LayoutGrid size={13} />
                <span>Multiviewer</span>
              </button>
              <button
                type="button"
                onClick={() => setServicesViewMode('list')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  servicesViewMode === 'list'
                    ? 'bg-[#7C3AED] text-white shadow-2xs'
                    : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'
                }`}
                title="List Table View"
              >
                <List size={13} />
                <span>List View</span>
              </button>
            </div>

            <Button
              variant="secondary"
              onClick={() => onNavigate?.('channels')}
            >
              <span>Manage Channels</span>
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>

        {activeServices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#E8DFF0] p-8 text-center dark:border-[#371F59]">
            <Tv size={28} className="mx-auto text-[#6F6078] dark:text-[#B9A5CD]" />
            <p className="mt-2 text-xs font-bold text-[#1B1024] dark:text-white">No broadcast channels configured</p>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Add an SDI DeckLink input, UDP stream, or VOD playlist in Channels.</p>
            <div className="mt-3">
              <Button onClick={() => onNavigate?.('channels')}>Create Channel</Button>
            </div>
          </div>
        ) : servicesViewMode === 'thumbnails' ? (
          /* Multiviewer Thumbnail Grid */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeServices.map(svc => (
              <div
                key={svc.id}
                className="group relative overflow-hidden rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] shadow-2xs transition-all hover:border-[#7C3AED]/60 dark:bg-[#0F0A18] dark:border-[#371F59]"
              >
                {/* Live Preview Window / Placeholder */}
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  {svc.isRunning ? (
                    <div className="relative h-full w-full flex items-center justify-center bg-slate-950">
                      <KashtrixMediaPlayer
                        src={svc.hlsPreviewUrl}
                        title={svc.name}
                        isLive={true}
                        autoPlay={true}
                        showAudioMeter={false}
                        className="h-full w-full object-cover"
                      />
                      {/* Audio Peak Overlay Meters in Bottom Right of Video */}
                      <div className="absolute bottom-2 right-2 flex items-end gap-1 rounded bg-black/80 px-1.5 py-1 backdrop-blur-xs">
                        <Volume2 size={10} className="text-emerald-400" />
                        <div className="flex gap-0.5 items-end h-3">
                          <div className="w-1 bg-emerald-500 rounded-xs animate-pulse" style={{ height: '70%' }} />
                          <div className="w-1 bg-emerald-400 rounded-xs animate-pulse" style={{ height: '65%' }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-[#6F6078] dark:text-[#8E78A6] p-4 text-center">
                      <Tv size={24} className="mb-1 opacity-50" />
                      <span className="text-[11px] font-semibold">Service Standby / Stopped</span>
                    </div>
                  )}

                  {/* Top Status Overlays */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      svc.isRunning
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-700/80 text-slate-200'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${svc.isRunning ? 'bg-white animate-ping' : 'bg-slate-400'}`} />
                      {svc.status}
                    </span>
                    <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white uppercase">
                      {svc.inputType === 'device' ? 'SDI DECKLINK' : svc.inputType === 'vod' ? 'VOD PLAYOUT' : 'LIVE TRANSCODE'}
                    </span>
                  </div>

                  {/* Fullscreen Preview Button */}
                  {svc.isRunning && (
                    <button
                      type="button"
                      onClick={() => setPreviewService(svc)}
                      className="absolute top-2 right-2 rounded bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#7C3AED]"
                      title="Open Large Confidence Monitor"
                    >
                      <Maximize2 size={12} />
                    </button>
                  )}
                </div>

                {/* Service Metadata Footer */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs text-[#1B1024] dark:text-white truncate" title={svc.name}>
                      {svc.name}
                    </h3>
                    <span className="font-mono text-[10px] font-bold text-[#7C3AED] dark:text-[#C4B5FD]">
                      {svc.bitrateKbps ? `${svc.bitrateKbps} kbps` : '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono border-t border-[#E8DFF0] pt-1.5 dark:border-[#311B4E]">
                    <div className="text-[#6F6078] dark:text-[#B9A5CD]">
                      FPS: <b className="text-[#1B1024] dark:text-white">{svc.fps ? `${svc.fps} fps` : '25.0 fps'}</b>
                    </div>
                    <div className="text-[#6F6078] dark:text-[#B9A5CD] text-right truncate">
                      Signal: <b className="text-emerald-600 dark:text-emerald-400">1080i50 HD-SDI</b>
                    </div>
                  </div>

                  {svc.destinations?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {svc.destinations.map((d: any, i: number) => (
                        <span key={i} className="rounded bg-[#F4EEFF] px-1.5 py-0.5 text-[9px] font-mono text-[#7C3AED] dark:bg-[#311754] dark:text-[#C4B5FD]">
                          {d.protocol.toUpperCase()} {d.dvbServiceId ? `(SID: ${d.dvbServiceId})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Multiviewer List View */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                  <th className="p-2.5">Service Name</th>
                  <th className="p-2.5">Input Signal</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">FPS</th>
                  <th className="p-2.5">Bitrate</th>
                  <th className="p-2.5">DVB Destinations</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {activeServices.map(svc => (
                  <tr key={svc.id} className="hover:bg-[#F4EEFF]/40 dark:hover:bg-[#27153D]">
                    <td className="p-2.5 font-bold text-[#1B1024] dark:text-white">{svc.name}</td>
                    <td className="p-2.5 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                      {svc.inputType === 'device' ? 'DeckLink HD-SDI (1080i50)' : svc.inputUrl || 'Live Input'}
                    </td>
                    <td className="p-2.5">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        svc.isRunning
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${svc.isRunning ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {svc.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono font-semibold">{svc.fps ? `${svc.fps} fps` : '25.0 fps'}</td>
                    <td className="p-2.5 font-mono font-bold text-[#7C3AED] dark:text-[#C4B5FD]">{svc.bitrateKbps ? `${svc.bitrateKbps}k` : '—'}</td>
                    <td className="p-2.5 font-mono text-[11px]">
                      {svc.destinations?.map((d: any) => `${d.protocol.toUpperCase()}${d.dvbServiceId ? ` (SID: ${d.dvbServiceId})` : ''}`).join(', ') || 'HLS'}
                    </td>
                    <td className="p-2.5 text-right">
                      {svc.isRunning && (
                        <button
                          type="button"
                          onClick={() => setPreviewService(svc)}
                          className="inline-flex items-center gap-1 rounded bg-[#F4EEFF] px-2 py-1 text-[11px] font-semibold text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-colors dark:bg-[#311754] dark:text-[#E2D1F9]"
                        >
                          <Play size={11} />
                          <span>Monitor</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main 2-Column Desktop Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left Column: Live Streams */}
        <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden lg:col-span-2 dark:bg-[#1E293B] dark:border-[#334155]">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-3 dark:border-[#334155]">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Live Television Ingests</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#94A3B8]">Active streams published to server</p>
            </div>
            <button
              onClick={() => onNavigate?.('ingest')}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#6D32D9] hover:underline dark:text-[#A78BFA]"
            >
              Open Ingest Control <ChevronRight size={13} />
            </button>
          </div>

          {Object.keys(overview.streams).length === 0 ? (
            <div className="grid min-h-[140px] place-items-center p-6 text-center text-[#6F6078] text-[12px] dark:text-[#94A3B8]">
              <div>
                <Zap size={22} className="mx-auto text-[#6F6078] dark:text-[#94A3B8]" />
                <p className="mt-1 font-semibold text-[#1B1024] dark:text-white">No television inputs active</p>
              </div>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(overview.streams).map(([key, stream]: [string, any]) => (
                <div key={key} className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-2 dark:bg-[#0F172A] dark:border-[#334155]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1B1024] text-[13px] truncate dark:text-white">{stream.name || key}</span>
                    <div className="flex items-center gap-1.5">
                      {stream.isRecording && (
                        <span className="flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.2 text-[9px] font-bold text-rose-600 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                          REC
                        </span>
                      )}
                      <span className="rounded-full bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.2 text-[9px] font-bold text-[#16A36A] dark:bg-[#064E3B] dark:border-[#047857] dark:text-[#34D399]">
                        LIVE
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px]">
                    <div>
                      <span className="block text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#94A3B8]">Bitrate</span>
                      <b className="text-[#7C3AED] dark:text-[#34D399]">{stream.incoming_kbps || 0}k</b>
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#8E78A6]">Viewers</span>
                      <b className="text-[#1B1024] dark:text-white">{stream.viewers || 0}</b>
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#8E78A6]">Recording</span>
                      <b className={stream.isRecording ? 'text-rose-600 font-bold dark:text-rose-400' : 'text-[#6F6078] dark:text-[#8E78A6]'}>
                        {stream.isRecording ? 'RECORDING' : 'IDLE'}
                      </b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Latest Recordings */}
        <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-3 dark:border-[#311B4E]">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Recordings</h2>
              {overview.totals.activeRecordings > 0 && (
                <span className="rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300 animate-pulse">
                  {overview.totals.activeRecordings} Recording
                </span>
              )}
            </div>
            <button
              onClick={() => onNavigate?.('recordings')}
              className="text-[11px] font-semibold text-[#6D32D9] hover:underline dark:text-[#A78BFA]"
            >
              View All
            </button>
          </div>

          <div className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
            {overview.recentRecordings.length === 0 ? (
              <div className="p-6 text-center text-[#6F6078] text-[12px] dark:text-[#8E78A6]">No recordings archived.</div>
            ) : (
              overview.recentRecordings.slice(0, 5).map(recording => (
                <div key={recording.id} className="flex items-center justify-between p-3 transition-colors hover:bg-[#F4EEFF]/40 dark:hover:bg-[#2B1745]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {recording.is_active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
                      )}
                      <p className="truncate font-semibold text-[#1B1024] text-[12px] dark:text-white" title={recording.file_name}>
                        {recording.file_name}
                      </p>
                    </div>
                    <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                      {recording.app}/{recording.stream} • {formatBytes(Number(recording.size || 0))}
                      {recording.is_active && <span className="ml-1 text-rose-600 font-bold dark:text-rose-400">• LIVE REC</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewRecording(recording)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E8DFF0] text-[#4A1B7A] hover:bg-[#F4EEFF] dark:border-[#371F59] dark:text-[#C4B5FD] dark:hover:bg-[#2D1A45]"
                  >
                    <Play size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Telemetry Footer Strip */}
      <div className="flex items-center justify-between rounded-xl border border-[#E8DFF0] bg-white px-4 py-2.5 text-[11px] text-[#6F6078] shadow-xs dark:bg-[#190E28] dark:border-[#311B4E] dark:text-[#B9A5CD]">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${realtimeConnected ? 'bg-[#16A36A] dark:bg-[#34D399]' : 'bg-[#D97706]'}`} />
          <span className="font-semibold text-[#1B1024] dark:text-white">
            {realtimeConnected ? 'Telemetry Feed Active' : 'Connecting to Telemetry Daemon...'}
          </span>
        </div>
        <span className="font-mono">
          Last poll: {overview.generatedAt ? new Date(overview.generatedAt).toLocaleTimeString() : 'waiting...'}
        </span>
      </div>

      {/* Service Preview Modal */}
      {previewService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setPreviewService(null); }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[#E8DFF0] bg-white shadow-2xl dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-3 dark:border-[#311B4E]">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">
                  Live Confidence Monitor — {previewService.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewService(null)}
                className="rounded p-1 text-[#6F6078] hover:bg-[#F8F7FA] dark:text-[#B9A5CD] dark:hover:bg-[#211335]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <KashtrixMediaPlayer
                src={previewService.hlsPreviewUrl}
                title={previewService.name}
                isLive={true}
                autoPlay={true}
                showAudioMeter={true}
                className="w-full h-full"
              />
            </div>
            <div className="flex items-center justify-between p-3 border-t border-[#E8DFF0] bg-[#F8F7FA] text-xs font-mono dark:bg-[#211335] dark:border-[#311B4E]">
              <span>Resolution & Format: <b>1920x1080i50 (DeckLink SDI / Hi50)</b></span>
              <span className="text-[#7C3AED] dark:text-[#C4B5FD]">MPEG-4 AVC High Profile (Level 4.1)</span>
            </div>
          </div>
        </div>
      )}

      {/* Recording Preview Modal */}
      {previewRecording && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={e => { if (e.target === e.currentTarget) setPreviewRecording(null); }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-xl dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-3 dark:border-[#311B4E]">
              <h3 className="truncate font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">
                {previewRecording.file_name}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewRecording(null)}
                className="rounded p-1 text-[#6F6078] hover:bg-[#F8F7FA] dark:text-[#B9A5CD] dark:hover:bg-[#211335]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <KashtrixMediaPlayer
                src={getRecordingUrl(previewRecording)}
                title={previewRecording.file_name}
                isLive={false}
                isRecording={Boolean(previewRecording.is_active)}
                autoPlay={true}
                showAudioMeter={true}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KashtrixDashboard;
