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
  Tv
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

const formatDataSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
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
  const [videoDevices, setVideoDevices] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [videoDevice, setVideoDevice] = useState('');
  const [audioDevice, setAudioDevice] = useState('');
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [durationClock, setDurationClock] = useState(Date.now());
  const itemsPerPage = 8;

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        fetchIngestHistory(),
        fetchRecordings(),
        fetchIngestStreams(),
      ]);
    } catch (e) {
      console.error(e);
    }
  }, [fetchIngestHistory, fetchRecordings, fetchIngestStreams]);

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
      toast.error(error.message);
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
      {/* 1. Header Strip */}
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Row */}
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
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">RTMP Port</span>
          <p className="font-mono text-[20px] font-bold text-[#4A1B7A]">{settings.rtmpPort || 1935}</p>
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

      {/* 3. Live Active Streams Section */}
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
          /* Compact Empty State (max 220px height) */
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

      {/* 4. Stream History Table */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#1B1024]">Stream History</h2>
            <p className="text-[11px] text-[#6F6078]">Log of previous ingest sessions</p>
          </div>

          <div className="relative">
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search history..."
              className="h-8 w-48 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
            />
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
          </div>
        </div>

        <div className="overflow-x-auto">
          {paginatedHistory.length > 0 ? (
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                  <th className="px-4 py-3">Stream Key</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Ended</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Peak Bitrate</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0]">
                {paginatedHistory.map((item: any, idx: number) => (
                  <tr key={item.id || idx} className="transition-colors hover:bg-[#F4EEFF]/50">
                    <td className="px-4 py-3 font-semibold text-[#1B1024]">{item.app}/{item.stream}</td>
                    <td className="px-4 py-3">
                      <ProtocolBadge protocol={item.protocol || 'RTMP'} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078]">
                      {item.startTime ? new Date(item.startTime).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078]">
                      {item.endTime ? new Date(item.endTime).toLocaleString() : 'Active'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078]">
                      {formatDuration(item.startTime, item.endTime)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078]">
                      {formatBitrate(item.peakBitrate || item.bitrate || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.endTime ? 'bg-[#F8F7FA] text-[#6F6078]' : 'bg-[#F0FDF4] text-[#16A36A]'
                      }`}>
                        {item.endTime ? 'Finished' : 'Live'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-[#6F6078] text-[12px]">
              No previous stream sessions logged.
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E8DFF0] bg-[#F8F7FA] px-4 py-2 text-[11px]">
            <span className="text-[#6F6078]">
              Page {historyPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                className="rounded border border-[#E8DFF0] bg-white p-1 text-[#6F6078] disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={historyPage >= totalPages}
                onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                className="rounded border border-[#E8DFF0] bg-white p-1 text-[#6F6078] disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

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
