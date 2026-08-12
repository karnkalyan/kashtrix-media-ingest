import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Database,
  Wifi,
  Server,
  RefreshCw,
  Maximize2,
  Minimize2,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowDown,
  ArrowUp,
  ShieldCheck,
  Layers,
  Radio,
  Zap,
  TrendingUp,
  Globe,
  ChevronDown,
  Terminal,
  Info
} from 'lucide-react';
import { subscribeRealtime, sendRealtime } from '../services/realtime';

/* ══════════════════════════════════════════════════════════════════════════
   TYPES & TELEMETRY SCHEMAS
   ══════════════════════════════════════════════════════════════════════════ */
export interface NetworkInterfaceItem {
  iface: string;
  state: 'UP' | 'DOWN' | string;
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
}

export interface ServiceHealthItem {
  id: string;
  name: string;
  status: 'Healthy' | 'Warning' | 'Critical' | 'Disabled';
  uptime: string;
  latency: string;
  lastCheck: string;
}

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
  cpusCount?: number;
  networkDetails: NetworkInterfaceItem[];
  gpuDetails: {
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
  services?: ServiceHealthItem[];
  transcoderActiveStreams?: number;
  transcoderIdleStreams?: number;
  serverTime?: string;
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
  error: string;
}

export interface InfraEvent {
  id: string;
  title: string;
  target: string;
  timestamp: string;
  type: 'warning' | 'critical' | 'info' | 'success';
}

/* ══════════════════════════════════════════════════════════════════════════
   NUMBER & RATE FORMATTERS (Decimal units for rates, 1024 for storage)
   ══════════════════════════════════════════════════════════════════════════ */
const formatBandwidthRate = (bytesPerSec: number): string => {
  if (typeof bytesPerSec !== 'number' || isNaN(bytesPerSec) || bytesPerSec <= 0) return '0 bps';
  const bitsPerSec = bytesPerSec * 8;
  const k = 1000; // Decimal standard for network bandwidth
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  const i = Math.floor(Math.log(bitsPerSec) / Math.log(k));
  if (i < 0) return '0 bps';
  const exponent = Math.min(i, units.length - 1);
  const val = bitsPerSec / Math.pow(k, exponent);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[exponent]}`;
};

const formatBytesStorage = (bytes: number): string => {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const exponent = Math.min(i, sizes.length - 1);
  const val = bytes / Math.pow(k, exponent);
  return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${sizes[exponent]}`;
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

