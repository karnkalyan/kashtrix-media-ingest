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
  ChevronRight
} from 'lucide-react';
import Button from './ui/Button';
import ProtocolBadge from './ui/ProtocolBadge';
import { subscribeRealtime } from '../services/realtime';

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
  system?: any;
}

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const emptyOverview: DashboardOverview = {
  generatedAt: '',
  totals: { channels: 0, runningChannels: 0, activeIngests: 0, activeRecordings: 0, recordings: 0, recordingBytes: 0, sessions: 0, viewers: 0, incomingBytes: 0, outgoingBytes: 0 },
  streams: {},
  recentSessions: [],
  recentRecordings: [],
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

  const fetchOverview = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
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
          onClick={() => fetchOverview(true)}
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

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Channels</span>
          <p className="font-mono text-[20px] font-bold text-[#1B1024] dark:text-white">{overview.totals.channels}</p>
          <span className="text-[10px] text-[#16A36A] font-medium dark:text-[#34D399]">{overview.totals.runningChannels} active</span>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Live Ingests</span>
          <p className="font-mono text-[20px] font-bold text-[#16A36A] dark:text-[#34D399]">{overview.totals.activeIngests}</p>
          <span className="text-[10px] text-[#6F6078] dark:text-[#8E78A6]">RTMP / SRT feeds</span>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Active Recs</span>
          <p className="font-mono text-[20px] font-bold text-[#E11D72] dark:text-[#F472B6]">{overview.totals.activeRecordings}</p>
          <span className="text-[10px] text-[#6F6078] dark:text-[#8E78A6]">{overview.totals.recordings} archived</span>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#1E293B] dark:border-[#334155]">
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
                    <span className="rounded-full bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.2 text-[9px] font-bold text-[#16A36A] dark:bg-[#064E3B] dark:border-[#047857] dark:text-[#34D399]">
                      LIVE
                    </span>
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
                      <b className={stream.isRecording ? 'text-[#E11D72] dark:text-[#F472B6]' : 'text-[#6F6078] dark:text-[#8E78A6]'}>
                        {stream.isRecording ? 'REC' : 'OFF'}
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
            <h2 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Latest Recordings</h2>
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
                    <p className="truncate font-semibold text-[#1B1024] text-[12px] dark:text-white" title={recording.file_name}>
                      {recording.file_name}
                    </p>
                    <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                      {recording.app}/{recording.stream} • {formatBytes(Number(recording.size || 0))}
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
              <video
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
                src={`/recording-preview/${previewRecording.id}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KashtrixDashboard;
