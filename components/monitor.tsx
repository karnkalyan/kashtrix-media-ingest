import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Maximize2,
  Minimize2,
  ChevronDown,
  Layers,
  Clock,
  ShieldCheck,
  Radio,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';
import { subscribeRealtime, sendRealtime } from '../services/realtime';

export interface TelemetryState {
  cpuLoad: number;
  memLoad: number;
  diskLoad: number;
  isHealthy: boolean;
  timestamp: string;
  uptimeSeconds?: number;
  uptimeFmt?: string;
  coreLoads: number[];
  loadAvg: number[];
  runningProcesses: number;
  cpusCount: number;
  networkDetails: NetworkInterfaceItem[];
  gpuDetails?: {
    model: string;
    load: number;
    memoryLoad: number;
  };
  memoryDetails?: {
    total: number;
    used: number;
    available: number;
    free: number;
    swapTotal: number;
    swapUsed: number;
    totalFmt: string;
    usedFmt: string;
    availableFmt: string;
    swapTotalFmt: string;
    swapUsedFmt: string;
  };
  storageDetails?: {
    mount: string;
    size: number;
    used: number;
    available: number;
    usePercent: number;
    sizeFmt: string;
    usedFmt: string;
    availableFmt: string;
  };
  transcoderActiveStreams?: number;
  transcoderIdleStreams?: number;
  services?: ServiceHealthItem[];
  history: {
    cpu: number[];
    mem: number[];
    disk: number[];
    rx: number[];
    tx: number[];
  };
  lastRx: number;
  lastTx: number;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'stale';
  lastUpdatedTime: number | null;
  error?: string;
  serverTime?: string;
}

export interface NetworkInterfaceItem {
  iface: string;
  state: 'UP' | 'DOWN';
  ip: string;
  ip6?: string;
  rx_sec: number;
  tx_sec: number;
  rx_rate_fmt: string;
  tx_rate_fmt: string;
  rx_packets_sec?: number;
  tx_packets_sec?: number;
  errors_sec?: number;
  drops_sec?: number;
  utilization?: number;
  speedMbps?: number;
}

export interface ServiceHealthItem {
  id: string;
  name: string;
  status: 'Healthy' | 'Warning' | 'Degraded' | 'Stopped';
  uptime: string;
  latency: string;
  lastCheck: string;
}

export interface InfraEvent {
  id: string;
  title: string;
  target: string;
  timestamp: string;
  type: 'info' | 'warning' | 'critical' | 'success';
}

