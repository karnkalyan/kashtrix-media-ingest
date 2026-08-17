import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Filter,
  Search,
  RefreshCw,
  Bell,
  SlidersHorizontal,
  Clock
} from 'lucide-react';
import Card from './ui/Card';
import PageHeader from './ui/PageHeader';
import SegmentedControl from './ui/SegmentedControl';

export interface EventItem {
  id: string;
  title: string;
  category: 'Stream' | 'Transcoder' | 'Storage' | 'System' | 'License';
  severity: 'critical' | 'warning' | 'info' | 'success';
  source: string;
  details: string;
  timestamp: string;
}

const mockEvents: EventItem[] = [
  { id: '1', title: 'High CPU Utilization (>88%)', category: 'System', severity: 'warning', source: 'stream-node-01', details: 'Transcoder CPU load peaked at 88.4% across 16 cores.', timestamp: '2 minutes ago' },
  { id: '2', title: 'Telemetry Data Stream Restored', category: 'System', severity: 'success', source: 'Realtime Sync Engine', details: 'Reconnected to hardware monitoring daemon.', timestamp: '14 minutes ago' },
  { id: '3', title: 'Interface eth0 State UP', category: 'System', severity: 'info', source: 'eth0 (192.168.1.10)', details: 'Link state UP at 1000Mbps Full Duplex.', timestamp: '45 minutes ago' },
  { id: '4', title: 'Stream Session Initialized', category: 'Stream', severity: 'info', source: 'rtmp://live/main-feed', details: 'Incoming RTMP publisher connected successfully.', timestamp: '1 hour ago' },
  { id: '5', title: 'Storage Warning (>85% Full)', category: 'Storage', severity: 'warning', source: '/var/media/recordings', details: 'Partition storage usage reached 86.2% capacity.', timestamp: '2 hours ago' },
  { id: '6', title: 'Transcoder Engine Started', category: 'Transcoder', severity: 'success', source: 'Transcoder Engine', details: 'Channel Main Feed initialized with NVENC profile.', timestamp: '3 hours ago' },
  { id: '7', title: 'License Validated', category: 'License', severity: 'success', source: 'HWID KTX-8F4A', details: 'PRO License hardware binding verified.', timestamp: '5 hours ago' },
];

export const EventsAndAlerts: React.FC = () => {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info' | 'success'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = mockEvents.filter(ev => {
    const matchesSev = severityFilter === 'all' || ev.severity === severityFilter;
    const matchesSearch = ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ev.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ev.details.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSev && matchesSearch;
  });

  return (
    <div className="events-workspace page-stack space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">Events & Alerts</h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Central operations event log, alerts, and infrastructure audit trail
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search event log..."
              className="h-8 w-52 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
            />
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
          </div>

          <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#351147] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD] dark:hover:bg-[#2D1A45] dark:hover:text-white">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8DFF0] bg-white px-4 py-2.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <SegmentedControl
          size="sm"
          value={severityFilter}
          onChange={val => setSeverityFilter(val as any)}
          options={[
            { value: 'all', label: 'All Events', badge: mockEvents.length },
            { value: 'critical', label: 'Critical', badge: mockEvents.filter(e => e.severity === 'critical').length },
            { value: 'warning', label: 'Warnings', badge: mockEvents.filter(e => e.severity === 'warning').length },
            { value: 'info', label: 'Info', badge: mockEvents.filter(e => e.severity === 'info').length },
            { value: 'success', label: 'Success', badge: mockEvents.filter(e => e.severity === 'success').length },
          ]}
        />

        <span className="text-[11px] font-medium text-[#6F6078] dark:text-[#B9A5CD]">
          Showing {filteredEvents.length} logged events
        </span>
      </div>

      {/* Event Table */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Event Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Source / Node</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
              {filteredEvents.map(ev => {
                const isWarn = ev.severity === 'warning';
                const isCrit = ev.severity === 'critical';
                const isSucc = ev.severity === 'success';

                return (
                  <tr key={ev.id} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#2B1745]">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        isCrit ? 'bg-[#FEF2F2] text-[#DC3545] dark:bg-[#450A0A] dark:text-[#FCA5A5]' : isWarn ? 'bg-[#FFFBEB] text-[#D97706] dark:bg-[#451A03] dark:text-[#FCD34D]' : isSucc ? 'bg-[#F0FDF4] text-[#16A36A] dark:bg-[#064E3B] dark:text-[#34D399]' : 'bg-blue-50 text-blue-700 dark:bg-[#0C4A6E] dark:text-[#38BDF8]'
                      }`}>
                        {isCrit ? <XCircle size={13} /> : isWarn ? <AlertTriangle size={13} /> : isSucc ? <CheckCircle2 size={13} /> : <Info size={13} />}
                        {ev.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">{ev.title}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-0.5 font-mono text-[10px] font-bold text-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#C4B5FD]">
                        {ev.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{ev.source}</td>
                    <td className="px-4 py-3 text-[#6F6078] dark:text-[#B9A5CD] max-w-xs truncate" title={ev.details}>{ev.details}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-right text-[#6F6078] dark:text-[#8E78A6]">{ev.timestamp}</td>
                  </tr>
                );
              })}

              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#6F6078] dark:text-[#8E78A6]">
                    No events matched the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EventsAndAlerts;
