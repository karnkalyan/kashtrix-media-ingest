import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiActivity, FiArchive, FiHardDrive, FiPlay, FiRadio, FiRefreshCw, FiServer, FiUsers, FiVideo, FiX } from 'react-icons/fi';
import Button from './ui/Button';
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
  streams: {}, recentSessions: [], recentRecordings: [],
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

const KashtrixDashboard: React.FC<{ onNavigate?: (tab: string) => void; mediaPort?: number }> = ({ onNavigate, mediaPort = 8080 }) => {
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
        // Backward-compatible real-data fallback while an older backend process is being restarted.
        const [stateResponse, streamsResponse, recordingsResponse, historyResponse] = await Promise.all([
          fetch('/api/state', { headers }), fetch('/api/ingest/streams', { headers }),
          fetch('/api/ingest/recordings', { headers }), fetch('/api/ingest/history', { headers }),
        ]);
        if (![stateResponse, streamsResponse, recordingsResponse, historyResponse].every(item => item.ok)) throw new Error('Main API is not ready. Restart npm run dev.');
        const [state, streamData, recordingData, historyData] = await Promise.all([stateResponse.json(), streamsResponse.json(), recordingsResponse.json(), historyResponse.json()]);
        const recordings = recordingData.recordings || [];
        const sessions = historyData.history || [];
        const streams = streamData.streams || {};
        const streamValues = Object.values(streams) as any[];
        const fallbackOverview = {
          generatedAt: new Date().toISOString(), streams, recentSessions: sessions.slice(0, 8), recentRecordings: recordings.slice(0, 8),
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
        setError(cause.message || 'Unable to load dashboard');
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
        commit(current => ({ ...current, generatedAt: new Date().toISOString(), streams, totals: { ...current.totals, activeIngests: streamValues.length, activeRecordings: streamValues.filter(stream => stream?.isRecording).length, viewers: streamValues.reduce((total, stream) => total + Number(stream?.viewers || 0), 0) } }));
      } else if (message.type === 'recordings_list') {
        const recordings = Array.isArray(message.payload) ? message.payload : [];
        commit(current => ({ ...current, generatedAt: new Date().toISOString(), recentRecordings: recordings.slice(0, 8), totals: { ...current.totals, recordings: recordings.length, activeRecordings: recordings.filter(recording => recording?.is_active).length, recordingBytes: recordings.reduce((total, recording) => total + Number(recording?.size || 0), 0) } }));
      } else if (message.type === 'ingest_history') {
        const sessions = Array.isArray(message.payload) ? message.payload : [];
        commit(current => ({ ...current, generatedAt: new Date().toISOString(), recentSessions: sessions.slice(0, 8) }));
      }
    }, setRealtimeConnected);
  }, []);

  const cards = useMemo(() => [
    { label: 'Configured channels', value: overview.totals.channels, detail: `${overview.totals.runningChannels} running`, icon: FiVideo, color: 'text-violet-600 bg-violet-50' },
    { label: 'Live ingests', value: overview.totals.activeIngests, detail: 'RTMP inputs online', icon: FiRadio, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Recording now', value: overview.totals.activeRecordings, detail: `${overview.totals.recordings} archived files`, icon: FiActivity, color: 'text-rose-600 bg-rose-50' },
    { label: 'Recording storage', value: formatBytes(overview.totals.recordingBytes), detail: 'Real files on disk', icon: FiHardDrive, color: 'text-sky-600 bg-sky-50' },
    { label: 'Peak viewers', value: overview.totals.viewers, detail: `${overview.totals.sessions} ingest sessions`, icon: FiUsers, color: 'text-amber-600 bg-amber-50' },
  ], [overview]);

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">StreamOps Overview</h2>
          <p className="text-xs text-[var(--text-secondary)]">Live API data from this ingest and transcode server.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => fetchOverview(true)} loading={refreshing}><FiRefreshCw size={14} /> Refresh</Button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="metric-grid">
        {cards.map(({ label, value, detail, icon: Icon, color }) => (
          <div key={label} className="metric-cell">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="metric-cell__label">{label}</p><p className="metric-cell__value truncate">{value}</p></div>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${color}`}><Icon size={15} /></span>
            </div>
            <p className="metric-cell__detail">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.7fr)]">
        <section className="data-panel">
          <div className="panel-header flex-col !items-stretch min-[420px]:flex-row min-[420px]:!items-center">
            <div><h3 className="font-bold text-[var(--text-primary)]">Live television inputs</h3><p className="text-xs text-[var(--text-muted)]">Incoming streams reported by the ingest server</p></div>
            <button onClick={() => onNavigate?.('ingest')} className="text-left text-xs font-bold text-[var(--primary)] min-[420px]:text-right">Open recording control →</button>
          </div>
          {Object.keys(overview.streams).length === 0 ? (
            <div className="compact-empty">No television input is live right now.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(overview.streams).map(([key, stream]: [string, any]) => (
                <div key={key} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3"><p className="truncate font-bold text-[var(--text-primary)]">{stream.name || key}</p><span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">LIVE</span></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><span><b className="block text-sm">{stream.incoming_kbps || 0}</b>Kbps in</span><span><b className="block text-sm">{stream.viewers || 0}</b>viewers</span><span><b className={`block text-sm ${stream.isRecording ? 'text-rose-600' : ''}`}>{stream.isRecording ? 'REC' : 'OFF'}</b>recording</span></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="data-panel">
          <div className="panel-header"><div className="flex items-center gap-2"><FiArchive className="text-[var(--primary)]" /><h3 className="panel-title">Latest recordings</h3></div></div>
          <div className="divide-y divide-[var(--border)]">
            {overview.recentRecordings.length === 0 && <p className="compact-empty">No recordings yet.</p>}
            {overview.recentRecordings.slice(0, 6).map(recording => (
              <div key={recording.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--border)] pb-3 last:border-0">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{recording.file_name}</p><p className="text-[10px] text-[var(--text-muted)]">{recording.app}/{recording.stream} · {(recording.format || 'file').toUpperCase()}</p></div>
                <div className="flex shrink-0 items-center gap-2"><span className="text-xs font-bold text-[var(--text-secondary)]">{formatBytes(Number(recording.size || 0))}</span><button onClick={() => setPreviewRecording(recording)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary-200)] hover:text-[var(--primary)]" title="Preview recording"><FiPlay size={13} /></button></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[10px] text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2"><FiServer /><span className={`h-2 w-2 rounded-full ${realtimeConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />{realtimeConnected ? 'Realtime connected' : 'Realtime reconnecting'}</span><span>Last update: {overview.generatedAt ? new Date(overview.generatedAt).toLocaleString() : 'waiting…'}</span>
      </div>

      {previewRecording && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewRecording(null); }}><div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"><div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{previewRecording.file_name}</h3><p className="text-[11px] text-slate-400">Recording preview</p></div><button onClick={() => setPreviewRecording(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"><FiX size={18} /></button></div><div className="aspect-video bg-black"><video key={previewRecording.id} controls autoPlay playsInline className="h-full w-full object-contain" src={`/recording-preview/${previewRecording.id}`} /></div></div></div>}
    </div>
  );
};

export default KashtrixDashboard;