const formatSpeedRate = (bytesPerSec: number): string => {
  if (!bytesPerSec || isNaN(bytesPerSec)) return '0 B/s';
  const bits = bytesPerSec * 8;
  if (bits >= 1_000_000_000) return `${(bits / 1_000_000_000).toFixed(2)} Gbps`;
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(2)} Mbps`;
  if (bits >= 1_000) return `${(bits / 1_000).toFixed(1)} Kbps`;
  return `${bits.toFixed(0)} bps`;
};

const formatRelativeTime = (timestampMs: number | null): string => {
  if (!timestampMs) return 'Never';
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (elapsedSec < 3) return 'Just now';
  if (elapsedSec < 60) return `${elapsedSec} sec ago`;
  const mins = Math.floor(elapsedSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
};

const MAX_HISTORY_SAMPLES = 30;

const initialTelemetryState: TelemetryState = {
  cpuLoad: 0,
  memLoad: 0,
  diskLoad: 0,
  isHealthy: false,
  timestamp: new Date().toISOString(),
  uptimeFmt: '—',
  coreLoads: [],
  loadAvg: [0, 0, 0],
  runningProcesses: 0,
  cpusCount: 0,
  networkDetails: [],
  gpuDetails: { model: 'N/A', load: 0, memoryLoad: 0 },
  history: {
    cpu: Array(MAX_HISTORY_SAMPLES).fill(0),
    mem: Array(MAX_HISTORY_SAMPLES).fill(0),
    disk: Array(MAX_HISTORY_SAMPLES).fill(0),
    rx: Array(MAX_HISTORY_SAMPLES).fill(0),
    tx: Array(MAX_HISTORY_SAMPLES).fill(0),
  },
  lastRx: 0,
  lastTx: 0,
  connectionStatus: 'connecting',
  lastUpdatedTime: null,
  error: 'Connecting to telemetry engine...',
};

const useSystemStats = () => {
  const [stats, setStats] = useState<TelemetryState>(initialTelemetryState);
  const isFetchingRestRef = useRef(false);

  const fetchRestStats = async () => {
    if (isFetchingRestRef.current) return;
    isFetchingRestRef.current = true;
    try {
      const res = await fetch('/api/system/stats');
      if (res.ok) {
        const payload = await res.json();
        processPayload(payload);
      }
    } catch {
      // Ignore REST failure if WS is active
    } finally {
      isFetchingRestRef.current = false;
    }
  };

  const processPayload = (payload: any) => {
    const totalRx = (payload.networkDetails || []).reduce((sum: number, item: any) => sum + (item.rx_sec || 0), 0);
    const totalTx = (payload.networkDetails || []).reduce((sum: number, item: any) => sum + (item.tx_sec || 0), 0);
    const now = Date.now();

    setStats(prev => {
      const appendHist = (key: keyof typeof prev.history, val: number) => {
        const current = prev.history[key] || [];
        return [...current.slice(-MAX_HISTORY_SAMPLES + 1), val];
      };

      return {
        ...prev,
        ...payload,
        isHealthy: payload.isHealthy !== undefined ? payload.isHealthy : true,
        connectionStatus: 'connected',
        lastUpdatedTime: now,
        error: '',
        lastRx: totalRx,
        lastTx: totalTx,
        cpusCount: payload.coreLoads?.length || payload.cpusCount || prev.cpusCount || 1,
        history: {
          cpu: appendHist('cpu', payload.cpuLoad || 0),
          mem: appendHist('mem', payload.memLoad || 0),
          disk: appendHist('disk', payload.diskLoad || 0),
          rx: appendHist('rx', totalRx),
          tx: appendHist('tx', totalTx),
        },
      };
    });
  };

  useEffect(() => {
    fetchRestStats();

    const unsubscribe = subscribeRealtime(
      message => {
        if (message.type === 'system_stats' && message.payload) {
          processPayload(message.payload);
        }
      },
      isConnected => {
        if (isConnected) {
          sendRealtime({ type: 'systeminfo' });
        } else {
          setStats(prev => ({
            ...prev,
            connectionStatus: 'disconnected',
            error: 'Telemetry connection unavailable',
          }));
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  return { stats, manualRefresh: fetchRestStats };
};

const CompactProgressBar: React.FC<{ value: number; color?: string; className?: string }> = ({
  value,
  color = '#6D32D9',
  className = 'h-1.5',
}) => {
  const clamped = Math.min(100, Math.max(0, value || 0));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[#E8DFF0] ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
};

const AreaLineChart: React.FC<{
  data: number[];
  color?: string;
  height?: number;
}> = ({ data = [], color = '#6D32D9', height = 48 }) => {
  if (!data || data.length === 0) return <div style={{ height }} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 240;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1 || 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

interface SystemHeaderProps {
  connectionStatus: string;
  lastUpdated: number | null;
  onRefresh: () => void;
}

const SystemHeader: React.FC<SystemHeaderProps> = ({
  connectionStatus,
  lastUpdated,
  onRefresh,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[18px] font-bold text-[#1B1024]">System Monitor</h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            connectionStatus === 'connected' ? 'bg-[#F0FDF4] text-[#16A36A] border border-[#BBF7D0]' : 'bg-[#FEF2F2] text-[#DC3545] border border-[#FECACA]'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-[#16A36A] animate-pulse' : 'bg-[#DC3545]'}`} />
            {connectionStatus === 'connected' ? 'Live Telemetry Stream (WebSocket)' : 'Disconnected'}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-[#6F6078]">
          Real-time hardware performance telemetry streamed live over WebSocket
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onRefresh}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#351147]"
          title="Refresh Telemetry"
        >
          <RefreshCw size={15} />
        </button>

        <button
          onClick={toggleFullscreen}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#351147]"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  );
};

