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
  ArrowUpRight
} from 'lucide-react';
import { AppSettings, IngestRecordingOptions, TranscodingProfile } from '../types';
import toast from 'react-hot-toast';
import ProfessionalRecordingControl from './ProfessionalRecordingControl';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import DetailDrawer from './ui/DetailDrawer';
import MediaPreview from './ui/MediaPreview';
import StatusBadge from './ui/StatusBadge';
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
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mbps`;
  return `${kbps || 0} Kbps`;
};

const formatDuration = (startTime: string, endTime?: string, currentTime = Date.now()) => {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : currentTime;
  const diff = Math.floor((end - start) / 1000);

  if (diff <= 0) return endTime ? '0s' : 'Interrupted';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
  mode = 'live',
}) => {
  const [selectedStreamKey, setSelectedStreamKey] = useState<string>('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectedStream, setInspectedStream] = useState<any>(null);
  const [recordingStatuses, setRecordingStatuses] = useState<Record<string, boolean>>({});
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  // SRT Listener & Relay Modals
  const [srtModalOpen, setSrtModalOpen] = useState(false);
  const [srtStreamName, setSrtStreamName] = useState('srt-feed');
  const [srtPort, setSrtPort] = useState('8890');

  const [relayModalOpen, setRelayModalOpen] = useState(false);
  const [relayStreamPath, setRelayStreamPath] = useState('/live/main-feed');
  const [relayDestinationUrl, setRelayDestinationUrl] = useState('');
  const [processes, setProcesses] = useState<any[]>([]);

  const itemsPerPage = 8;

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

  const fetchProcesses = async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ingest/processes', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setProcesses(data.processes || []);
    } catch (e) {
      // Ignore process fetch errors
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const localStreams = ingestStreams || {};
  const history = ingestHistory || [];
  const activeStreamKeys = Object.keys(localStreams);
  const totalBitrateKbps = Object.values(localStreams).reduce((sum: number, s: any) => sum + (s.bitrate || 0), 0);

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

  const openInspector = (streamKey: string, streamData: any) => {
    setSelectedStreamKey(streamKey);
    setInspectedStream(streamData);
    setInspectorOpen(true);
  };

  const filteredHistory = history.filter((h: any) =>
    (h.stream || '').toLowerCase().includes(historySearch.toLowerCase()) ||
    (h.app || '').toLowerCase().includes(historySearch.toLowerCase())
  );

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);

  const rtmpEndpointUrl = `rtmp://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${settings.rtmpPort || 1935}/live/{stream_key}`;

  return (
    <div className="ingest-workspace page-stack space-y-4">
      {/* Header Strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[18px] font-bold text-[#1B1024]">
              {mode === 'recording' ? 'Ingest & Device Capture' : 'Live Server'}
            </h1>
            <span className="rounded-full bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A36A]">
              {activeStreamKeys.length} Live Stream{activeStreamKeys.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#6F6078]">
            {mode === 'recording'
              ? 'Television recording control, hardware encoder settings, and live ingest management'
              : 'Incoming RTMP, SRT and live stream monitoring'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSrtModalOpen(true)}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF]"
          >
            <Activity size={13} className="text-[#16A36A]" /> Add SRT Listener
          </button>
          <button
            type="button"
            onClick={() => setRelayModalOpen(true)}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF]"
          >
            <ArrowUpRight size={13} className="text-[#2563EB]" /> Add RTMP Relay
          </button>
          <button
            type="button"
            onClick={fetchData}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Top Summary KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Active Streams</span>
          <p className="font-mono text-[20px] font-bold text-[#1B1024]">{activeStreamKeys.length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Incoming Bitrate</span>
          <p className="font-mono text-[20px] font-bold text-[#2563EB]">{formatBitrate(totalBitrateKbps)}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Recordings</span>
          <p className="font-mono text-[20px] font-bold text-[#E11D72]">{Object.keys(activeRecordingKeys).length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Background Jobs</span>
          <p className="font-mono text-[20px] font-bold text-[#4A1B7A]">{processes.length}</p>
        </div>
      </div>

      {/* Mode === 'recording' Professional Ingest & Device Capture Controls */}
      {mode === 'recording' && (
        <ProfessionalRecordingControl
          settings={settings}
          profiles={profiles}
          activeStreams={localStreams}
          fetchData={fetchData}
          startRecording={startRecording}
          stopRecording={stopRecording}
        />
      )}

      {/* Live Active Streams Section */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#1B1024]">Active Ingest Streams</h2>
            <p className="text-[11px] text-[#6F6078]">Currently publishing RTMP and SRT live streams</p>
          </div>

          <CodeField value={rtmpEndpointUrl} label="" className="max-w-xs" />
        </div>

        {activeStreamKeys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                  <th className="px-4 py-3">Stream Name</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Resolution / FPS</th>
                  <th className="px-4 py-3">Bitrate</th>
                  <th className="px-4 py-3">Audio</th>
                  <th className="px-4 py-3">Recording</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0]">
                {Object.entries(localStreams).map(([key, stream]: [string, any]) => {
                  const isRec = !!(recordingStatuses[key] || activeRecordingKeys[key]);

                  return (
                    <tr key={key} className="transition-colors hover:bg-[#F4EEFF]/50">
                      <td className="px-4 py-3 font-semibold text-[#1B1024]">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#16A36A] animate-pulse" />
                          <span>{stream.name || key}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ProtocolBadge protocol={stream.protocol || 'RTMP'} />
                      </td>
                      <td className="px-4 py-3 font-mono text-[#6F6078]">
                        {stream.resolution || '1920x1080'} @ {stream.fps || 30}fps
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-[#2563EB]">
                        {formatBitrate(stream.bitrate || 0)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#6F6078]">
                        {stream.audioCodec || 'AAC'} ({stream.audioBitrate || 128}k)
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isRec ? 'bg-[#FCE7F3] text-[#E11D72]' : 'bg-[#F8F7FA] text-[#6F6078]'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isRec ? 'bg-[#E11D72] animate-pulse' : 'bg-[#8E8895]'}`} />
                          {isRec ? 'RECORDING' : 'Idle'}
                        </span>
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
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
              <span className="text-[10px] font-semibold uppercase text-[#6F6078]">Resolution</span>
              <p className="font-mono font-bold text-[#1B1024]">{inspectedStream?.resolution || '1920x1080'}</p>
            </div>
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
              <span className="text-[10px] font-semibold uppercase text-[#6F6078]">Bitrate</span>
              <p className="font-mono font-bold text-[#2563EB]">{formatBitrate(inspectedStream?.bitrate || 0)}</p>
            </div>
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
              <span className="text-[10px] font-semibold uppercase text-[#6F6078]">FPS</span>
              <p className="font-mono font-bold text-[#1B1024]">{inspectedStream?.fps || 30}</p>
            </div>
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
              <span className="text-[10px] font-semibold uppercase text-[#6F6078]">Audio Codec</span>
              <p className="font-mono font-bold text-[#1B1024]">{inspectedStream?.audioCodec || 'AAC'}</p>
            </div>
          </div>

          <CodeField
            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/live/${selectedStreamKey.split('/')[1] || selectedStreamKey}/index.m3u8`}
            label="HLS Output Playback URL"
          />
        </div>
      </DetailDrawer>
    </div>
  );
};

export default IngestServerView;
