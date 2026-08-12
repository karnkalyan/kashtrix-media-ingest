import React, { useEffect, useState } from 'react';
import { FiActivity, FiCpu, FiDatabase, FiHardDrive, FiRefreshCw, FiWifi } from 'react-icons/fi';
import { subscribeRealtime } from '../services/realtime';

const initialStats = {
  cpuLoad: 0,
  memLoad: 0,
  diskLoad: 0,
  isHealthy: false,
  coreLoads: [] as number[],
  loadAvg: [0, 0, 0],
  runningProcesses: 0,
  timestamp: new Date().toISOString(),
  networkDetails: [] as any[],
  gpuDetails: { model: 'N/A', load: 0, memoryLoad: 0 },
  history: {
    cpu: Array(20).fill(0),
    mem: Array(20).fill(0),
    disk: Array(20).fill(0),
    rx: Array(20).fill(0),
    tx: Array(20).fill(0),
  },
  lastRx: 0,
  lastTx: 0,
  error: 'Connecting...',
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B/s';
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${sizes[index]}`;
};

const useSystemStats = () => {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    const maxHistory = 20;
    const nextHistory = (prev: any, key: keyof typeof prev.history, value: number) => ([...prev.history[key].slice(-maxHistory + 1), value]);
    return subscribeRealtime(message => {
      if (message.type !== 'system_stats' || !message.payload) return;
      const payload = message.payload;
      const totalRx = (payload.networkDetails || []).reduce((sum: number, item: any) => sum + (item.rx_sec || 0), 0);
      const totalTx = (payload.networkDetails || []).reduce((sum: number, item: any) => sum + (item.tx_sec || 0), 0);
      setStats(prev => ({
        ...prev,
        ...payload,
        isHealthy: true,
        error: '',
        lastRx: totalRx,
        lastTx: totalTx,
        history: {
          cpu: nextHistory(prev, 'cpu', payload.cpuLoad || 0),
          mem: nextHistory(prev, 'mem', payload.memLoad || 0),
          disk: nextHistory(prev, 'disk', payload.diskLoad || 0),
          rx: nextHistory(prev, 'rx', totalRx),
          tx: nextHistory(prev, 'tx', totalTx),
        },
      }));
    }, isConnected => {
      setStats(prev => ({
        ...prev,
        isHealthy: isConnected,
        error: isConnected ? '' : 'Realtime connection unavailable',
      }));
    });
  }, []);

  return stats;
};

const UsageCard: React.FC<{ label: string; value: number; icon: React.ReactNode; tone: string }> = ({ label, value, icon, tone }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="metric-value mt-1 text-2xl font-semibold text-slate-950">{(value || 0).toFixed(1)}%</p>
      </div>
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>{icon}</div>
    </div>
    <div className="mt-3 h-1.5 rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.min(value || 0, 100)}%` }} />
    </div>
  </div>
);

const SystemMonitor = () => {
  const stats = useSystemStats();
  const totalRx = stats.lastRx || 0;
  const totalTx = stats.lastTx || 0;

  const renderSparkline = (values: number[], color: string) => {
    const maxValue = Math.max(...values, 1);
    return (
      <div className="flex h-14 items-end gap-1">
        {values.map((value, index) => (
          <div
            key={`${color}-${index}`}
            className="h-full w-1.5 rounded-sm bg-blue-500 transition-all duration-300"
            style={{ height: `${Math.max(10, (value / maxValue) * 100)}%`, backgroundColor: color }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="system-monitor page-stack">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">System Monitor</h2>
            <p className="text-sm text-slate-500">Real-time server health for the transcoding engine.</p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${stats.isHealthy ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <span className={`h-2 w-2 rounded-full ${stats.isHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {stats.isHealthy ? 'Live' : stats.error}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <UsageCard label="CPU Load" value={stats.cpuLoad} icon={<FiCpu className="h-5 w-5 text-blue-700" />} tone="bg-blue-50" />
        <UsageCard label="Memory Usage" value={stats.memLoad} icon={<FiDatabase className="h-5 w-5 text-emerald-700" />} tone="bg-emerald-50" />
        <UsageCard label="Disk Load" value={stats.diskLoad} icon={<FiHardDrive className="h-5 w-5 text-amber-700" />} tone="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950"><FiWifi className="h-5 w-5 text-blue-600" /> Network Throughput</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Received</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-950">{formatBytes(totalRx)}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Transmitted</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-950">{formatBytes(totalTx)}</p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>Live throughput chart</span>
                <span className="text-xs text-slate-500">Last {stats.history.rx.length} samples</span>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Received</span>
                    <span>{formatBytes(totalRx)}</span>
                  </div>
                  {renderSparkline(stats.history.rx, '#0ea5e9')}
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Transmitted</span>
                    <span>{formatBytes(totalTx)}</span>
                  </div>
                  {renderSparkline(stats.history.tx, '#14b8a6')}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>Per-interface throughput</span>
                <span className="text-xs text-slate-500">Live update</span>
              </div>
              <div className="mt-3 space-y-2">
                {stats.networkDetails.length ? stats.networkDetails.map((item: any) => (
                  <div key={item.iface} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-700">{item.iface}</span>
                    <span className="font-mono text-xs text-slate-500">{item.rx_rate_fmt} down / {item.tx_rate_fmt} up</span>
                  </div>
                )) : <p className="text-sm text-slate-500">No active network interfaces reporting data.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950"><FiActivity className="h-5 w-5 text-blue-600" /> Processing Matrix</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Processes</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{stats.runningProcesses}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-4 md:col-span-2">
              <p className="text-sm text-slate-500">Load Average</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-950">{stats.loadAvg.map(value => (value || 0).toFixed(2)).join(' / ')}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">CPU Cores</p>
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-4">
              {stats.coreLoads.map((load, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Core {index + 1}</span>
                    <span>{(load || 0).toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.min(load || 0, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold text-slate-950"><FiActivity className="h-5 w-5 text-blue-600" /> Resource Trends</h3>
        <p className="mt-2 text-sm text-slate-500">Live CPU, memory, disk and network trends based on the latest system traffic.</p>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">CPU Trend</p>
              <div className="mt-3">{renderSparkline(stats.history.cpu, '#2563eb')}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Memory Trend</p>
              <div className="mt-3">{renderSparkline(stats.history.mem, '#0f766e')}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Disk Trend</p>
              <div className="mt-3">{renderSparkline(stats.history.disk, '#b45309')}</div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Network Trend</p>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Rx</span>
                  <span>{formatBytes(totalRx)}</span>
                </div>
                {renderSparkline(stats.history.rx, '#0ea5e9')}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Tx</span>
                  <span>{formatBytes(totalTx)}</span>
                </div>
                {renderSparkline(stats.history.tx, '#14b8a6')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-semibold text-slate-950"><FiRefreshCw className="h-5 w-5 text-blue-600" /> Last Update</h3>
        <p className="mt-2 font-mono text-sm text-slate-600">{new Date(stats.timestamp).toLocaleString()}</p>
      </section>
    </div>
  );
};

export default SystemMonitor;
