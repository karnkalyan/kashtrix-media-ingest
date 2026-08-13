import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Archive,
  Calendar,
  Download,
  Film,
  Filter,
  Grid,
  List,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
  Radio,
  Clock,
  HardDrive
} from 'lucide-react';
import { AppSettings } from '../types';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import ConfirmDialog from './ui/ConfirmDialog';

interface Props {
  realtimeRecordings: any[];
  settings: AppSettings;
  deleteRecording: (id: number | string) => Promise<any>;
}

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const durationSeconds = (recording: any) =>
  Math.max(0, Math.floor(((recording.end_time ? new Date(recording.end_time).getTime() : Date.now()) - new Date(recording.start_time).getTime()) / 1000));

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${remainder}s` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

const getRecordingFormat = (recording: any): string => {
  if (recording?.file_name && recording.file_name.includes('.')) {
    const parts = recording.file_name.split('.');
    const ext = parts.pop()?.toLowerCase();
    if (ext && ext !== recording.file_name.toLowerCase() && ['mp4', 'mkv', 'mov', 'ts', 'flv', 'avi', 'webm'].includes(ext)) {
      return ext;
    }
  }
  if (recording?.format && String(recording.format).toLowerCase() !== 'file') {
    return String(recording.format).toLowerCase();
  }
  return 'mp4';
};

export const RecordingLibrary: React.FC<Props> = ({ realtimeRecordings, settings, deleteRecording }) => {
  const [recordings, setRecordings] = useState<any[]>(realtimeRecordings);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('table');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('all');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');
  const [encoder, setEncoder] = useState('all');
  const [resolution, setResolution] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<any | null>(null);
  const pageSize = 20;

  const loadAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const response = await fetch('/api/ingest/recordings?limit=5000', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load recording library');
      setRecordings(body.recordings || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!realtimeRecordings.length) return;
    setRecordings(current => {
      const updates = new Map(realtimeRecordings.map(item => [String(item.id), item]));
      const merged = current.map(item => (updates.has(String(item.id)) ? updates.get(String(item.id)) : item));
      realtimeRecordings.forEach(item => {
        if (!current.some(existing => String(existing.id) === String(item.id))) merged.push(item);
      });
      return merged;
    });
  }, [realtimeRecordings]);

  const formats = useMemo(() => Array.from(new Set(recordings.map(item => getRecordingFormat(item)))).sort(), [recordings]);
  const channels = useMemo(() => Array.from(new Set(recordings.map(item => `${item.app}/${item.stream}`))).sort(), [recordings]);
  const encoders = useMemo(() => Array.from(new Set(recordings.map(item => String(item.encoder || 'copy')))).sort(), [recordings]);
  const resolutions = useMemo(() => Array.from(new Set(recordings.map(item => String(item.resolution || 'source')))).sort(), [recordings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).getTime() : Number.MAX_SAFE_INTEGER;
    return recordings
      .filter(recording => {
        const started = new Date(recording.start_time).getTime();
        const recordingFormat = getRecordingFormat(recording);
        const searchable = `${recording.file_name} ${recording.app} ${recording.stream} ${recordingFormat} ${recording.encoder} ${recording.resolution}`.toLowerCase();
        const recordingStatus = recording.is_active ? 'live' : recording.end_time ? 'completed' : 'interrupted';
        return (
          (!query || searchable.includes(query)) &&
          (format === 'all' || recordingFormat === format) &&
          (source === 'all' || recording.source_type === source) &&
          (status === 'all' || recordingStatus === status) &&
          (channel === 'all' || `${recording.app}/${recording.stream}` === channel) &&
          (encoder === 'all' || String(recording.encoder || 'copy') === encoder) &&
          (resolution === 'all' || String(recording.resolution || 'source') === resolution) &&
          started >= from &&
          started <= to
        );
      })
      .sort((a, b) => {
        if (sort === 'oldest') return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        if (sort === 'size-desc') return Number(b.size || 0) - Number(a.size || 0);
        if (sort === 'duration-desc') return durationSeconds(b) - durationSeconds(a);
        if (sort === 'name') return String(a.file_name).localeCompare(String(b.file_name));
        return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
      });
  }, [recordings, search, format, source, status, channel, encoder, resolution, dateFrom, dateTo, sort]);

  useEffect(() => setPage(1), [search, format, source, status, channel, encoder, resolution, dateFrom, dateTo, sort, view]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalStorage = filtered.reduce((sum, item) => sum + Number(item.size || 0), 0);

  const [deletingRec, setDeletingRec] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const remove = (recording: any) => {
    setDeletingRec(recording);
  };

  const confirmDeleteRecording = async () => {
    if (!deletingRec) return;
    setDeleteLoading(true);
    try {
      await deleteRecording(deletingRec.id);
      setRecordings(current => current.filter(item => String(item.id) !== String(deletingRec.id)));
      toast.success('Recording deleted');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleteLoading(false);
      setDeletingRec(null);
    }
  };

  const mediaBase = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="recording-library page-stack space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">Recording Library</h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Search, preview, download and manage recorded media archives
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2F1A4B]"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>

          <div className="flex h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 dark:bg-[#211335] dark:border-[#371F59]">
            <button
              onClick={() => setView('table')}
              className={`rounded p-1 text-[12px] ${view === 'table' ? 'bg-white text-[#351147] font-semibold shadow-xs dark:bg-[#371F59] dark:text-white' : 'text-[#6F6078] dark:text-[#8E78A6]'}`}
              title="Table View"
            >
              <List size={15} />
            </button>
            <button
              onClick={() => setView('cards')}
              className={`rounded p-1 text-[12px] ${view === 'cards' ? 'bg-white text-[#351147] font-semibold shadow-xs dark:bg-[#371F59] dark:text-white' : 'text-[#6F6078] dark:text-[#8E78A6]'}`}
              title="Grid View"
            >
              <Grid size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Recordings</span>
          <p className="font-mono text-[20px] font-bold text-[#1B1024] dark:text-white">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Total Storage</span>
          <p className="font-mono text-[20px] font-bold text-[#2563EB] dark:text-[#60A5FA]">{formatBytes(totalStorage)}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Active Jobs</span>
          <p className="font-mono text-[20px] font-bold text-[#E11D72] dark:text-[#F472B6]">
            {filtered.filter(item => item.is_active).length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD]">Formats</span>
          <p className="font-mono text-[20px] font-bold text-[#4A1B7A] dark:text-[#C4B5FD]">{formats.length || 1}</p>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search filename, channel, codec..."
              className="h-8 w-full rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
            />
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
          </div>

          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-medium text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
          >
            <option value="all">All Formats</option>
            {formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>

          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2.5 text-[12px] font-medium text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="size-desc">Largest First</option>
            <option value="duration-desc">Longest First</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
        {visible.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center p-8 text-center">
            <div>
              <Archive size={28} className="mx-auto text-[#6F6078]" />
              <h3 className="mt-2 font-display text-[14px] font-bold text-[#1B1024]">No recordings found</h3>
              <p className="mt-1 text-[11px] text-[#6F6078]">No archived recordings matched the search criteria.</p>
            </div>
          </div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Channel / Source</th>
                  <th className="px-4 py-3">Recorded Date</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">File Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0]">
                {visible.map(recording => (
                  <tr key={recording.id} className="transition-colors hover:bg-[#F4EEFF]/50">
                    <td className="px-4 py-3 font-semibold text-[#1B1024] max-w-[240px] truncate" title={recording.file_name}>
                      {recording.file_name}
                    </td>
                    <td className="px-4 py-3 text-[#6F6078]">
                      <span className="font-semibold text-[#1B1024]">{recording.app}/{recording.stream}</span>
                      <span className="block text-[10px] text-[#6F6078]">{recording.encoder || 'copy'} • {recording.resolution || 'source'}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078]">
                      {new Date(recording.start_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078]">
                      {recording.is_active ? (
                        <span className="text-[#E11D72] font-semibold">LIVE • {formatDuration(durationSeconds(recording))}</span>
                      ) : (
                        formatDuration(durationSeconds(recording))
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ProtocolBadge protocol={getRecordingFormat(recording).toUpperCase()} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[#6F6078]">
                      {formatBytes(Number(recording.size || 0))}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setPreview(recording)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
                      >
                        <Play size={12} /> Preview
                      </button>
                      <a
                        href={`${mediaBase}/recordings/${recording.app}/${recording.stream}/${recording.file_name}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#F8F7FA]"
                        title="Download"
                      >
                        <Download size={13} />
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(recording)}
                        className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545]"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(recording => (
              <div key={recording.id} className="flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs">
                <div>
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-950 mb-2.5">
                    <img
                      src={`/recording-thumbnail/${recording.id}.jpg`}
                      alt={recording.file_name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="absolute bottom-2 right-2 rounded-md bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-xs">
                      {formatDuration(durationSeconds(recording))}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#1B1024] truncate text-[13px]" title={recording.file_name}>
                      {recording.file_name}
                    </h3>
                    <ProtocolBadge protocol={getRecordingFormat(recording).toUpperCase()} size="sm" />
                  </div>
                  <p className="mt-1 text-[11px] text-[#6F6078] truncate">
                    {recording.app}/{recording.stream} • {recording.resolution || 'source'}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-[#6F6078]">
                    <span className="font-mono">{formatDuration(durationSeconds(recording))}</span>
                    <span className="font-mono font-semibold">{formatBytes(Number(recording.size || 0))}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
                  <button
                    type="button"
                    onClick={() => setPreview(recording)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[#F4EEFF] py-1.5 text-[11px] font-semibold text-[#4A1B7A] hover:bg-[#E8DFF0] dark:bg-[#311754] dark:text-white"
                  >
                    <Play size={12} /> Preview
                  </button>
                  <a
                    href={`${mediaBase}/recordings/${recording.app}/${recording.stream}/${recording.file_name}`}
                    download={recording.file_name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#6D32D9] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#A78BFA]"
                    title="Download recording file"
                  >
                    <Download size={12} /> Download
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(recording)}
                    className="rounded-md border border-[#E8DFF0] p-1.5 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:border-[#371F59] dark:text-[#B9A5CD]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-[#E8DFF0] bg-[#F8F7FA] px-4 py-2.5 text-[11px]">
            <span className="text-[#6F6078]">Page {page} of {pageCount} • {filtered.length} items</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded border border-[#E8DFF0] bg-white px-2.5 py-1 font-semibold text-[#6F6078] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                className="rounded border border-[#E8DFF0] bg-white px-2.5 py-1 font-semibold text-[#6F6078] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={e => { if (e.target === e.currentTarget) setPreview(null); }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-xl dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-3 dark:border-[#311B4E]">
              <div className="min-w-0">
                <h3 className="truncate font-display text-[15px] font-semibold text-[#1B1024] dark:text-white">
                  {preview.file_name}
                </h3>
                <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {preview.app}/{preview.stream} • {new Date(preview.start_time).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${mediaBase}/recordings/${preview.app}/${preview.stream}/${preview.file_name}`}
                  download={preview.file_name}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-[#F4EEFF] px-3 py-1.5 text-[12px] font-semibold text-[#4A1B7A] hover:bg-[#E8DFF0] dark:bg-[#311754] dark:border-[#4A1B7A] dark:text-[#A78BFA]"
                  title="Download video file to computer"
                >
                  <Download size={14} /> Download File
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg p-1.5 text-[#6F6078] hover:bg-[#F8F7FA] dark:text-[#B9A5CD] dark:hover:bg-[#211335]"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="aspect-video bg-black">
              <video
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
                src={`${mediaBase}/recording-preview/${preview.id}`}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingRec}
        title="Delete Recording File"
        message={`Are you sure you want to delete recording "${deletingRec?.file_name || 'archive'}"? The file will be permanently deleted.`}
        confirmLabel="Delete File"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteRecording}
        onCancel={() => setDeletingRec(null)}
      />
    </div>
  );
};

export default RecordingLibrary;