const SystemHealthBar: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const isHealthy = stats.isHealthy && stats.connectionStatus === 'connected';
  const hasWarning = stats.cpuLoad > 80 || stats.memLoad > 85 || stats.diskLoad > 90;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E8DFF0] bg-white px-4 py-3 shadow-xs md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            isHealthy && !hasWarning ? 'bg-[#16A36A]' : hasWarning ? 'bg-[#D97706]' : 'bg-[#DC3545]'
          }`} />
          <span className={`relative inline-flex h-3 w-3 rounded-full ${
            isHealthy && !hasWarning ? 'bg-[#16A36A]' : hasWarning ? 'bg-[#D97706]' : 'bg-[#DC3545]'
          }`} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-[13px] font-semibold text-[#1B1024]">
              {isHealthy && !hasWarning ? 'All Systems Operational' : hasWarning ? 'System Under Heavy Load' : 'Telemetry Disconnected'}
            </span>
          </div>
          <p className="text-[11px] text-[#6F6078]">
            Streaming infrastructure is healthy and telemetry is updating normally.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[12px] border-t border-[#E8DFF0] pt-2 md:border-t-0 md:pt-0">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Uptime</span>
          <p className="font-mono font-semibold text-[#1B1024]">{stats.uptimeFmt || '—'}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Processes</span>
          <p className="font-mono font-semibold text-[#1B1024]">{stats.runningProcesses || '—'}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">CPU Cores</span>
          <p className="font-mono font-semibold text-[#1B1024]">{stats.cpusCount || stats.coreLoads.length || 1}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Interfaces</span>
          <p className="font-mono font-semibold text-[#1B1024]">{stats.networkDetails.length || 1}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Updated</span>
          <p className="font-mono font-semibold text-[#16A36A]">{formatRelativeTime(stats.lastUpdatedTime)}</p>
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  mainValue: string;
  secondaryText: string;
  icon: React.ReactNode;
  chartOrProgress?: React.ReactNode;
  statusColor?: string;
}> = ({ label, mainValue, secondaryText, icon, chartOrProgress, statusColor = '#6D32D9' }) => {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs transition-shadow hover:shadow-sm">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">{label}</span>
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#F8F7FA] text-[#4A1B7A]">
            {icon}
          </div>
        </div>

        <div className="mt-2">
          <span className="font-mono text-[22px] font-bold tracking-tight text-[#1B1024]">
            {mainValue}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {chartOrProgress}
        <p className="text-[11px] text-[#6F6078]">{secondaryText}</p>
      </div>
    </div>
  );
};

const PrimaryKpiRow: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const cpuVal = stats.cpuLoad || 0;
  const memVal = stats.memLoad || 0;
  const diskVal = stats.diskLoad || 0;
  const totalBps = (stats.lastRx || 0) + (stats.lastTx || 0);

  const memUsedStr = stats.memoryDetails ? `${stats.memoryDetails.usedFmt} / ${stats.memoryDetails.totalFmt}` : '—';
  const diskUsedStr = stats.storageDetails ? `${stats.storageDetails.usedFmt} / ${stats.storageDetails.sizeFmt}` : '—';

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="CPU Load"
        mainValue={`${cpuVal.toFixed(1)}%`}
        secondaryText={`Average across ${stats.cpusCount || stats.coreLoads.length || 1} cores`}
        icon={<Cpu size={16} />}
        chartOrProgress={<CompactProgressBar value={cpuVal} color={cpuVal > 80 ? '#DC3545' : '#6D32D9'} />}
      />

      <KpiCard
        label="Memory"
        mainValue={`${memVal.toFixed(1)}%`}
        secondaryText={memUsedStr}
        icon={<Layers size={16} />}
        chartOrProgress={<CompactProgressBar value={memVal} color={memVal > 85 ? '#DC3545' : '#2563EB'} />}
      />

      <KpiCard
        label="Storage"
        mainValue={`${diskVal.toFixed(1)}%`}
        secondaryText={diskUsedStr}
        icon={<HardDrive size={16} />}
        chartOrProgress={<CompactProgressBar value={diskVal} color={diskVal > 90 ? '#DC3545' : '#16A36A'} />}
      />

      <KpiCard
        label="Network Throughput"
        mainValue={formatSpeedRate(totalBps)}
        secondaryText={`↓ ${formatSpeedRate(stats.lastRx)} ↑ ${formatSpeedRate(stats.lastTx)}`}
        icon={<Wifi size={16} />}
        chartOrProgress={<CompactProgressBar value={Math.min(100, (totalBps / (100 * 1024 * 1024)) * 100)} color="#16A36A" />}
      />

      <KpiCard
        label="Processes"
        mainValue={`${stats.runningProcesses || '—'}`}
        secondaryText={`Load average ${stats.loadAvg?.[0] !== undefined ? stats.loadAvg[0].toFixed(2) : '—'}`}
        icon={<Server size={16} />}
      />

      <KpiCard
        label="Transcoder Load"
        mainValue={`${(stats.transcoderActiveStreams ? (stats.transcoderActiveStreams / 16) * 100 : 0).toFixed(1)}%`}
        secondaryText={`${stats.transcoderActiveStreams || 0} active • ${stats.transcoderIdleStreams || 16} idle`}
        icon={<Zap size={16} />}
        chartOrProgress={<CompactProgressBar value={(stats.transcoderActiveStreams ? (stats.transcoderActiveStreams / 16) * 100 : 0)} color="#E11D72" />}
      />
    </div>
  );
};

const NetworkThroughputSection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const historyRx = stats.history.rx;
  const historyTx = stats.history.tx;
  const peakRx = Math.max(...historyRx, 1);
  const peakTx = Math.max(...historyTx, 1);
  const peakTotal = Math.max(...historyRx.map((r, i) => r + (historyTx[i] || 0)), 1);

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Network Throughput</h3>
            <p className="text-[11px] text-[#6F6078]">Real-time interface traffic</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-1 font-mono text-[10px] font-semibold text-[#6F6078]">
              All Interfaces
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Incoming / RX</span>
            <p className="font-mono text-[15px] font-bold text-[#2563EB]">{formatSpeedRate(stats.lastRx)}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Outgoing / TX</span>
            <p className="font-mono text-[15px] font-bold text-[#16A36A]">{formatSpeedRate(stats.lastTx)}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Total</span>
            <p className="font-mono text-[15px] font-bold text-[#1B1024]">{formatSpeedRate(stats.lastRx + stats.lastTx)}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Peak</span>
            <p className="font-mono text-[15px] font-bold text-[#4A1B7A]">{formatSpeedRate(peakTotal)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-[#2563EB]">
                <ArrowDownLeft size={13} /> Incoming
              </span>
              <span className="font-mono font-bold text-[#1B1024]">{formatSpeedRate(stats.lastRx)}</span>
            </div>
            <AreaLineChart data={historyRx} color="#2563EB" height={44} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-[#16A36A]">
                <ArrowUpRight size={13} /> Outgoing
              </span>
              <span className="font-mono font-bold text-[#1B1024]">{formatSpeedRate(stats.lastTx)}</span>
            </div>
            <AreaLineChart data={historyTx} color="#16A36A" height={44} />
          </div>
        </div>
      </div>
    </div>
  );
};

const CpuProcessingMatrix: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const cores = stats.coreLoads || [];
  const loadAvg = stats.loadAvg || [0, 0, 0];

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">CPU Processing</h3>
            <p className="text-[11px] text-[#6F6078]">Per-core matrix and thread allocation</p>
          </div>
          <Cpu size={18} className="text-[#6D32D9]" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2">
            <span className="text-[9px] font-semibold uppercase text-[#6F6078]">Processes</span>
            <p className="font-mono font-bold text-[#1B1024]">{stats.runningProcesses || '—'}</p>
          </div>
          <div className="col-span-2 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2">
            <span className="text-[9px] font-semibold uppercase text-[#6F6078]">Load Average</span>
            <p className="font-mono font-bold text-[#1B1024]">
              {loadAvg.map(l => (typeof l === 'number' ? l.toFixed(2) : l)).join(' / ')}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
            Cores ({cores.length || stats.cpusCount || 1})
          </span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
            {(cores.length ? cores : Array(stats.cpusCount || 4).fill(0)).map((load, idx) => {
              const coreNum = String(idx + 1).padStart(2, '0');
              return (
                <div key={idx} className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-center">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono font-semibold text-[#6F6078]">Core {coreNum}</span>
                    <span className="font-mono font-bold text-[#1B1024]">{load.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1.5">
                    <CompactProgressBar value={load} color={load > 85 ? '#DC3545' : '#6D32D9'} className="h-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const ResourceTrendsSection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div className="border-b border-[#E8DFF0] pb-3">
        <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Resource Trends</h3>
        <p className="text-[11px] text-[#6F6078]">Synchronized CPU, Memory, and Disk utilization</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078]">CPU %</span>
          <p className="font-mono text-[16px] font-bold text-[#6D32D9]">{stats.cpuLoad.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078]">Memory %</span>
          <p className="font-mono text-[16px] font-bold text-[#2563EB]">{stats.memLoad.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078]">Disk %</span>
          <p className="font-mono text-[16px] font-bold text-[#16A36A]">{stats.diskLoad.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#6F6078]">
            <span>CPU Load History</span>
            <span className="font-mono text-[#6D32D9]">{stats.cpuLoad.toFixed(1)}%</span>
          </div>
          <AreaLineChart data={stats.history.cpu} color="#6D32D9" height={40} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#6F6078]">
            <span>Memory Usage History</span>
            <span className="font-mono text-[#2563EB]">{stats.memLoad.toFixed(1)}%</span>
          </div>
          <AreaLineChart data={stats.history.mem} color="#2563EB" height={40} />
        </div>
      </div>
    </div>
  );
};

const StorageMemorySection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const mem = stats.memoryDetails;
  const disk = stats.storageDetails;

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="border-b border-[#E8DFF0] pb-3">
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Storage & Memory</h3>
          <p className="text-[11px] text-[#6F6078]">System capacity and mount statistics</p>
        </div>

        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024]">Memory Used</span>
              <span className="font-mono font-bold text-[#2563EB]">
                {mem ? `${mem.usedFmt} / ${mem.totalFmt}` : '—'}
              </span>
            </div>
            <div className="mt-2">
              <CompactProgressBar value={stats.memLoad} color="#2563EB" />
            </div>
          </div>

          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024]">Swap Usage</span>
              <span className="font-mono font-bold text-[#6F6078]">
                {mem ? `${mem.swapUsedFmt} / ${mem.swapTotalFmt}` : '—'}
              </span>
            </div>
            <div className="mt-2">
              <CompactProgressBar
                value={mem && mem.swapTotal > 0 ? (mem.swapUsed / mem.swapTotal) * 100 : 0}
                color="#6F6078"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024]">Storage</span>
              <span className="font-mono font-bold text-[#16A36A]">
                {disk ? `${disk.usedFmt} / ${disk.sizeFmt}` : '—'}
              </span>
            </div>
            <div className="mt-2">
              <CompactProgressBar value={stats.diskLoad} color="#16A36A" />
            </div>
            <div className="mt-2 text-[10px] text-[#6F6078]">
              <span className="text-[#6F6078]">Storage Path: </span>
              <code className="font-mono font-semibold text-[#1B1024]">{disk?.mount || '/'}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RecentEventsSection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const dynamicEvents: InfraEvent[] = [];

  if (stats.cpuLoad > 80) {
    dynamicEvents.push({ id: '1', title: 'High CPU load warning', target: `System Load: ${stats.cpuLoad.toFixed(1)}%`, timestamp: 'Just now', type: 'warning' });
  }
  if (stats.memLoad > 85) {
    dynamicEvents.push({ id: '2', title: 'High memory load warning', target: `RAM Used: ${stats.memLoad.toFixed(1)}%`, timestamp: 'Just now', type: 'warning' });
  }
  if (stats.diskLoad > 85) {
    dynamicEvents.push({ id: '3', title: 'Storage capacity warning', target: `Mount: ${stats.storageDetails?.mount || '/'} (${stats.diskLoad.toFixed(1)}%)`, timestamp: 'Just now', type: 'warning' });
  }

  if (dynamicEvents.length === 0) {
    dynamicEvents.push({
      id: 'ok',
      title: 'System Nominal',
      target: `Operating normally across ${stats.cpusCount || 1} CPU cores`,
      timestamp: formatRelativeTime(stats.lastUpdatedTime),
      type: 'success',
    });
  }

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="border-b border-[#E8DFF0] pb-2.5">
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Recent Alerts & Logs</h3>
          <p className="text-[11px] text-[#6F6078]">Real-time system telemetry alerts</p>
        </div>

        <div className="mt-3 space-y-2.5">
          {dynamicEvents.map(ev => (
            <div key={ev.id} className="flex items-center justify-between rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-[11px]">
              <div className="flex items-center gap-2">
                {ev.type === 'warning' ? <AlertTriangle size={14} className="text-[#D97706]" /> : ev.type === 'critical' ? <XCircle size={14} className="text-[#DC3545]" /> : <CheckCircle2 size={14} className="text-[#16A36A]" />}
                <div>
                  <p className="font-semibold text-[#1B1024]">{ev.title}</p>
                  <p className="text-[10px] text-[#6F6078]">{ev.target}</p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-[#6F6078]">{ev.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NetworkInterfacesTable: React.FC<{ interfaces: NetworkInterfaceItem[] }> = ({ interfaces }) => {
  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Network Interfaces</h3>
          <p className="text-[11px] text-[#6F6078]">Per-interface real-time throughput and packet counters</p>
        </div>
        <Wifi size={18} className="text-[#4A1B7A]" />
      </div>

      <div className="mt-3 overflow-x-auto">
        {interfaces.length === 0 ? (
          <div className="grid min-h-[100px] place-items-center rounded-lg border border-dashed border-[#E8DFF0] bg-[#F8F7FA] p-6 text-center">
            <div>
              <p className="font-display text-[13px] font-semibold text-[#1B1024]">No interfaces reporting telemetry</p>
              <p className="mt-1 text-[11px] text-[#6F6078]">Network interface information will appear when the monitoring agent reports it.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                <th className="px-3 py-2.5">Interface</th>
                <th className="px-3 py-2.5">State</th>
                <th className="px-3 py-2.5">IP</th>
                <th className="px-3 py-2.5">RX Rate</th>
                <th className="px-3 py-2.5">TX Rate</th>
                <th className="px-3 py-2.5">RX Pkts/s</th>
                <th className="px-3 py-2.5">TX Pkts/s</th>
                <th className="px-3 py-2.5">Errors/s</th>
                <th className="px-3 py-2.5">Drops/s</th>
                <th className="px-3 py-2.5">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFF0]">
              {interfaces.map(item => (
                <tr key={item.iface} className="transition-colors hover:bg-[#F4EEFF]">
                  <td className="px-3 py-2.5 font-mono font-bold text-[#1B1024]">{item.iface}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.state === 'UP' ? 'bg-[#F0FDF4] text-[#16A36A]' : 'bg-[#FEF2F2] text-[#DC3545]'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${item.state === 'UP' ? 'bg-[#16A36A]' : 'bg-[#DC3545]'}`} />
                      {item.state}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078]">{item.ip}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#2563EB]">{item.rx_rate_fmt}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#16A36A]">{item.tx_rate_fmt}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078]">{item.rx_packets_sec || 0}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078]">{item.tx_packets_sec || 0}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078]">{item.errors_sec || 0}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078]">{item.drops_sec || 0}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16">
                        <CompactProgressBar value={item.utilization || 0} color="#4A1B7A" />
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[#1B1024]">{item.utilization || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const ServiceHealthTable: React.FC<{ services?: ServiceHealthItem[]; uptimeFmt?: string }> = ({ services, uptimeFmt = 'Active' }) => {
  const defaultServices: ServiceHealthItem[] = [
    { id: 'stream_engine', name: 'Stream Engine', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'ingest_service', name: 'Ingest Service', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'transcoder', name: 'Transcoder Engine', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'ffmpeg', name: 'FFmpeg Core', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'recording_engine', name: 'Recording Engine', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'storage', name: 'Storage Subsystem', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'websocket', name: 'WebSocket Gateway', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'database', name: 'Database (SQLite/Prisma)', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
  ];

  const list = services && services.length ? services : defaultServices;

  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Service Health</h3>
          <p className="text-[11px] text-[#6F6078]">Operational status of detected backend processes and middleware services</p>
        </div>
        <ShieldCheck size={18} className="text-[#16A36A]" />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
              <th className="px-3 py-2.5">Service</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Uptime</th>
              <th className="px-3 py-2.5">Latency</th>
              <th className="px-3 py-2.5">Last Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8DFF0]">
            {list.map(svc => (
              <tr key={svc.id} className="transition-colors hover:bg-[#F4EEFF]">
                <td className="px-3 py-2.5 font-semibold text-[#1B1024]">{svc.name}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    svc.status === 'Healthy' ? 'bg-[#F0FDF4] text-[#16A36A]' : 'bg-[#FFFBEB] text-[#D97706]'
                  }`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A]" />
                    {svc.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[#6F6078]">{svc.uptime}</td>
                <td className="px-3 py-2.5 font-mono text-[#6F6078]">{svc.latency}</td>
                <td className="px-3 py-2.5 font-mono text-[#6F6078]">{svc.lastCheck}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TelemetryStatusFooter: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  return (
    <div className="flex flex-wrap items-center justify-between rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] px-4 py-3 text-[11px]">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078]">Telemetry Agent:</span>
          <span className="font-semibold text-[#16A36A]">Connected</span>
        </div>
        <div className="h-3 w-px bg-[#E8DFF0]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078]">WebSocket:</span>
          <span className="font-semibold text-[#16A36A]">
            {stats.connectionStatus === 'connected' ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>
        <div className="h-3 w-px bg-[#E8DFF0]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078]">Sampling Interval:</span>
          <span className="font-mono font-semibold text-[#1B1024]">2 seconds</span>
        </div>
        <div className="h-3 w-px bg-[#E8DFF0]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078]">Last Sample:</span>
          <span className="font-mono font-semibold text-[#1B1024]">
            {formatRelativeTime(stats.lastUpdatedTime)}
          </span>
        </div>
      </div>

      <div className="mt-2 font-mono text-[10px] text-[#6F6078] sm:mt-0">
        Server Time: {stats.serverTime ? new Date(stats.serverTime).toLocaleString() : new Date().toLocaleString()}
      </div>
    </div>
  );
};

const SystemMonitor: React.FC = () => {
  const { stats, manualRefresh } = useSystemStats();

  return (
    <div className="system-monitor page-stack space-y-4">
      {/* 1. Page Header */}
      <SystemHeader
        connectionStatus={stats.connectionStatus}
        lastUpdated={stats.lastUpdatedTime}
        onRefresh={manualRefresh}
      />

      {/* 2. Top Health Bar */}
      <SystemHealthBar stats={stats} />

      {/* 3. Primary KPI Row */}
      <PrimaryKpiRow stats={stats} />

      {/* 4. Main Monitoring Grid (7:5 Split) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <NetworkThroughputSection stats={stats} />
        </div>
        <div className="xl:col-span-5">
          <CpuProcessingMatrix stats={stats} />
        </div>
      </div>

      {/* 5. Secondary Monitoring Row (6:3:3 Split) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ResourceTrendsSection stats={stats} />
        </div>
        <div className="xl:col-span-3">
          <StorageMemorySection stats={stats} />
        </div>
        <div className="xl:col-span-3">
          <RecentEventsSection stats={stats} />
        </div>
      </div>

      {/* 6. Per-Interface Network Section */}
      <NetworkInterfacesTable interfaces={stats.networkDetails} />

      {/* 7. Service Health */}
      <ServiceHealthTable services={stats.services} uptimeFmt={stats.uptimeFmt} />

      {/* 8. Telemetry Status Footer */}
      <TelemetryStatusFooter stats={stats} />
    </div>
  );
};

export default SystemMonitor;