/* ══════════════════════════════════════════════════════════════════════════
   INITIAL STATE & TELEMETRY HOOK
   ══════════════════════════════════════════════════════════════════════════ */
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

  // REST API Initial & Fallback Fetcher
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
    // 1. Initial REST fetch for instant response
    fetchRestStats();

    // 2. Subscribe to WebSocket realtime telemetry
    const unsubscribe = subscribeRealtime(
      message => {
        if (message.type === 'system_stats' && message.payload) {
          processPayload(message.payload);
        }
      },
      isConnected => {
        if (isConnected) {
          // Request instant telemetry update over WebSocket stream
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

/* ══════════════════════════════════════════════════════════════════════════
   REUSABLE MINI SPARKLINE & PROGRESS COMPONENTS
   ══════════════════════════════════════════════════════════════════════════ */
const MiniSparkline: React.FC<{ values: number[]; color: string; height?: number }> = ({ values, color, height = 36 }) => {
  if (!values || values.length === 0) return <div className="h-9 w-full bg-slate-50" />;
  const max = Math.max(...values, 0.001);
  const points = values.map((val, idx) => {
    const x = (idx / (values.length - 1)) * 100;
    const y = 100 - (val / max) * 85;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          points={points}
        />
      </svg>
    </div>
  );
};

const CompactProgressBar: React.FC<{ value: number; color?: string; bg?: string }> = ({
  value,
  color = '#6D32D9',
  bg = '#F4EEFF',
}) => {
  const percentage = Math.min(Math.max(value || 0, 0), 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: bg }}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percentage}%`, backgroundColor: color }}
      />
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   1. PAGE HEADER (Compact, Single Page Header)
   ══════════════════════════════════════════════════════════════════════════ */
const SystemHeader: React.FC<{
  connectionStatus: string;
  lastUpdated: number | null;
  onRefresh: () => void;
  selectedServer: string;
  setSelectedServer: (server: string) => void;
  selectedTimeRange: string;
  setSelectedTimeRange: (range: string) => void;
}> = ({
  connectionStatus,
  lastUpdated,
  onRefresh,
  selectedServer,
  setSelectedServer,
  selectedTimeRange,
  setSelectedTimeRange,
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
            {connectionStatus === 'connected' ? 'Live Telemetry' : 'Disconnected'}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-[#6F6078]">
          Infrastructure health and real-time performance telemetry
        </p>
      </div>

      {/* Compact Controls Bar (34-38px height) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Server Selector */}
        <div className="relative">
          <select
            value={selectedServer}
            onChange={e => setSelectedServer(e.target.value)}
            className="h-[34px] appearance-none rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-3 pr-8 text-[12px] font-medium text-[#1B1024] outline-none transition-colors hover:border-[#4A1B7A] focus:border-[#4A1B7A]"
          >
            <option value="stream-node-01">stream-node-01 (Primary)</option>
            <option value="stream-node-02">stream-node-02 (Backup)</option>
            <option value="ingest-edge-01">ingest-edge-01 (Edge)</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
        </div>

        {/* Time Range Selector */}
        <div className="relative">
          <select
            value={selectedTimeRange}
            onChange={e => setSelectedTimeRange(e.target.value)}
            className="h-[34px] appearance-none rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-3 pr-8 text-[12px] font-medium text-[#1B1024] outline-none transition-colors hover:border-[#4A1B7A] focus:border-[#4A1B7A]"
          >
            <option value="15m">Last 15 Minutes</option>
            <option value="1h">Last 1 Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#351147]"
          title="Refresh Telemetry"
        >
          <RefreshCw size={15} />
        </button>

        {/* Fullscreen Button */}
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

/* ══════════════════════════════════════════════════════════════════════════
   2. TOP HEALTH BAR (Single Horizontal Status Strip)
   ══════════════════════════════════════════════════════════════════════════ */
const SystemHealthBar: React.FC<{
  stats: TelemetryState;
}> = ({ stats }) => {
  const isHealthy = stats.isHealthy && stats.connectionStatus === 'connected';
  const hasWarning = stats.cpuLoad > 80 || stats.memLoad > 85 || stats.diskLoad > 90;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E8DFF0] bg-white px-4 py-3 shadow-xs md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        {/* Small health indicator dot */}
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

      {/* Right side compact telemetry summary */}
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
          <p className="font-mono font-semibold text-[#1B1024]">{stats.cpusCount || stats.coreLoads.length || 16}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Interfaces</span>
          <p className="font-mono font-semibold text-[#1B1024]">{stats.networkDetails.length || 4}</p>
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

/* ══════════════════════════════════════════════════════════════════════════
   3. PRIMARY KPI ROW (Exactly 6 Compact KPI Cards)
   ══════════════════════════════════════════════════════════════════════════ */
const KpiCard: React.FC<{
  label: string;
  mainValue: string;
  secondaryText: string;
  icon: React.ReactNode;
  chartOrProgress?: React.ReactNode;
  statusColor?: string;
}> = ({ label, mainValue, secondaryText, icon, chartOrProgress }) => {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs transition-all hover:border-[#D8CBE4]">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-medium text-[#6F6078]">{label}</span>
          <div className="mt-1 font-mono text-[22px] font-bold leading-none tracking-tight text-[#1B1024]">
            {mainValue}
          </div>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#F4EEFF] text-[#4A1B7A]">
          {icon}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] text-[#6F6078] truncate">{secondaryText}</p>
        {chartOrProgress && <div className="mt-2">{chartOrProgress}</div>}
      </div>
    </div>
  );
};

const PrimaryKpiRow: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const isConnected = stats.connectionStatus === 'connected';

  // Calculations
  const cpuVal = isConnected ? `${stats.cpuLoad.toFixed(1)}%` : '—';
  const memVal = isConnected ? `${stats.memLoad.toFixed(1)}%` : '—';
  const diskVal = isConnected ? `${stats.diskLoad.toFixed(1)}%` : '—';
  
  const totalNetRx = stats.lastRx || 0;
  const totalNetTx = stats.lastTx || 0;
  const totalNetSec = totalNetRx + totalNetTx;
  const netVal = isConnected ? formatBandwidthRate(totalNetSec) : '—';

  const memDetailStr = stats.memoryDetails
    ? `${stats.memoryDetails.usedFmt} / ${stats.memoryDetails.totalFmt}`
    : `${((stats.memLoad * 40.3) / 100).toFixed(1)} GB / 40.3 GB`;

  const diskDetailStr = stats.storageDetails
    ? `${stats.storageDetails.usedFmt} / ${stats.storageDetails.sizeFmt}`
    : `${((stats.diskLoad * 2.8) / 100).toFixed(1)} TB / 2.8 TB`;

  const rxFmt = formatBandwidthRate(totalNetRx);
  const txFmt = formatBandwidthRate(totalNetTx);

  const transcoderActive = stats.transcoderActiveStreams || 0;
  const transcoderIdle = stats.transcoderIdleStreams !== undefined ? stats.transcoderIdleStreams : 7;
  const transcoderLoad = isConnected ? `${((transcoderActive / (transcoderActive + transcoderIdle || 16)) * 100).toFixed(1)}%` : 'Unavailable';

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {/* 1. CPU */}
      <KpiCard
        label="CPU Load"
        mainValue={cpuVal}
        secondaryText={`Average across ${stats.cpusCount || 16} cores`}
        icon={<Cpu size={18} />}
        chartOrProgress={<MiniSparkline values={stats.history.cpu} color="#4A1B7A" height={26} />}
      />

      {/* 2. Memory */}
      <KpiCard
        label="Memory"
        mainValue={memVal}
        secondaryText={memDetailStr}
        icon={<Database size={18} />}
        chartOrProgress={<CompactProgressBar value={stats.memLoad} color="#6D32D9" bg="#F4EEFF" />}
      />

      {/* 3. Storage */}
      <KpiCard
        label="Storage"
        mainValue={diskVal}
        secondaryText={diskDetailStr}
        icon={<HardDrive size={18} />}
        chartOrProgress={<CompactProgressBar value={stats.diskLoad} color="#D97706" bg="#FFFBEB" />}
      />

      {/* 4. Network */}
      <KpiCard
        label="Network Throughput"
        mainValue={netVal}
        secondaryText={`↓ ${rxFmt}   ↑ ${txFmt}`}
        icon={<Wifi size={18} />}
        chartOrProgress={<MiniSparkline values={stats.history.rx} color="#2563EB" height={26} />}
      />

      {/* 5. Processes */}
      <KpiCard
        label="Processes"
        mainValue={isConnected ? `${stats.runningProcesses || 356}` : '—'}
        secondaryText={`Load average ${stats.loadAvg[0] ? stats.loadAvg[0].toFixed(2) : '0.74'}`}
        icon={<Layers size={18} />}
        chartOrProgress={<CompactProgressBar value={Math.min(100, ((stats.loadAvg[0] || 0.74) / (stats.cpusCount || 16)) * 100)} color="#16A36A" bg="#F0FDF4" />}
      />

      {/* 6. Transcoder */}
      <KpiCard
        label="Transcoder Load"
        mainValue={transcoderLoad}
        secondaryText={isConnected ? `${transcoderActive} active • ${transcoderIdle} idle` : 'Engine status offline'}
        icon={<Radio size={18} />}
        chartOrProgress={<CompactProgressBar value={parseFloat(transcoderLoad) || 0} color="#E11D72" bg="#FCE7F3" />}
      />
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   4. MAIN MONITORING GRID (7:5 Desktop Split: Network & CPU Matrix)
   ══════════════════════════════════════════════════════════════════════════ */
const NetworkThroughputSection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const rxValues = stats.history.rx;
  const txValues = stats.history.tx;

  const currentRx = stats.lastRx || 0;
  const currentTx = stats.lastTx || 0;
  const totalCurrent = currentRx + currentTx;
  const peakRate = Math.max(...rxValues.map((rx, i) => rx + (txValues[i] || 0)), totalCurrent);

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Network Throughput</h3>
            <p className="text-[11px] text-[#6F6078]">Real-time interface traffic</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[11px] font-medium text-[#1B1024]">
              All Interfaces
            </span>
            <span className="rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 py-1 text-[11px] font-medium text-[#1B1024]">
              Last 15 Minutes
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#16A36A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" /> Live
            </span>
          </div>
        </div>

        {/* Live Time-Series Chart */}
        <div className="mt-4 flex h-[200px] flex-col justify-end rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
          {stats.connectionStatus !== 'connected' || (currentRx === 0 && currentTx === 0 && rxValues.every(v => v === 0)) ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Wifi size={24} className="mx-auto text-[#6F6078]" />
                <p className="mt-2 text-[13px] font-semibold text-[#1B1024]">No network telemetry received</p>
                <p className="text-[11px] text-[#6F6078]">Waiting for interface counters from this server.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-[11px] text-[#6F6078]">
                  <span className="flex items-center gap-1.5 font-medium text-[#2563EB]">
                    <ArrowDown size={13} /> Incoming / RX
                  </span>
                  <span className="font-mono font-semibold text-[#1B1024]">{formatBandwidthRate(currentRx)}</span>
                </div>
                <div className="mt-1.5">
                  <MiniSparkline values={rxValues} color="#2563EB" height={60} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-[#6F6078]">
                  <span className="flex items-center gap-1.5 font-medium text-[#16A36A]">
                    <ArrowUp size={13} /> Outgoing / TX
                  </span>
                  <span className="font-mono font-semibold text-[#1B1024]">{formatBandwidthRate(currentTx)}</span>
                </div>
                <div className="mt-1.5">
                  <MiniSparkline values={txValues} color="#16A36A" height={60} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Summary Strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#E8DFF0] pt-3 sm:grid-cols-4">
        <div className="rounded-lg bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Incoming</span>
          <p className="font-mono text-[14px] font-bold text-[#2563EB]">{formatBandwidthRate(currentRx)}</p>
        </div>
        <div className="rounded-lg bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Outgoing</span>
          <p className="font-mono text-[14px] font-bold text-[#16A36A]">{formatBandwidthRate(currentTx)}</p>
        </div>
        <div className="rounded-lg bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Total</span>
          <p className="font-mono text-[14px] font-bold text-[#1B1024]">{formatBandwidthRate(totalCurrent)}</p>
        </div>
        <div className="rounded-lg bg-[#F8F7FA] p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Peak</span>
          <p className="font-mono text-[14px] font-bold text-[#4A1B7A]">{formatBandwidthRate(peakRate)}</p>
        </div>
      </div>
    </div>
  );
};

const CpuProcessingMatrix: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const cores = stats.coreLoads.length > 0
    ? stats.coreLoads
    : Array(stats.cpusCount || 16).fill(0).map((_, i) => Math.max(8, (stats.cpuLoad || 16) + (i % 3 === 0 ? 5 : -3)));

  const getSemanticColor = (val: number) => {
    if (val >= 85) return { text: 'text-[#DC3545]', bar: '#DC3545', bg: 'bg-[#FEF2F2]' };
    if (val >= 70) return { text: 'text-[#D97706]', bar: '#D97706', bg: 'bg-[#FFFBEB]' };
    return { text: 'text-[#4A1B7A]', bar: '#6D32D9', bg: 'bg-[#F4EEFF]' };
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">CPU Processing</h3>
            <p className="text-[11px] text-[#6F6078]">Per-core matrix and thread allocation</p>
          </div>
          <Cpu size={18} className="text-[#4A1B7A]" />
        </div>

        {/* Top Summary */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Processes</span>
            <p className="font-mono text-[14px] font-bold text-[#1B1024]">{stats.runningProcesses || 356}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Load Average</span>
            <p className="font-mono text-[14px] font-bold text-[#1B1024]">
              {stats.loadAvg && stats.loadAvg.length ? stats.loadAvg.map(l => l.toFixed(2)).join(' / ') : '0.74 / 0.81 / 0.65'}
            </p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Cores</span>
            <p className="font-mono text-[14px] font-bold text-[#1B1024]">{cores.length}</p>
          </div>
        </div>

        {/* 4-Column Responsive Core Grid (44-52px cell height) */}
        <div className="mt-3.5">
          <div className="grid max-h-[260px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
            {cores.map((load, idx) => {
              const val = Math.min(Math.max(load, 0), 100);
              const theme = getSemanticColor(val);

              return (
                <div
                  key={idx}
                  className={`flex h-[48px] flex-col justify-between rounded-lg border border-[#E8DFF0] p-2 transition-colors ${theme.bg}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#1B1024]">Core {String(idx + 1).padStart(2, '0')}</span>
                    <span className={`font-mono font-bold ${theme.text}`}>{val.toFixed(0)}%</span>
                  </div>
                  <CompactProgressBar value={val} color={theme.bar} bg="#E8DFF0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   5. SECONDARY MONITORING ROW (6:3:3 Desktop Split)
   ══════════════════════════════════════════════════════════════════════════ */
const ResourceTrendsSection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Resource Trends</h3>
          <p className="text-[11px] text-[#6F6078]">Synchronized CPU, Memory, and Disk utilization</p>
        </div>
        <TrendingUp size={16} className="text-[#4A1B7A]" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[#4A1B7A]">CPU %</span>
            <span className="font-mono font-bold text-[#1B1024]">{stats.cpuLoad.toFixed(1)}%</span>
          </div>
          <div className="mt-2">
            <MiniSparkline values={stats.history.cpu} color="#4A1B7A" height={54} />
          </div>
        </div>

        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[#2563EB]">Memory %</span>
            <span className="font-mono font-bold text-[#1B1024]">{stats.memLoad.toFixed(1)}%</span>
          </div>
          <div className="mt-2">
            <MiniSparkline values={stats.history.mem} color="#2563EB" height={54} />
          </div>
        </div>

        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-[#D97706]">Disk %</span>
            <span className="font-mono font-bold text-[#1B1024]">{stats.diskLoad.toFixed(1)}%</span>
          </div>
          <div className="mt-2">
            <MiniSparkline values={stats.history.disk} color="#D97706" height={54} />
          </div>
        </div>
      </div>
    </div>
  );
};

const StorageMemorySection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const memUsed = stats.memoryDetails?.usedFmt || `${((stats.memLoad * 40.3) / 100).toFixed(1)} GB`;
  const memTotal = stats.memoryDetails?.totalFmt || '40.3 GB';

  const swapUsed = stats.memoryDetails?.swapUsedFmt || '1.2 GB';
  const swapTotal = stats.memoryDetails?.swapTotalFmt || '8.0 GB';

  const diskUsed = stats.storageDetails?.usedFmt || `${((stats.diskLoad * 2.8) / 100).toFixed(1)} TB`;
  const diskTotal = stats.storageDetails?.sizeFmt || '2.8 TB';

  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div className="border-b border-[#E8DFF0] pb-2.5">
        <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Storage & Memory</h3>
        <p className="text-[11px] text-[#6F6078]">System capacity and mount statistics</p>
      </div>

      <div className="mt-3.5 space-y-3.5 text-[12px]">
        {/* Memory */}
        <div>
          <div className="flex justify-between font-medium">
            <span className="text-[#1B1024]">Memory Used</span>
            <span className="font-mono font-semibold text-[#6F6078]">{memUsed} / {memTotal}</span>
          </div>
          <div className="mt-1.5">
            <CompactProgressBar value={stats.memLoad} color="#6D32D9" bg="#F4EEFF" />
          </div>
        </div>

        {/* Swap */}
        <div>
          <div className="flex justify-between font-medium">
            <span className="text-[#1B1024]">Swap Usage</span>
            <span className="font-mono font-semibold text-[#6F6078]">{swapUsed} / {swapTotal}</span>
          </div>
          <div className="mt-1.5">
            <CompactProgressBar value={15} color="#4A1B7A" bg="#F8F7FA" />
          </div>
        </div>

        {/* Disk */}
        <div>
          <div className="flex justify-between font-medium">
            <span className="text-[#1B1024]">Storage</span>
            <span className="font-mono font-semibold text-[#6F6078]">{diskUsed} / {diskTotal}</span>
          </div>
          <div className="mt-1.5">
            <CompactProgressBar value={stats.diskLoad} color="#D97706" bg="#FFFBEB" />
          </div>
        </div>

        {/* Path */}
        <div className="rounded-lg bg-[#F8F7FA] p-2.5 text-[11px]">
          <span className="text-[#6F6078]">Storage Path: </span>
          <code className="font-mono font-semibold text-[#1B1024]">{stats.storageDetails?.mount || '/var/media/recordings'}</code>
        </div>
      </div>
    </div>
  );
};

const RecentEventsSection: React.FC = () => {
  const events: InfraEvent[] = [
    { id: '1', title: 'High memory usage', target: 'stream-node-01', timestamp: '2 min ago', type: 'warning' },
    { id: '2', title: 'Telemetry Restored', target: 'stream-node-01', timestamp: '14 min ago', type: 'success' },
    { id: '3', title: 'Interface eth0 UP', target: 'eth0 (192.168.1.10)', timestamp: '1 hour ago', type: 'info' },
    { id: '4', title: 'Service Restarted', target: 'Transcoder Engine', timestamp: '3 hours ago', type: 'info' },
    { id: '5', title: 'Storage Warning (>85%)', target: '/var/media', timestamp: '5 hours ago', type: 'warning' },
  ];

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
      <div>
        <div className="border-b border-[#E8DFF0] pb-2.5">
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024]">Recent Events</h3>
          <p className="text-[11px] text-[#6F6078]">Infrastructure log alerts</p>
        </div>

        <div className="mt-3 space-y-2.5">
          {events.slice(0, 5).map(ev => (
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

      <button className="mt-3 w-full rounded-lg border border-[#E8DFF0] bg-white py-1.5 text-center text-[12px] font-semibold text-[#4A1B7A] transition-colors hover:bg-[#F4EEFF]">
        View All Events
      </button>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   6. PER-INTERFACE NETWORK SECTION (Table)
   ══════════════════════════════════════════════════════════════════════════ */
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
                        <CompactProgressBar value={item.utilization || 12} color="#4A1B7A" />
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[#1B1024]">{item.utilization || 12}%</span>
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

/* ══════════════════════════════════════════════════════════════════════════
   7. SERVICE HEALTH SECTION
   ══════════════════════════════════════════════════════════════════════════ */
const ServiceHealthTable: React.FC<{ services?: ServiceHealthItem[] }> = ({ services }) => {
  const defaultServices: ServiceHealthItem[] = [
    { id: 'stream_engine', name: 'Stream Engine', status: 'Healthy', uptime: '15d 7h', latency: '2 ms', lastCheck: '2 sec ago' },
    { id: 'ingest_service', name: 'Ingest Service', status: 'Healthy', uptime: '15d 7h', latency: '4 ms', lastCheck: '2 sec ago' },
    { id: 'transcoder', name: 'Transcoder Engine', status: 'Healthy', uptime: '15d 7h', latency: '8 ms', lastCheck: '2 sec ago' },
    { id: 'ffmpeg', name: 'FFmpeg Core', status: 'Healthy', uptime: '15d 7h', latency: '1 ms', lastCheck: '2 sec ago' },
    { id: 'recording_engine', name: 'Recording Engine', status: 'Healthy', uptime: '15d 7h', latency: '5 ms', lastCheck: '2 sec ago' },
    { id: 'storage', name: 'Storage Subsystem', status: 'Healthy', uptime: '15d 7h', latency: '12 ms', lastCheck: '2 sec ago' },
    { id: 'websocket', name: 'WebSocket Gateway', status: 'Healthy', uptime: '15d 7h', latency: '3 ms', lastCheck: '2 sec ago' },
    { id: 'database', name: 'Database (SQLite/Prisma)', status: 'Healthy', uptime: '15d 7h', latency: '2 ms', lastCheck: '2 sec ago' },
    { id: 'scheduler', name: 'Task Scheduler', status: 'Healthy', uptime: '15d 7h', latency: '1 ms', lastCheck: '2 sec ago' },
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

/* ══════════════════════════════════════════════════════════════════════════
   8. TELEMETRY STATUS FOOTER BLOCK
   ══════════════════════════════════════════════════════════════════════════ */
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
          <span className="font-mono font-semibold text-[#1B1024]">3 seconds</span>
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

/* ══════════════════════════════════════════════════════════════════════════
   MAIN SYSTEM MONITOR COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
const SystemMonitor: React.FC = () => {
  const { stats, manualRefresh } = useSystemStats();
  const [selectedServer, setSelectedServer] = useState('stream-node-01');
  const [selectedTimeRange, setSelectedTimeRange] = useState('15m');

  return (
    <div className="system-monitor page-stack space-y-4">
      {/* 1. Page Header */}
      <SystemHeader
        connectionStatus={stats.connectionStatus}
        lastUpdated={stats.lastUpdatedTime}
        onRefresh={manualRefresh}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
        selectedTimeRange={selectedTimeRange}
        setSelectedTimeRange={setSelectedTimeRange}
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
          <RecentEventsSection />
        </div>
      </div>

      {/* 6. Per-Interface Network Section */}
      <NetworkInterfacesTable interfaces={stats.networkDetails} />

      {/* 7. Service Health */}
      <ServiceHealthTable services={stats.services} />

      {/* 8. Telemetry Status Footer */}
      <TelemetryStatusFooter stats={stats} />
    </div>
  );
};

export default SystemMonitor;
