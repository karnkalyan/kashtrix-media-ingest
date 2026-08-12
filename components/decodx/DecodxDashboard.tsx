import React, { useEffect, useState } from 'react';
import { FiSmartphone, FiMonitor, FiRadio, FiUsers, FiActivity, FiRefreshCw, FiAlertCircle, FiCheckCircle, FiHardDrive, FiServer, FiShield, FiWifi } from 'react-icons/fi';
import StatCard from '../ui/StatCard';
import Card from '../ui/Card';
import StatusBadge from '../ui/StatusBadge';
import Button from '../ui/Button';

interface DecodxStats {
  total: number;
  activated: number;
  online: number;
  playing: number;
  buffering: number;
  errors: number;
  offline: number;
}

const DecodxDashboard: React.FC = () => {
  const [stats, setStats] = useState<DecodxStats>({
    total: 0,
    activated: 0,
    online: 0,
    playing: 0,
    buffering: 0,
    errors: 0,
    offline: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/v1/admin/stats', {
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch DecodX stats:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">DecodX Middleware Overview</h2>
          <p className="text-xs text-[var(--text-secondary)]">Real-time device runtime, decoder health, and active stream metrics</p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchStats} loading={loading}>
          <FiRefreshCw size={14} /> Refresh Stats
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard
          label="Total Devices"
          value={stats.total}
          icon={<FiSmartphone size={20} />}
          trend={{ value: 12.5, label: 'vs last month' }}
          loading={loading}
        />
        <StatCard
          label="Activated STBs"
          value={stats.activated}
          icon={<FiCheckCircle size={20} />}
          trend={{ value: 8.3, label: 'active accounts' }}
          loading={loading}
        />
        <StatCard
          label="Live Online"
          value={stats.online}
          icon={<FiWifi size={20} />}
          trend={{ value: 5.2, label: 'connected' }}
          loading={loading}
        />
        <StatCard
          label="Currently Playing"
          value={stats.playing}
          icon={<FiRadio size={20} />}
          trend={{ value: 15.7, label: 'streams' }}
          loading={loading}
        />
        <StatCard
          label="Errors / Stalls"
          value={stats.errors}
          icon={<FiAlertCircle size={20} />}
          trend={{ value: -2.1, label: 'issue rate' }}
          loading={loading}
        />
      </div>

      {/* System Status Overview Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stream Health Breakdown */}
        <Card className="lg:col-span-2">
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Device Runtime Status</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50/60 p-4 text-center">
              <span className="text-xs font-bold uppercase text-emerald-700">Playing</span>
              <p className="text-2xl font-extrabold text-emerald-900 mt-1">{stats.playing}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-sky-200 bg-sky-50/60 p-4 text-center">
              <span className="text-xs font-bold uppercase text-sky-700">Buffering</span>
              <p className="text-2xl font-extrabold text-sky-900 mt-1">{stats.buffering}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/60 p-4 text-center">
              <span className="text-xs font-bold uppercase text-amber-700">Idle</span>
              <p className="text-2xl font-extrabold text-amber-900 mt-1">{stats.online - stats.playing - stats.buffering - stats.errors}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50/60 p-4 text-center">
              <span className="text-xs font-bold uppercase text-red-700">Playback Errors</span>
              <p className="text-2xl font-extrabold text-red-900 mt-1">{stats.errors}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Infrastructure Health</h4>
            <div className="space-y-2">
              {[
                { name: 'DecodX WebSocket Server', status: 'Operational', details: 'Port 3100 (WS)' },
                { name: 'Stream Channel Resolver', status: 'Operational', details: 'Direct RTMP/HLS' },
                { name: 'STB Heartbeat Monitor', status: 'Operational', details: '30s Ping' },
                { name: 'APK Auto-Updater', status: 'Operational', details: 'V1.0.0 Push' },
              ].map((svc, i) => (
                <div key={i} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{svc.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{svc.details}</p>
                  </div>
                  <StatusBadge status={svc.status} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Middleware Quick Overview */}
        <Card>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Middleware Info</h3>
          <div className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-muted)] font-medium">Middleware Platform</span>
              <span className="font-bold text-[var(--primary)]">DecodX Engine</span>
            </div>
            <div className="flex justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-muted)] font-medium">Database ORM</span>
              <span className="font-bold text-[var(--text-primary)]">Prisma (MySQL)</span>
            </div>
            <div className="flex justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-muted)] font-medium">Device Protocol</span>
              <span className="font-bold text-[var(--text-primary)]">WebSocket / JSON</span>
            </div>
            <div className="flex justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-muted)] font-medium">Auth Mode</span>
              <span className="font-bold text-emerald-600">Single JWT Auth</span>
            </div>
            <div className="flex justify-between border-b border-[var(--border)] pb-2">
              <span className="text-[var(--text-muted)] font-medium">Admin API Key</span>
              <span className="font-mono text-xs text-[var(--text-muted)] truncate max-w-[140px]">DecoDxPremium...</span>
            </div>
          </div>

          <div className="mt-6 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--primary-50)] to-[var(--primary-100)] p-4 border border-[var(--primary-200)]">
            <p className="text-xs font-bold text-[var(--primary-dark)]">Device Quick Command</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Broadcast commands directly to all online Android STB devices instantly.</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DecodxDashboard;
