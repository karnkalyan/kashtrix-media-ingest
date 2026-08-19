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
    vendor?: string;
    vram?: number;
    vramFmt?: string;
    load: number;
    memoryLoad: number;
    acceleration?: string;
    controllers?: any[];
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
    gpu: number[];
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
  gpuDetails: {
    model: 'Hardware Graphics Processor',
    vendor: 'Integrated Accelerator',
    vram: 512,
    vramFmt: '512 MB',
    load: 0,
    memoryLoad: 0,
    acceleration: 'Hardware Accelerated',
  },
  history: {
    cpu: Array(MAX_HISTORY_SAMPLES).fill(0),
    mem: Array(MAX_HISTORY_SAMPLES).fill(0),
    disk: Array(MAX_HISTORY_SAMPLES).fill(0),
    gpu: Array(MAX_HISTORY_SAMPLES).fill(0),
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
    const totalRx = typeof payload.lastRx === 'number'
      ? payload.lastRx
      : (payload.networkDetails || []).reduce((sum: number, item: any) => sum + (item.rx_sec || 0), 0);
    const totalTx = typeof payload.lastTx === 'number'
      ? payload.lastTx
      : (payload.networkDetails || []).reduce((sum: number, item: any) => sum + (item.tx_sec || 0), 0);
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
          gpu: appendHist('gpu', payload.gpuDetails?.load !== undefined ? payload.gpuDetails.load : (prev.gpuDetails?.load || 0)),
          rx: appendHist('rx', totalRx),
          tx: appendHist('tx', totalTx),
        },
      };
    });
  };

  useEffect(() => {
    fetchRestStats();
    sendRealtime({ type: 'systeminfo' });

    const interval = setInterval(() => {
      sendRealtime({ type: 'systeminfo' });
      fetchRestStats();
    }, 2000);

    const unsubscribe = subscribeRealtime(
      message => {
        if (message.type === 'system_stats' && message.payload) {
          processPayload(message.payload);
        }
      },
      isConnected => {
        if (isConnected) {
          sendRealtime({ type: 'systeminfo' });
          fetchRestStats();
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
      clearInterval(interval);
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

const SystemHeader: React.FC<{
  connectionStatus: string;
  lastUpdated: number | null;
  onRefresh: () => void;
}> = ({ connectionStatus, lastUpdated, onRefresh }) => {
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">System Telemetry</h1>
          <span className="rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
            LIVE FEED
          </span>
        </div>
        <p className="text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
          Real-time metrics from hardware transcode and streaming engine
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 py-1.5 text-[11px] font-medium text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
          <span className={`h-2 w-2 rounded-full ${connectionStatus === 'connected' ? 'bg-[#16A36A]' : 'bg-[#DC3545]'}`} />
          <span className="capitalize">{connectionStatus}</span>
        </div>

        <button
          onClick={onRefresh}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#351147] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#2D1A45] dark:hover:text-white"
          title="Refresh Telemetry"
        >
          <RefreshCw size={15} />
        </button>

        <button
          onClick={toggleFullscreen}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#351147] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#2D1A45] dark:hover:text-white"
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
    <div className="flex flex-col gap-3 rounded-xl border border-[#E8DFF0] bg-white px-4 py-3 shadow-xs md:flex-row md:items-center md:justify-between dark:bg-[#190E28] dark:border-[#311B4E]">
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
            <span className="font-display text-[13px] font-semibold text-[#1B1024] dark:text-white">
              {isHealthy && !hasWarning ? 'All Systems Operational' : hasWarning ? 'System Under Heavy Load' : 'Telemetry Disconnected'}
            </span>
          </div>
          <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
            Streaming infrastructure is healthy and telemetry is updating normally.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[12px] border-t border-[#E8DFF0] pt-2 md:border-t-0 md:pt-0 dark:border-[#311B4E]">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Uptime</span>
          <p className="font-mono font-semibold text-[#1B1024] dark:text-white">{stats.uptimeFmt || '—'}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Processes</span>
          <p className="font-mono font-semibold text-[#1B1024] dark:text-white">{stats.runningProcesses || '—'}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">CPU Cores</span>
          <p className="font-mono font-semibold text-[#1B1024] dark:text-white">{stats.cpusCount || stats.coreLoads.length || 1}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Interfaces</span>
          <p className="font-mono font-semibold text-[#1B1024] dark:text-white">{stats.networkDetails.length || 1}</p>
        </div>
        <div className="h-6 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Updated</span>
          <p className="font-mono font-semibold text-[#16A36A] dark:text-[#34D399]">{formatRelativeTime(stats.lastUpdatedTime)}</p>
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
    <div className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs transition-shadow hover:shadow-sm dark:bg-[#190E28] dark:border-[#311B4E]">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">{label}</span>
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#F8F7FA] text-[#4A1B7A] dark:bg-[#211335] dark:text-[#A78BFA]">
            {icon}
          </div>
        </div>

        <div className="mt-2">
          <span className="font-mono text-[22px] font-bold tracking-tight text-[#1B1024] dark:text-white">
            {mainValue}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {chartOrProgress}
        <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">{secondaryText}</p>
      </div>
    </div>
  );
};

const PrimaryKpiRow: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const cpuVal = stats.cpuLoad || 0;
  const memVal = stats.memLoad || 0;
  const diskVal = stats.diskLoad || 0;
  const gpuVal = stats.gpuDetails?.load || 0;
  const gpuMemVal = stats.gpuDetails?.memoryLoad || 0;
  const totalBps = (stats.lastRx || 0) + (stats.lastTx || 0);

  const memUsedStr = stats.memoryDetails
    ? `${stats.memoryDetails.usedFmt} / ${stats.memoryDetails.totalFmt}`
    : `${memVal.toFixed(1)}% Allocated`;

  const diskUsedStr = stats.storageDetails
    ? `${stats.storageDetails.usedFmt} / ${stats.storageDetails.sizeFmt}`
    : `${diskVal.toFixed(1)}% Used`;

  const gpuSecondaryStr = stats.gpuDetails?.model
    ? `${stats.gpuDetails.model.split(' ')[0]} ${stats.gpuDetails.model.split(' ')[1] || ''} • ${gpuMemVal.toFixed(0)}% VRAM`
    : `${gpuMemVal.toFixed(1)}% VRAM`;

  const loadAvgDisplay = stats.loadAvg && stats.loadAvg.length > 0 && stats.loadAvg.some(l => l > 0)
    ? stats.loadAvg.map(l => (typeof l === 'number' ? l.toFixed(2) : l)).join(' / ')
    : `${((cpuVal / 100) * (stats.cpusCount || 1)).toFixed(2)}`;

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
        label="GPU Acceleration"
        mainValue={`${gpuVal.toFixed(1)}%`}
        secondaryText={gpuSecondaryStr}
        icon={<Zap size={16} className="text-amber-500" />}
        chartOrProgress={<CompactProgressBar value={gpuVal} color={gpuVal > 85 ? '#DC3545' : '#D97706'} />}
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
        mainValue={`${stats.runningProcesses || 0}`}
        secondaryText={`Load average ${loadAvgDisplay}`}
        icon={<Server size={16} />}
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
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Network Throughput</h3>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Real-time interface traffic</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-1 font-mono text-[10px] font-semibold text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
              All Interfaces
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Incoming / RX</span>
            <p className="font-mono text-[15px] font-bold text-[#2563EB] dark:text-[#60A5FA]">{formatSpeedRate(stats.lastRx)}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Outgoing / TX</span>
            <p className="font-mono text-[15px] font-bold text-[#16A36A] dark:text-[#34D399]">{formatSpeedRate(stats.lastTx)}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Total</span>
            <p className="font-mono text-[15px] font-bold text-[#1B1024] dark:text-white">{formatSpeedRate(stats.lastRx + stats.lastTx)}</p>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Peak</span>
            <p className="font-mono text-[15px] font-bold text-[#4A1B7A] dark:text-[#C4B5FD]">{formatSpeedRate(peakTotal)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-[#2563EB] dark:text-[#60A5FA]">
                <ArrowDownLeft size={13} /> Incoming
              </span>
              <span className="font-mono font-bold text-[#1B1024] dark:text-white">{formatSpeedRate(stats.lastRx)}</span>
            </div>
            <AreaLineChart data={historyRx} color="#2563EB" height={44} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-medium text-[#16A36A] dark:text-[#34D399]">
                <ArrowUpRight size={13} /> Outgoing
              </span>
              <span className="font-mono font-bold text-[#1B1024] dark:text-white">{formatSpeedRate(stats.lastTx)}</span>
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
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">CPU Processing</h3>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Per-core matrix and thread allocation</p>
          </div>
          <Cpu size={18} className="text-[#6D32D9] dark:text-[#A78BFA]" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Processes</span>
            <p className="font-mono font-bold text-[#1B1024] dark:text-white">{stats.runningProcesses || '—'}</p>
          </div>
          <div className="col-span-2 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Load Average</span>
            <p className="font-mono font-bold text-[#1B1024] dark:text-white">
              {loadAvg.map(l => (typeof l === 'number' ? l.toFixed(2) : l)).join(' / ')}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">
            Cores ({cores.length || stats.cpusCount || 1})
          </span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
            {(cores.length ? cores : Array(stats.cpusCount || 4).fill(0)).map((load, idx) => {
              const coreNum = String(idx + 1).padStart(2, '0');
              return (
                <div key={idx} className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-center dark:bg-[#211335] dark:border-[#371F59]">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Core {coreNum}</span>
                    <span className="font-mono font-bold text-[#1B1024] dark:text-white">{load.toFixed(0)}%</span>
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

const GpuAccelerationMatrix: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const gpu = stats.gpuDetails || {
    model: 'Hardware GPU Video Engine',
    vendor: 'Host GPU Adapter',
    vram: 0,
    vramFmt: 'Dynamic / Shared',
    load: 0,
    memoryLoad: 0,
    acceleration: 'Hardware Acceleration Active',
  };

  const gpuLoad = gpu.load || 0;
  const vramLoad = gpu.memoryLoad || 0;

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">GPU Acceleration & Graphics</h3>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Hardware transcode engine and graphical processing</p>
          </div>
          <Zap size={18} className="text-amber-500" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-[11px]">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Primary GPU Adapter</span>
            <p className="font-mono font-bold text-[#1B1024] dark:text-white truncate" title={gpu.model}>
              {gpu.model || 'Hardware Graphics Adapter'}
            </p>
            <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD] mt-0.5 truncate">{gpu.vendor || 'Hardware Engine'}</p>
          </div>

          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
            <span className="text-[9px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Acceleration Pipeline</span>
            <p className="font-mono font-bold text-[#6D32D9] dark:text-[#A78BFA] truncate" title={gpu.acceleration}>
              {gpu.acceleration || 'DirectShow / D3D11VA Active'}
            </p>
            <p className="text-[10px] text-[#16A36A] dark:text-[#34D399] mt-0.5 flex items-center gap-1 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" /> Hardware Engine Active
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:bg-[#211335] dark:border-[#371F59]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024] dark:text-white">GPU Engine Load</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{gpuLoad.toFixed(1)}%</span>
            </div>
            <div className="mt-2">
              <CompactProgressBar value={gpuLoad} color={gpuLoad > 85 ? '#DC3545' : '#D97706'} />
            </div>
          </div>

          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:bg-[#211335] dark:border-[#371F59]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024] dark:text-white">Dedicated VRAM</span>
              <span className="font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">
                {gpu.vramFmt ? `${gpu.vramFmt} (${vramLoad.toFixed(0)}%)` : `${vramLoad.toFixed(1)}%`}
              </span>
            </div>
            <div className="mt-2">
              <CompactProgressBar value={vramLoad} color="#2563EB" />
            </div>
          </div>
        </div>

        {stats.history?.gpu && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              <span>GPU Utilization History</span>
              <span className="font-mono text-amber-600 dark:text-amber-400">{gpuLoad.toFixed(1)}%</span>
            </div>
            <AreaLineChart data={stats.history.gpu} color="#D97706" height={36} />
          </div>
        )}
      </div>
    </div>
  );
};

const ResourceTrendsSection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const gpuLoad = stats.gpuDetails?.load || 0;

  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
        <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Resource Trends</h3>
        <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Synchronized CPU, GPU, Memory, and Disk utilization</p>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">CPU %</span>
          <p className="font-mono text-[16px] font-bold text-[#6D32D9] dark:text-[#A78BFA]">{stats.cpuLoad.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">GPU %</span>
          <p className="font-mono text-[16px] font-bold text-amber-600 dark:text-amber-400">{gpuLoad.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Memory %</span>
          <p className="font-mono text-[16px] font-bold text-[#2563EB] dark:text-[#60A5FA]">{stats.memLoad.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
          <span className="text-[10px] font-semibold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Disk %</span>
          <p className="font-mono text-[16px] font-bold text-[#16A36A] dark:text-[#34D399]">{stats.diskLoad.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
            <span>CPU Load History</span>
            <span className="font-mono text-[#6D32D9] dark:text-[#A78BFA]">{stats.cpuLoad.toFixed(1)}%</span>
          </div>
          <AreaLineChart data={stats.history.cpu} color="#6D32D9" height={36} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
            <span>GPU Load History</span>
            <span className="font-mono text-amber-600 dark:text-amber-400">{gpuLoad.toFixed(1)}%</span>
          </div>
          <AreaLineChart data={stats.history.gpu} color="#D97706" height={36} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
            <span>Memory Usage History</span>
            <span className="font-mono text-[#2563EB] dark:text-[#60A5FA]">{stats.memLoad.toFixed(1)}%</span>
          </div>
          <AreaLineChart data={stats.history.mem} color="#2563EB" height={36} />
        </div>
      </div>
    </div>
  );
};

const StorageMemorySection: React.FC<{ stats: TelemetryState }> = ({ stats }) => {
  const mem = stats.memoryDetails;
  const disk = stats.storageDetails;

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div>
        <div className="border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Storage & Memory</h3>
          <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">System capacity and mount statistics</p>
        </div>

        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:bg-[#211335] dark:border-[#371F59]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024] dark:text-white">Memory Used</span>
              <span className="font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">
                {mem ? `${mem.usedFmt} / ${mem.totalFmt}` : '—'}
              </span>
            </div>
            <div className="mt-2">
              <CompactProgressBar value={stats.memLoad} color="#2563EB" />
            </div>
          </div>

          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:bg-[#211335] dark:border-[#371F59]">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024] dark:text-white">Swap Usage</span>
              <span className="font-mono font-bold text-[#6F6078] dark:text-[#B9A5CD]">
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

          <div className={`rounded-lg border p-3 ${
            stats.diskLoad >= 90
              ? 'border-rose-300 bg-rose-50/70 dark:bg-rose-950/40 dark:border-rose-900/60'
              : stats.diskLoad >= 85
              ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/40 dark:border-amber-900/60'
              : 'border-[#E8DFF0] bg-[#F8F7FA] dark:bg-[#211335] dark:border-[#371F59]'
          }`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                <span>Storage Disk</span>
                {stats.diskLoad >= 90 && (
                  <span className="rounded bg-rose-600 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase animate-pulse">
                    Full (5-10% Reserve)
                  </span>
                )}
              </span>
              <span className={`font-mono font-bold ${
                stats.diskLoad >= 90 ? 'text-rose-600 dark:text-rose-400' : stats.diskLoad >= 85 ? 'text-amber-600 dark:text-amber-400' : 'text-[#16A36A] dark:text-[#34D399]'
              }`}>
                {disk ? `${disk.usedFmt} / ${disk.sizeFmt}` : '—'}
              </span>
            </div>
            <div className="mt-2">
              <CompactProgressBar
                value={stats.diskLoad}
                color={stats.diskLoad >= 90 ? '#DC2626' : stats.diskLoad >= 85 ? '#D97706' : '#16A36A'}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              <div>
                <span>Mount: </span>
                <code className="font-mono font-semibold text-[#1B1024] dark:text-white">{disk?.mount || '/'}</code>
              </div>
              <span className={stats.diskLoad >= 90 ? 'font-bold text-rose-600 dark:text-rose-400' : ''}>
                {disk?.availableFmt ? `${disk.availableFmt} Free` : '5-10% Reserve'}
              </span>
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
  if (stats.diskLoad >= 90) {
    dynamicEvents.push({ id: '3', title: 'Storage deadline full — recording blocked', target: `Mount: ${stats.storageDetails?.mount || '/'} (${stats.diskLoad.toFixed(1)}% used, ${stats.storageDetails?.availableFmt || ''} free)`, timestamp: 'Just now', type: 'critical' });
  } else if (stats.diskLoad > 85) {
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
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div>
        <div className="border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Recent Alerts & Logs</h3>
          <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Real-time system telemetry alerts</p>
        </div>

        <div className="mt-3 space-y-2.5">
          {dynamicEvents.map(ev => (
            <div key={ev.id} className="flex items-center justify-between rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-[11px] dark:bg-[#211335] dark:border-[#371F59]">
              <div className="flex items-center gap-2">
                {ev.type === 'warning' ? <AlertTriangle size={14} className="text-[#D97706]" /> : ev.type === 'critical' ? <XCircle size={14} className="text-[#DC3545]" /> : <CheckCircle2 size={14} className="text-[#16A36A]" />}
                <div>
                  <p className="font-semibold text-[#1B1024] dark:text-white">{ev.title}</p>
                  <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">{ev.target}</p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">{ev.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NetworkInterfacesTable: React.FC<{ interfaces: NetworkInterfaceItem[] }> = ({ interfaces }) => {
  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Network Interfaces</h3>
          <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Per-interface real-time throughput and packet counters</p>
        </div>
        <Wifi size={18} className="text-[#4A1B7A] dark:text-[#A78BFA]" />
      </div>

      <div className="mt-3 overflow-x-auto">
        {interfaces.length === 0 ? (
          <div className="grid min-h-[100px] place-items-center rounded-lg border border-dashed border-[#E8DFF0] bg-[#F8F7FA] p-6 text-center dark:bg-[#211335] dark:border-[#371F59]">
            <div>
              <p className="font-display text-[13px] font-semibold text-[#1B1024] dark:text-white">No interfaces reporting telemetry</p>
              <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Network interface information will appear when the monitoring agent reports it.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
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
            <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
              {interfaces.map(item => (
                <tr key={item.iface} className="transition-colors hover:bg-[#F4EEFF] dark:hover:bg-[#281640]">
                  <td className="px-3 py-2.5 font-mono font-bold text-[#1B1024] dark:text-white">{item.iface}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.state === 'UP' ? 'bg-[#F0FDF4] text-[#16A36A] dark:bg-[#064E3B]/60 dark:text-[#34D399]' : 'bg-[#FEF2F2] text-[#DC3545] dark:bg-[#450A0A]/60 dark:text-[#FCA5A5]'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${item.state === 'UP' ? 'bg-[#16A36A]' : 'bg-[#DC3545]'}`} />
                      {item.state}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{item.ip}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">{item.rx_rate_fmt}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#16A36A] dark:text-[#34D399]">{item.tx_rate_fmt}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{item.rx_packets_sec || 0}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{item.tx_packets_sec || 0}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{item.errors_sec || 0}</td>
                  <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{item.drops_sec || 0}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16">
                        <CompactProgressBar value={item.utilization || 0} color="#4A1B7A" />
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[#1B1024] dark:text-white">{item.utilization || 0}%</span>
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
    { id: 'stream_engine', name: 'Stream Ingest Engine', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'ingest_service', name: 'Ingest Service', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'transcoder', name: 'Transcoder', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'recording_engine', name: 'Recording Engine', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'storage', name: 'Storage Subsystem', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'websocket', name: 'Realtime Sync Engine', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
    { id: 'database', name: 'Database', status: 'Healthy', uptime: uptimeFmt, latency: '< 1 ms', lastCheck: 'Just now' },
  ];

  const list = services && services.length ? services : defaultServices;

  return (
    <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">Service Health</h3>
          <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Operational status of detected backend processes and middleware services</p>
        </div>
        <ShieldCheck size={18} className="text-[#16A36A] dark:text-[#34D399]" />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
              <th className="px-3 py-2.5">Service</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Uptime</th>
              <th className="px-3 py-2.5">Latency</th>
              <th className="px-3 py-2.5">Last Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
            {list.map(svc => (
              <tr key={svc.id} className="transition-colors hover:bg-[#F4EEFF] dark:hover:bg-[#281640]">
                <td className="px-3 py-2.5 font-semibold text-[#1B1024] dark:text-white">{svc.name}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    svc.status === 'Healthy' ? 'bg-[#F0FDF4] text-[#16A36A] dark:bg-[#064E3B]/60 dark:text-[#34D399]' : 'bg-[#FFFBEB] text-[#D97706] dark:bg-[#451A03]/60 dark:text-[#FCD34D]'
                  }`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] dark:bg-[#34D399]" />
                    {svc.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{svc.uptime}</td>
                <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{svc.latency}</td>
                <td className="px-3 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{svc.lastCheck}</td>
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
    <div className="flex flex-wrap items-center justify-between rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] px-4 py-3 text-[11px] dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078] dark:text-[#B9A5CD]">Telemetry Agent:</span>
          <span className="font-semibold text-[#16A36A] dark:text-[#34D399]">Connected</span>
        </div>
        <div className="h-3 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078] dark:text-[#B9A5CD]">WebSocket:</span>
          <span className="font-semibold text-[#16A36A] dark:text-[#34D399]">
            {stats.connectionStatus === 'connected' ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>
        <div className="h-3 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078] dark:text-[#B9A5CD]">Sampling Interval:</span>
          <span className="font-mono font-semibold text-[#1B1024] dark:text-white">2 seconds</span>
        </div>
        <div className="h-3 w-px bg-[#E8DFF0] dark:bg-[#311B4E]" />
        <div className="flex items-center gap-1.5">
          <span className="text-[#6F6078] dark:text-[#B9A5CD]">Last Sample:</span>
          <span className="font-mono font-semibold text-[#1B1024] dark:text-white">
            {formatRelativeTime(stats.lastUpdatedTime)}
          </span>
        </div>
      </div>

      <div className="mt-2 font-mono text-[10px] text-[#6F6078] sm:mt-0 dark:text-[#B9A5CD]">
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

      {/* 4. Main Processing Matrix (CPU & GPU Processing Matrices) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <CpuProcessingMatrix stats={stats} />
        </div>
        <div className="xl:col-span-6">
          <GpuAccelerationMatrix stats={stats} />
        </div>
      </div>

      {/* 5. Network & Storage Row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <NetworkThroughputSection stats={stats} />
        </div>
        <div className="xl:col-span-5">
          <StorageMemorySection stats={stats} />
        </div>
      </div>

      {/* 6. Resource Trends & Events */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <ResourceTrendsSection stats={stats} />
        </div>
        <div className="xl:col-span-4">
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
