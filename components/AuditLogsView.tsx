import React, { useEffect, useState, useMemo } from 'react';
import {
  FiShield,
  FiRefreshCw,
  FiSearch,
  FiDownload,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiUser,
  FiCalendar,
  FiClock,
  FiFilter,
  FiActivity,
  FiRadio,
  FiServer,
  FiEye,
  FiCopy,
  FiCheck,
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
  FiHardDrive,
  FiSliders,
  FiX,
  FiDisc
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import DetailDrawer from './ui/DetailDrawer';

export interface AuditLogItem {
  id: number;
  user_id?: number | null;
  userId?: number | null;
  username: string;
  user_role?: string;
  userRole?: string;
  action: string;
  entity_type?: string;
  entityType?: string;
  type?: string;
  entity_id?: string | null;
  entityId?: string | null;
  targetId?: string | null;
  details: Record<string, any>;
  ip_address?: string;
  ipAddress?: string;
  user_agent?: string;
  userAgent?: string;
  status: string;
  created_at?: string;
  createdAt?: string;
}

interface AuditLogsResponse {
  logs: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

export const getLogDate = (log?: AuditLogItem | null): string => {
  if (!log) return '';
  return log.created_at || log.createdAt || log.details?.timestamp || '';
};

export const getLogRole = (log?: AuditLogItem | null): string => {
  if (!log) return 'system';
  return log.user_role || log.userRole || log.details?.userRole || 'system';
};

export const getLogType = (log?: AuditLogItem | null): string => {
  if (!log) return 'SYSTEM';
  return log.entity_type || log.type || log.entityType || 'SYSTEM';
};

export const getLogTarget = (log?: AuditLogItem | null): string | null => {
  if (!log) return null;
  return log.entity_id || log.entityId || log.targetId || null;
};

export const getLogIp = (log?: AuditLogItem | null): string => {
  if (!log) return 'Localhost / Internal';
  return log.ip_address || log.ipAddress || 'Localhost / Internal';
};

export const formatAuditDate = (dateVal?: any, tz: string = 'Asia/Kathmandu'): string => {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);
    const tzLabel = tz === 'Asia/Kathmandu' ? 'NPT +05:45' : tz;
    return `${formatted} (${tzLabel})`;
  } catch (_) {
    try {
      return new Date(dateVal).toLocaleString();
    } catch {
      return String(dateVal);
    }
  }
};

