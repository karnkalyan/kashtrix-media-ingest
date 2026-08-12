import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FiArchive, FiCalendar, FiDownload, FiFilm, FiFilter, FiGrid, FiList, FiPlay, FiRefreshCw, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { AppSettings } from '../types';

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

const durationSeconds = (recording: any) => Math.max(0, Math.floor(((recording.end_time ? new Date(recording.end_time).getTime() : Date.now()) - new Date(recording.start_time).getTime()) / 1000));
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${remainder}s` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

const RecordingLibrary: React.FC<Props> = ({ realtimeRecordings, settings, deleteRecording }) => {
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
  const pageSize = 24;

  const loadAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const response = await fetch('/api/ingest/recordings?limit=5000', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to load recording library');
      setRecordings(body.recordings || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (!realtimeRecordings.length) return;
    setRecordings(current => {
      const updates = new Map(realtimeRecordings.map(item => [String(item.id), item]));
      const merged = current.map(item => updates.has(String(item.id)) ? updates.get(String(item.id)) : item);
      realtimeRecordings.forEach(item => { if (!current.some(existing => String(existing.id) === String(item.id))) merged.push(item); });
      return merged;
    });
  }, [realtimeRecordings]);

  const formats = useMemo(() => Array.from(new Set(recordings.map(item => String(item.format || item.file_name?.split('.').pop() || '').toLowerCase()).filter(Boolean))).sort(), [recordings]);
  const channels = useMemo(() => Array.from(new Set(recordings.map(item => `${item.app}/${item.stream}`))).sort(), [recordings]);
  const encoders = useMemo(() => Array.from(new Set(recordings.map(item => String(item.encoder || 'copy')))).sort(), [recordings]);
  const resolutions = useMemo(() => Array.from(new Set(recordings.map(item => String(item.resolution || 'source')))).sort(), [recordings]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).getTime() : Number.MAX_SAFE_INTEGER;
    return recordings.filter(recording => {
      const started = new Date(recording.start_time).getTime();
      const recordingFormat = String(recording.format || recording.file_name?.split('.').pop() || '').toLowerCase();
      const searchable = `${recording.file_name} ${recording.app} ${recording.stream} ${recordingFormat} ${recording.encoder} ${recording.resolution}`.toLowerCase();
      const recordingStatus = recording.is_active ? 'live' : recording.end_time ? 'completed' : 'interrupted';
      return (!query || searchable.includes(query)) && (format === 'all' || recordingFormat === format) && (source === 'all' || recording.source_type === source) && (status === 'all' || recordingStatus === status) && (channel === 'all' || `${recording.app}/${recording.stream}` === channel) && (encoder === 'all' || String(recording.encoder || 'copy') === encoder) && (resolution === 'all' || String(recording.resolution || 'source') === resolution) && started >= from && started <= to;
    }).sort((a, b) => {
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
  const storage = filtered.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const clearFilters = () => { setSearch(''); setFormat('all'); setSource('all'); setStatus('all'); setChannel('all'); setEncoder('all'); setResolution('all'); setDateFrom(''); setDateTo(''); setSort('newest'); };
  const remove = async (recording: any) => {
    if (!window.confirm(`Delete ${recording.file_name}? This removes the recording file permanently.`)) return;
    try { await deleteRecording(recording.id); setRecordings(current => current.filter(item => String(item.id) !== String(recording.id))); toast.success('Recording deleted'); } catch (error: any) { toast.error(error.message); }
  };
  const mediaBase = window.location.origin;

  return <div className="recording-library page-stack">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><FiArchive size={17} className="text-[var(--primary)]" />Recording Library</h2><p className="mt-0.5 text-xs text-[var(--text-secondary)]">Search, inspect, preview and manage every television recording.</p></div>
      <div className="flex items-center gap-2"><button onClick={loadAll} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs font-semibold"><FiRefreshCw className={loading ? 'animate-spin' : ''} />Refresh all</button><div className="flex h-9 rounded-md border border-[var(--border)] bg-white p-0.5"><button onClick={() => setView('cards')} className={`rounded p-2 ${view === 'cards' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`} title="Card view"><FiGrid /></button><button onClick={() => setView('table')} className={`rounded p-2 ${view === 'table' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`} title="Table view"><FiList /></button></div></div>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-xl border border-[var(--border)] bg-white p-4"><p className="text-[10px] font-semibold uppercase text-slate-400">Matching recordings</p><p className="mt-1 text-xl font-bold">{filtered.length}</p></div><div className="rounded-xl border border-[var(--border)] bg-white p-4"><p className="text-[10px] font-semibold uppercase text-slate-400">Storage</p><p className="mt-1 text-xl font-bold">{formatBytes(storage)}</p></div><div className="rounded-xl border border-[var(--border)] bg-white p-4"><p className="text-[10px] font-semibold uppercase text-slate-400">Recording now</p><p className="mt-1 text-xl font-bold text-rose-600">{filtered.filter(item => item.is_active).length}</p></div><div className="rounded-xl border border-[var(--border)] bg-white p-4"><p className="text-[10px] font-semibold uppercase text-slate-400">Formats</p><p className="mt-1 text-xl font-bold">{formats.length}</p></div></div>

    <div><button onClick={() => setFiltersOpen(value => !value)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-[11px] font-semibold"><FiFilter />{filtersOpen ? 'Hide filters' : 'Search & filters'}</button></div>
    {filtersOpen && <section className="rounded-lg border border-[var(--border)] bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="relative sm:col-span-2"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filename, channel, codec…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" /></label>
        <select value={channel} onChange={event => setChannel(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All channels</option>{channels.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select value={format} onChange={event => setFormat(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All formats</option>{formats.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
        <select value={source} onChange={event => setSource(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All sources</option><option value="ingest">Live ingest</option><option value="device">Capture device</option></select>
        <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All statuses</option><option value="live">Recording now</option><option value="completed">Completed</option><option value="interrupted">Interrupted</option></select>
        <select value={encoder} onChange={event => setEncoder(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All hardware</option>{encoders.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
        <select value={resolution} onChange={event => setResolution(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All resolutions</option>{resolutions.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <select value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="size-desc">Largest first</option><option value="duration-desc">Longest first</option><option value="name">Filename A–Z</option></select>
        <button onClick={clearFilters} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600">Clear filters</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-[11px] font-semibold text-slate-500"><FiCalendar className="mr-1 inline" />Started from<input type="datetime-local" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" /></label><label className="text-[11px] font-semibold text-slate-500"><FiCalendar className="mr-1 inline" />Started until<input type="datetime-local" value={dateTo} onChange={event => setDateTo(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" /></label></div>
    </section>}

    {!visible.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-14 text-center"><FiFilm className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-semibold text-slate-500">No recordings match these filters.</p></div> : view === 'cards' ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map(recording => <article key={recording.id} className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm"><button onClick={() => setPreview(recording)} className="group relative block aspect-video w-full bg-slate-900"><img src={`${mediaBase}/recording-thumbnail/${recording.id}.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} /><span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/30"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-indigo-600 shadow"><FiPlay /></span></span><span className={`absolute left-2 top-2 rounded-md px-2 py-1 text-[9px] font-bold ${recording.is_active ? 'bg-rose-600 text-white' : 'bg-black/65 text-white'}`}>{recording.is_active ? 'LIVE' : String(recording.format || 'FILE').toUpperCase()}</span><span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{formatDuration(durationSeconds(recording))}</span></button><div className="p-4"><h3 className="truncate text-sm font-semibold text-slate-800" title={recording.file_name}>{recording.file_name}</h3><p className="mt-1 truncate text-[11px] text-slate-500">{recording.app}/{recording.stream} · {recording.encoder || 'copy'} · {recording.resolution || 'source'}</p><p className="mt-2 text-[11px] text-slate-500">{new Date(recording.start_time).toLocaleString()} · {formatBytes(Number(recording.size || 0))}</p><div className="mt-3 flex gap-2"><button onClick={() => setPreview(recording)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-700"><FiPlay />Preview</button><a href={`${mediaBase}/recordings/${recording.app}/${recording.stream}/${recording.file_name}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-2 text-slate-600" title="Download"><FiDownload /></a><button onClick={() => remove(recording)} className="rounded-lg border border-slate-200 p-2 text-rose-600" title="Delete"><FiTrash2 /></button></div></div></article>)}</div> : <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Recording</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Started</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Format</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(recording => <tr key={recording.id} className="text-xs"><td className="max-w-[280px] truncate px-4 py-3 font-semibold">{recording.file_name}</td><td className="px-4 py-3 text-slate-500">{recording.app}/{recording.stream}<span className="block text-[10px]">{recording.source_type || 'ingest'} · {recording.encoder || 'copy'}</span></td><td className="px-4 py-3 text-slate-500">{new Date(recording.start_time).toLocaleString()}</td><td className="px-4 py-3">{recording.is_active ? <span className="text-rose-600">LIVE · {formatDuration(durationSeconds(recording))}</span> : formatDuration(durationSeconds(recording))}</td><td className="px-4 py-3 font-semibold uppercase">{recording.format}</td><td className="px-4 py-3">{formatBytes(Number(recording.size || 0))}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => setPreview(recording)} className="rounded-lg border p-2 text-indigo-600"><FiPlay /></button><a href={`${mediaBase}/recordings/${recording.app}/${recording.stream}/${recording.file_name}`} target="_blank" rel="noreferrer" className="rounded-lg border p-2"><FiDownload /></a><button onClick={() => remove(recording)} className="rounded-lg border p-2 text-rose-600"><FiTrash2 /></button></div></td></tr>)}</tbody></table></div>}

    {pageCount > 1 && <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-xs"><span>Page {page} of {pageCount} · {filtered.length} results</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>}

    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null); }}><div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{preview.file_name}</h3><p className="text-[10px] text-slate-400">{preview.app}/{preview.stream} · {new Date(preview.start_time).toLocaleString()}</p></div><button onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><FiX /></button></div><div className="aspect-video bg-black"><video key={preview.id} controls autoPlay playsInline className="h-full w-full object-contain" src={`${mediaBase}/recording-preview/${preview.id}`} /></div></div></div>}
  </div>;
};

export default RecordingLibrary;