export const AuditLogsView: React.FC<{
  currentUserRole?: string;
  timezone?: string;
}> = ({ currentUserRole, timezone = 'Asia/Kathmandu' }) => {
  const canViewAuditLogs = ['superadmin', 'admin'].includes((currentUserRole || '').toLowerCase().trim());

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedLog) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedLog(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedLog]);

  const fetchLogs = async (targetPage = page) => {
    if (!canViewAuditLogs) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(limit));

      if (search.trim()) params.set('search', search.trim());
      if (entityType !== 'ALL') params.set('type', entityType);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const now = new Date();
      if (dateRange === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        params.set('from', startOfDay);
      } else if (dateRange === 'week') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        params.set('from', lastWeek);
      } else if (dateRange === 'month') {
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        params.set('from', lastMonth);
      }

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied: Audit logs are restricted to Superadmin accounts only.');
        }
        throw new Error(`Failed to load audit logs (${res.status})`);
      }

      const data: AuditLogsResponse = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      toast.error(err.message || 'Error loading audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [entityType, statusFilter, dateRange]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const exportLogs = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/audit-logs/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: entityType !== 'ALL' ? entityType : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: search.trim() || undefined,
          format
        })
      });

      if (!res.ok) throw new Error('Export failed');

      if (format === 'csv') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kashtrix_streamops_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Audit logs CSV exported');
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kashtrix_streamops_audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Audit logs JSON exported');
      }
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const copyDetailsToClipboard = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopied(true);
    toast.success('Audit details copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Metrics summary
  const metrics = useMemo(() => {
    const recordingOps = logs.filter(l => l.entity_type === 'RECORDING').length;
    const authOps = logs.filter(l => l.entity_type === 'AUTH' || l.entity_type === 'USER').length;
    const warningsAndErrors = logs.filter(l => l.status === 'WARNING' || l.status === 'FAILURE').length;
    return {
      totalLogs: total,
      recordingOps,
      authOps,
      warningsAndErrors
    };
  }, [logs, total]);

  if (!canViewAuditLogs) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <FiAlertTriangle className="mx-auto h-12 w-12 text-rose-600 dark:text-rose-400" />
          <h2 className="mt-4 text-lg font-bold text-rose-950 dark:text-rose-200">
            Administrator Access Required
          </h2>
          <p className="mt-2 text-xs text-rose-800 dark:text-rose-300 max-w-md mx-auto">
            Security audit logs contain sensitive operational telemetry, user authentication records, and system-level events. Access is restricted to authenticated Administrator and Superadmin accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[#E8DFF0] pb-5 dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shadow-xs">
              <FiShield size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#1B1024] dark:text-white">
                Security & Operational Audit Logs
              </h1>
              <p className="text-[12px] text-[#6F6078] dark:text-[#A798B5]">
                Immutable, user-wise & task-wise tracking of every recording, channel, user, and security event
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLogs(page)}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#1B1024] hover:bg-[#F8F7FA] disabled:opacity-50 dark:border-[#371F59] dark:bg-[#211335] dark:text-white dark:hover:bg-[#2D1A45] shadow-xs transition-colors"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <div className="relative inline-flex rounded-lg shadow-xs">
            <button
              onClick={() => exportLogs('csv')}
              disabled={exporting || loading}
              className="flex h-9 items-center gap-1.5 rounded-l-lg border border-r-0 border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#1B1024] hover:bg-[#F8F7FA] disabled:opacity-50 dark:border-[#371F59] dark:bg-[#211335] dark:text-white dark:hover:bg-[#2D1A45] transition-colors"
            >
              <FiDownload size={14} />
              Export CSV
            </button>
            <button
              onClick={() => exportLogs('json')}
              disabled={exporting || loading}
              className="flex h-9 items-center rounded-r-lg border border-[#E8DFF0] bg-white px-2.5 text-[12px] font-semibold text-[#6F6078] hover:bg-[#F8F7FA] disabled:opacity-50 dark:border-[#371F59] dark:bg-[#211335] dark:text-[#A798B5] dark:hover:bg-[#2D1A45] transition-colors"
              title="Export as JSON"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:border-[#311B4E] dark:bg-[#190E28]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5]">
              Total Audit Entries
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#F4EEFF] text-[#7C3AED] dark:bg-[#281542] dark:text-[#C4B5FD]">
              <FiShield size={14} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-[#1B1024] dark:text-white">
            {metrics.totalLogs.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#6F6078] dark:text-[#8E78A6]">
            Immutable tamper-evident records
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:border-[#311B4E] dark:bg-[#190E28]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5]">
              Recording Sessions
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <FiRadio size={14} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-[#1B1024] dark:text-white">
            {metrics.recordingOps.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#6F6078] dark:text-[#8E78A6]">
            Starts, stops, auto-stops & formats
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:border-[#311B4E] dark:bg-[#190E28]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5]">
              User & Auth Actions
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <FiUser size={14} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-[#1B1024] dark:text-white">
            {metrics.authOps.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#6F6078] dark:text-[#8E78A6]">
            Logins, role assignments & changes
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:border-[#311B4E] dark:bg-[#190E28]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5]">
              Alerts & Auto-Stops
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <FiAlertCircle size={14} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            {metrics.warningsAndErrors.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#6F6078] dark:text-[#8E78A6]">
            Buffer overruns & hardware bottlenecks
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:border-[#311B4E] dark:bg-[#190E28]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#94A3B8]" size={14} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by action, username, stream key, device, or error message..."
              className="h-9 w-full rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-9 pr-3 text-[12px] text-[#1B1024] outline-none transition-colors focus:border-[#7C3AED] dark:border-[#371F59] dark:bg-[#211335] dark:text-white dark:placeholder-[#8E78A6]"
            />
          </form>

          {/* Quick Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6F6078] dark:text-[#A798B5]">
              <FiFilter size={13} />
              <span>Type:</span>
            </div>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="h-9 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-semibold text-[#1B1024] outline-none focus:border-[#7C3AED] dark:border-[#371F59] dark:bg-[#211335] dark:text-white"
            >
              <option value="ALL">All Categories</option>
              <option value="RECORDING">Recording Operations</option>
              <option value="AUTH">Authentication</option>
              <option value="USER">User Management</option>
              <option value="CHANNEL">Channels</option>
              <option value="SYSTEM">System & Engine</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-semibold text-[#1B1024] outline-none focus:border-[#7C3AED] dark:border-[#371F59] dark:bg-[#211335] dark:text-white"
            >
              <option value="ALL">All Outcomes</option>
              <option value="SUCCESS">Success Only</option>
              <option value="WARNING">Warnings / Auto-Stops</option>
              <option value="FAILURE">Failures</option>
            </select>

            {/* Date Range */}
            <div className="flex rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 text-[11px] font-semibold dark:border-[#371F59] dark:bg-[#211335]">
              {(['all', 'today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setDateRange(range)}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    dateRange === range
                      ? 'bg-[#7C3AED] text-white shadow-xs'
                      : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#A798B5] dark:hover:text-white'
                  }`}
                >
                  {range === 'all' ? 'All Time' : range === 'today' ? 'Today' : range === 'week' ? '7 Days' : '30 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-xs dark:border-[#311B4E] dark:bg-[#190E28]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-extrabold uppercase tracking-wider text-[#6F6078] dark:border-[#311B4E] dark:bg-[#211335] dark:text-[#A798B5]">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User / Initiator</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Target / Entity</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Details Summary</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
              {logs.map(log => {
                const isOverrunOrAutoStop =
                  log.action === 'RECORDING_AUTO_STOPPED' ||
                  log.details?.bufferOverrunCount > 0 ||
                  log.status === 'WARNING';
                const isFailure = log.status === 'FAILURE' || log.action?.includes('FAILED');

                return (
                  <tr
                    key={log.id}
                    className={`transition-colors hover:bg-[#F8F7FA] dark:hover:bg-[#211335]/70 ${
                      isOverrunOrAutoStop
                        ? 'bg-amber-50/40 dark:bg-amber-950/20'
                        : isFailure
                        ? 'bg-rose-50/40 dark:bg-rose-950/20'
                        : ''
                    }`}
                  >
                    {/* Timestamp */}
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[#6F6078] dark:text-[#A798B5]">
                      <div className="flex items-center gap-1.5">
                        <FiClock size={12} className="text-[#94A3B8]" />
                        <span>{formatAuditDate(getLogDate(log), timezone)}</span>
                      </div>
                    </td>

                    {/* User & Role */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#F4EEFF] text-[10px] font-black text-[#7C3AED] dark:bg-[#371F59] dark:text-[#C4B5FD]">
                          {(log.username || 'S').charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold text-[#1B1024] dark:text-white leading-tight">
                            {log.username || 'System'}
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD]">
                            {getLogRole(log)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
                        log.action === 'STORAGE_CRITICAL_STOP'
                          ? 'border border-rose-500 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200 animate-pulse font-extrabold'
                          : log.action === 'STORAGE_CAPACITY_WARNING'
                          ? 'border border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 font-bold'
                          : log.action === 'RECORDING_AUTO_STOPPED'
                          ? 'border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 animate-pulse'
                          : log.action === 'RECORDING_DOWNLOADED'
                          ? 'border border-purple-300 bg-purple-100 text-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-200'
                          : log.action === 'RECORDING_STARTED'
                          ? 'border border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                          : log.action === 'RECORDING_STOPPED'
                          ? 'border border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200'
                          : log.action === 'RECORDING_DELETED'
                          ? 'border border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200'
                          : log.action === 'USER_LOGIN'
                          ? 'border border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'border border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Category */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded bg-[#F8F7FA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:text-[#A798B5] border border-[#E8DFF0] dark:border-[#371F59]">
                        {getLogType(log)}
                      </span>
                    </td>

                    {/* Target / Entity */}
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[#1B1024] dark:text-white">
                      {getLogTarget(log) ? (
                        <span className="truncate max-w-[180px] inline-block" title={getLogTarget(log)!}>
                          {getLogTarget(log)}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>

                    {/* Outcome Badge */}
                    <td className="whitespace-nowrap px-4 py-3">
                      {log.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <FiCheckCircle size={11} /> SUCCESS
                        </span>
                      ) : log.status === 'WARNING' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                          <FiAlertTriangle size={11} /> WARNING
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
                          <FiXCircle size={11} /> FAILURE
                        </span>
                      )}
                    </td>

                    {/* Details Preview */}
                    <td className="px-4 py-3 text-[11px] text-[#6F6078] dark:text-[#A798B5] max-w-xs truncate">
                      {log.action === 'RECORDING_STARTED' ? (
                        <div>
                          <div>
                            <strong>{log.details?.videoDevice || log.details?.sourceType || 'stream'}</strong> • {Array.isArray(log.details?.formats) ? log.details.formats.join(', ').toUpperCase() : (log.details?.formats || 'MP4').toUpperCase()} • {log.details?.resolution || ''} {log.details?.framerate ? log.details.framerate + 'fps' : ''} {log.details?.videoBitrate ? `${Math.round(log.details.videoBitrate / 1000)}Mbps` : ''} {log.details?.formatCode ? `[${log.details.formatCode}]` : ''}
                          </div>
                          {(log.details?.presetName || log.details?.presetId) && (
                            <div className="mt-0.5">
                              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                <FiSliders size={10} /> Preset: {log.details.presetName || log.details.presetId}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : log.action === 'STORAGE_CAPACITY_WARNING' ? (
                        <span className="font-bold text-amber-700 dark:text-amber-300">
                          {log.details?.message || `Storage ${log.details?.usePercent}% full (${log.details?.availableFmt} free)`}
                        </span>
                      ) : log.action === 'STORAGE_CRITICAL_STOP' ? (
                        <span className="font-bold text-rose-700 dark:text-rose-300 animate-pulse">
                          DISK CRITICAL ({log.details?.usePercent || 0}% full) • Auto-halted {log.details?.targetApp || ''}/{log.details?.targetStream || ''}
                        </span>
                      ) : log.action === 'RECORDING_DOWNLOADED' ? (
                        <span className="text-purple-800 dark:text-purple-300 font-medium">
                          <strong>{log.details?.fileName || getLogTarget(log)}</strong> ({log.details?.fileSize ? formatBytes(log.details.fileSize) : 'Direct Stream'}) by <strong>{log.username}</strong>
                        </span>
                      ) : log.action === 'RECORDING_AUTO_STOPPED' ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          Buffer overrun halt: {log.details?.bufferOverrunCount || 0} drops over {log.details?.durationSec || 0}s
                        </span>
                      ) : log.action === 'RECORDING_STOPPED' ? (
                        <span>
                          Duration: {log.details?.durationSec}s • Files: {log.details?.completedFiles?.length || 0} written
                        </span>
                      ) : log.action === 'RECORDING_DELETED' ? (
                        <span>
                          File: {log.details?.fileName}
                        </span>
                      ) : log.action === 'USER_CREATED' || log.action === 'USER_UPDATED' ? (
                        <span>
                          User: {log.details?.createdUsername || log.details?.targetUsername} (Role: {log.details?.assignedRole})
                        </span>
                      ) : (
                        <span>{JSON.stringify(log.details || {})}</span>
                      )}
                    </td>

                    {/* Inspect Button */}
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#7C3AED] hover:bg-[#F4EEFF] dark:border-[#371F59] dark:bg-[#211335] dark:text-[#C4B5FD] dark:hover:bg-[#2D1A45] shadow-2xs transition-colors"
                      >
                        <FiEye size={12} /> Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}

              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#6F6078] dark:text-[#8E78A6]">
                    <FiShield size={32} className="mx-auto mb-2 text-[#C4B5FD]" />
                    <p className="font-semibold">No audit logs matching your current filters.</p>
                    <p className="text-[11px] mt-1">Try broadening your search query or date range.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-[#E8DFF0] bg-[#F8F7FA] px-4 py-3 text-[11px] text-[#6F6078] dark:border-[#311B4E] dark:bg-[#211335] dark:text-[#A798B5]">
          <div>
            Showing <span className="font-bold text-[#1B1024] dark:text-white">{logs.length}</span> of <span className="font-bold text-[#1B1024] dark:text-white">{total}</span> total events
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs(page - 1)}
              disabled={page <= 1 || loading}
              className="flex h-7 items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 font-semibold text-[#1B1024] hover:bg-[#F8F7FA] disabled:opacity-40 dark:border-[#371F59] dark:bg-[#190E28] dark:text-white"
            >
              <FiChevronLeft size={14} /> Previous
            </button>
            <span className="font-bold text-[#1B1024] dark:text-white">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages || loading}
              className="flex h-7 items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 font-semibold text-[#1B1024] hover:bg-[#F8F7FA] disabled:opacity-40 dark:border-[#371F59] dark:bg-[#190E28] dark:text-white"
            >
              Next <FiChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Centered Audit Event Telemetry Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
        >
          {/* Backdrop with blur & click to close */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-[fade-in_0.15s_ease-out]"
            onClick={() => setSelectedLog(null)}
          />

          {/* Modal Dialog Container */}
          <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-[#E8DFF0] bg-white shadow-2xl dark:border-[#371F59] dark:bg-[#160C24] overflow-hidden z-10 animate-[scale-in_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E8DFF0] px-5 py-4 dark:border-[#311B4E] shrink-0 bg-[#FBF9FD] dark:bg-[#1A0F2B]">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`grid h-10 w-10 place-items-center rounded-xl shadow-xs shrink-0 ${
                  selectedLog.action === 'STORAGE_CRITICAL_STOP' || selectedLog.status === 'FAILURE'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                    : selectedLog.action === 'STORAGE_CAPACITY_WARNING' || selectedLog.status === 'WARNING'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                    : selectedLog.action === 'RECORDING_STARTED'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300'
                }`}>
                  {selectedLog.action.includes('STORAGE') ? (
                    <FiHardDrive size={20} />
                  ) : selectedLog.action.includes('RECORDING') ? (
                    <FiDisc size={20} />
                  ) : (
                    <FiShield size={20} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 id="audit-modal-title" className="text-base sm:text-lg font-black text-[#1B1024] dark:text-white leading-snug break-all">
                      {selectedLog.action}
                    </h2>
                    <span className="rounded-md bg-purple-100/80 px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#7C3AED] dark:bg-[#371F59] dark:text-[#C4B5FD] font-mono">
                      #{String(selectedLog.id)}
                    </span>
                    {selectedLog.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <FiCheckCircle size={11} /> SUCCESS
                      </span>
                    ) : selectedLog.status === 'WARNING' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                        <FiAlertTriangle size={11} /> WARNING
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
                        <FiXCircle size={11} /> FAILURE
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#6F6078] dark:text-[#A798B5] truncate">
                    {getLogType(selectedLog)} event triggered by <strong className="text-[#1B1024] dark:text-white">{selectedLog.username || 'system'}</strong> ({getLogRole(selectedLog)}) • Target: {getLogTarget(selectedLog) || 'System Engine'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#E8DFF0] text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#1B1024] dark:border-[#371F59] dark:text-[#A798B5] dark:hover:bg-[#211335] dark:hover:text-white transition-colors shrink-0 ml-3"
                aria-label="Close modal"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {/* Prominent Full Message Callout Banner */}
              {selectedLog.details?.message && (
                <div className={`rounded-xl border p-4 shadow-xs ${
                  selectedLog.action === 'STORAGE_CAPACITY_WARNING' || selectedLog.status === 'WARNING'
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100'
                    : selectedLog.status === 'FAILURE' || selectedLog.action === 'STORAGE_CRITICAL_STOP'
                    ? 'border-rose-300 bg-rose-50 dark:border-rose-700/60 dark:bg-rose-950/40 text-rose-950 dark:text-rose-100'
                    : 'border-purple-200 bg-purple-50 dark:border-purple-800/60 dark:bg-purple-950/40 text-purple-950 dark:text-purple-100'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {selectedLog.action.includes('STORAGE') ? (
                        <FiHardDrive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : selectedLog.status === 'WARNING' ? (
                        <FiAlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      ) : selectedLog.status === 'FAILURE' ? (
                        <FiAlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      ) : (
                        <FiCheckCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">
                        Audit Message / Event Notice
                      </div>
                      <p className="mt-1 text-[13px] font-bold leading-relaxed whitespace-pre-wrap break-words">
                        {selectedLog.details.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Highlight for Storage Capacity Alert */}
              {(selectedLog.action === 'STORAGE_CAPACITY_WARNING' || selectedLog.details?.usePercent != null) && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/30 dark:text-amber-100 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 font-bold text-[13px]">
                      <FiHardDrive className="text-amber-600 dark:text-amber-400" size={18} />
                      Storage Capacity Telemetry Details
                    </div>
                    <span className="font-mono text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                      Mount: {selectedLog.details?.mount || '/'} • Warning Threshold: {selectedLog.details?.thresholdPercent || 90}%
                    </span>
                  </div>

                  {/* Visual Storage Meter */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span>Filesystem Disk Usage</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-black">{selectedLog.details?.usePercent || 0}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-amber-200/80 dark:bg-amber-950 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          Number(selectedLog.details?.usePercent || 0) >= 95
                            ? 'bg-rose-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, Number(selectedLog.details?.usePercent || 0)))}%` }}
                      />
                    </div>
                  </div>

                  {/* 4 Stats Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 font-mono text-[11px]">
                    <div className="bg-white/80 dark:bg-[#201132] p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                      <div className="text-[10px] uppercase text-amber-800 dark:text-amber-300 font-bold">Disk Used</div>
                      <div className="font-black text-[15px] text-rose-600 dark:text-rose-400 mt-0.5">{selectedLog.details?.usePercent}%</div>
                    </div>
                    <div className="bg-white/80 dark:bg-[#201132] p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                      <div className="text-[10px] uppercase text-amber-800 dark:text-amber-300 font-bold">Used Space</div>
                      <div className="font-bold text-[13px] mt-0.5">{selectedLog.details?.usedFmt || '—'}</div>
                    </div>
                    <div className="bg-white/80 dark:bg-[#201132] p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                      <div className="text-[10px] uppercase text-amber-800 dark:text-amber-300 font-bold">Free Space</div>
                      <div className="font-bold text-[13px] mt-0.5 text-emerald-600 dark:text-emerald-400">{selectedLog.details?.availableFmt || '—'}</div>
                    </div>
                    <div className="bg-white/80 dark:bg-[#201132] p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                      <div className="text-[10px] uppercase text-amber-800 dark:text-amber-300 font-bold">Total Capacity</div>
                      <div className="font-bold text-[13px] mt-0.5">{selectedLog.details?.sizeFmt || '—'}</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-900 dark:text-amber-200 pt-2 font-medium">
                    <strong>Recommended System Action:</strong> Harddisk capacity is approaching limit. Please monitor free storage space and archive or clean up old recordings.
                  </div>
                </div>
              )}

              {/* Special Highlight for Storage Critical Stop */}
              {selectedLog.action === 'STORAGE_CRITICAL_STOP' && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-[13px]">
                    <FiAlertTriangle className="text-rose-600 dark:text-rose-400" size={18} />
                    Emergency Auto-Stop: Disk Storage Critical Full
                  </div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    <div>
                      <span className="font-semibold">Disk Usage:</span>{' '}
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{selectedLog.details?.usePercent || 0}%</span>
                    </div>
                    {selectedLog.details?.stoppedKeys && (
                      <div>
                        <span className="font-semibold">Halted Recordings:</span>{' '}
                        <span className="font-mono font-bold">{selectedLog.details.stoppedKeys.join(', ')}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">Safety Action:</span>{' '}
                      <span>Recording processes were halted cleanly via SIGTERM before filesystem exhaustion to prevent corrupted moov atoms and file truncation.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Highlight for Loaded Preset & Pipeline Details */}
              {(selectedLog.action === 'RECORDING_STARTED' || selectedLog.details?.presetName || selectedLog.details?.presetId || selectedLog.details?.presetDetails) && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-purple-950 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 font-bold text-[13px]">
                      <FiSliders className="text-purple-600 dark:text-purple-400" size={17} />
                      Loaded Recording Preset & Pipeline Details
                    </div>
                    {(selectedLog.details?.presetName || selectedLog.details?.presetId) && (
                      <span className="rounded-lg bg-purple-200/80 dark:bg-purple-900/70 px-2.5 py-0.5 text-[11px] font-extrabold text-purple-900 dark:text-purple-200">
                        {selectedLog.details.presetName || selectedLog.details.presetId}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
                    {selectedLog.details?.presetId && (
                      <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                        <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Preset ID</span>
                        <span className="font-mono font-bold mt-0.5 block break-all">{selectedLog.details.presetId}</span>
                      </div>
                    )}

                    <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                      <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Resolution & Framerate</span>
                      <span className="font-bold mt-0.5 block">{selectedLog.details?.resolution || 'source'} @ {selectedLog.details?.framerate || 25} fps</span>
                    </div>

                    <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                      <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Video Codec & Encoder</span>
                      <span className="font-bold uppercase mt-0.5 block">{selectedLog.details?.videoCodec || 'auto'} ({selectedLog.details?.encoder || 'auto'})</span>
                    </div>

                    <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                      <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Bitrate & Rate Control</span>
                      <span className="font-bold mt-0.5 block">{selectedLog.details?.videoBitrate ? `${selectedLog.details.videoBitrate} kbps` : 'Auto'} ({selectedLog.details?.rateControl || 'cbr'})</span>
                    </div>

                    <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                      <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Audio Codec & Bitrate</span>
                      <span className="font-bold uppercase mt-0.5 block">{selectedLog.details?.audioCodec || 'aac'} • {selectedLog.details?.audioBitrate || 192} kbps ({selectedLog.details?.sampleRate || 48000} Hz)</span>
                    </div>

                    <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                      <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Containers & Format</span>
                      <span className="font-bold uppercase mt-0.5 block">{Array.isArray(selectedLog.details?.formats) ? selectedLog.details.formats.join(', ') : (selectedLog.details?.format || 'mp4')} • {selectedLog.details?.pixelFormat || 'yuv420p'}</span>
                    </div>

                    {selectedLog.details?.formatCode && (
                      <div className="rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                        <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">SDI Format Code</span>
                        <span className="font-mono font-bold mt-0.5 block">{selectedLog.details.formatCode} ({selectedLog.details?.videoInput || 'sdi'})</span>
                      </div>
                    )}

                    {selectedLog.details?.storagePath && (
                      <div className="col-span-2 rounded-xl border border-purple-200/60 bg-white/80 p-2.5 dark:border-purple-800/60 dark:bg-[#201132]">
                        <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">Storage Path ({selectedLog.details?.storageType || 'local'})</span>
                        <span className="font-mono font-bold text-[11px] break-all mt-0.5 block">{selectedLog.details.storagePath}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Special Highlight for Buffer Overruns / Auto-Stops */}
              {(selectedLog.action === 'RECORDING_AUTO_STOPPED' || selectedLog.details?.bufferOverrunCount > 0) && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-[13px]">
                    <FiAlertTriangle className="text-amber-600 dark:text-amber-400" size={18} />
                    Hardware I/O Bottleneck Telemetry
                  </div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    <div>
                      <span className="font-semibold">Buffer Overrun Drop Count:</span>{' '}
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{selectedLog.details?.bufferOverrunCount || 0} dropped frames</span>
                    </div>
                    <div>
                      <span className="font-semibold">Auto-Stop Threshold:</span>{' '}
                      <span>Triggered after sustained 25+ seconds of DeckLink PCIe/Disk write buffer overruns</span>
                    </div>
                    <div>
                      <span className="font-semibold">Safety Action:</span>{' '}
                      <span>Session cleanly flushed and finalized via SIGTERM to protect media container integrity.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Highlight for Recording Download */}
              {selectedLog.action === 'RECORDING_DOWNLOADED' && (
                <div className="rounded-xl border border-purple-300 bg-purple-50 p-4 text-purple-950 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-[13px]">
                    <FiDownload className="text-purple-600 dark:text-purple-400" size={18} />
                    Media Asset Download Audit Trail
                  </div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    <div>
                      <span className="font-semibold">Downloaded File:</span>{' '}
                      <span className="font-mono font-bold">{selectedLog.details?.fileName || selectedLog.entity_id}</span>
                    </div>
                    <div>
                      <span className="font-semibold">File Size:</span>{' '}
                      <span>{selectedLog.details?.fileSize ? formatBytes(selectedLog.details.fileSize) : 'Direct Stream'}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Operator:</span>{' '}
                      <span>{selectedLog.username} ({getLogRole(selectedLog)})</span>
                    </div>
                    <div>
                      <span className="font-semibold">Client IP & Agent:</span>{' '}
                      <span>{getLogIp(selectedLog)} ({selectedLog.details?.userAgent || selectedLog.user_agent || 'Standard Client'})</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Overview Card */}
              <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 dark:border-[#371F59] dark:bg-[#211335]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5] flex items-center gap-1">
                      <FiClock size={11} /> Timestamp
                    </span>
                    <div className="font-mono text-[11px] font-semibold text-[#1B1024] dark:text-white mt-1 break-words">
                      {formatAuditDate(getLogDate(selectedLog), timezone)}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5] flex items-center gap-1">
                      <FiUser size={11} /> Operator & Role
                    </span>
                    <div className="text-[11px] font-semibold text-[#1B1024] dark:text-white mt-1 break-all flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{selectedLog.username || 'system'}</span>
                      <span className="inline-block rounded bg-[#EFE8F6] px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[#7C3AED] dark:bg-[#371F59] dark:text-[#C4B5FD]">
                        {getLogRole(selectedLog)}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5] flex items-center gap-1">
                      <FiActivity size={11} /> Execution Status
                    </span>
                    <div className="mt-1">
                      {selectedLog.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <FiCheckCircle size={12} /> SUCCESS
                        </span>
                      ) : selectedLog.status === 'WARNING' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                          <FiAlertTriangle size={12} /> WARNING
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
                          <FiXCircle size={12} /> FAILURE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5] flex items-center gap-1">
                      <FiServer size={11} /> Client IP
                    </span>
                    <div className="font-mono text-[11px] font-semibold text-[#1B1024] dark:text-white mt-1 break-all">
                      {getLogIp(selectedLog)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Complete Telemetry Payload (JSON) with full wrap */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:text-[#A798B5]">
                    Complete Telemetry Payload (JSON)
                  </span>
                  <button
                    type="button"
                    onClick={copyDetailsToClipboard}
                    className="text-[11px] font-bold text-[#7C3AED] dark:text-[#C4B5FD] hover:underline flex items-center gap-1"
                  >
                    {copied ? <FiCheck size={12} className="text-emerald-500" /> : <FiCopy size={12} />}
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="max-h-80 overflow-y-auto rounded-xl border border-[#E8DFF0] bg-[#11071F] p-4 font-mono text-[11px] text-[#A78BFA] dark:border-[#371F59] whitespace-pre-wrap break-all leading-relaxed">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-[#E8DFF0] px-6 py-3.5 bg-[#FBF9FD] dark:border-[#311B4E] dark:bg-[#1A0F2B] shrink-0">
              <button
                type="button"
                onClick={copyDetailsToClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#1B1024] hover:bg-[#F8F7FA] dark:border-[#371F59] dark:bg-[#211335] dark:text-white shadow-xs"
              >
                {copied ? <FiCheck size={14} className="text-emerald-500" /> : <FiCopy size={14} />}
                {copied ? 'Copied Full JSON!' : 'Copy Full JSON'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg bg-[#7C3AED] px-5 py-1.5 text-[12px] font-bold text-white hover:bg-[#6D28D9] shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsView;
