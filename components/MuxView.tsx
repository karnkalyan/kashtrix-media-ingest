import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiActivity,
  FiArrowDown,
  FiArrowLeft,
  FiArrowUp,
  FiCheck,
  FiCopy,
  FiEdit2,
  FiInbox,
  FiLayers,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiSliders,
  FiSquare,
  FiTrash2,
  FiWifi,
  FiX,
} from 'react-icons/fi';
import {
  AppSettings,
  Channel,
  LicenseInfo,
  MuxConfig,
  MuxServiceInput,
  MuxStats,
  PhysicalInterface,
  TranscodingProfile,
} from '../types';

interface MuxViewProps {
  api: (endpoint: string, options?: RequestInit) => Promise<any>;
  channels: Channel[];
  profiles: TranscodingProfile[];
  settings: AppSettings;
  license: LicenseInfo;
  userRole?: string;
  ws?: WebSocket | null;
}

interface DiscoveredSource {
  id: string;
  channelId?: string;
  name: string;
  sourceType: 'channel' | 'vod' | 'udp' | 'rtmp' | 'srt' | 'custom';
  inputUrl: string;
  codec?: string;
  bitrateKbps?: number;
  status?: 'ONLINE' | 'OFFLINE';
  details?: string;
}

type WorkspaceTab = 'services' | 'settings';

const inputClass = 'h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 text-xs text-[#1B1024] outline-none focus:border-violet-500 dark:border-[#371F59] dark:bg-[#211335] dark:text-white';
const cardClass = 'rounded-xl border border-[#E8DFF0] bg-white shadow-sm dark:border-[#311B4E] dark:bg-[#190E28]';

const DEFAULT_MUX: Omit<MuxConfig, 'id'> = {
  name: '',
  description: '',
  status: 'Stopped',
  outputInterface: '',
  outputInterfaceAddress: '',
  outputIp: '239.10.10.10',
  outputPort: 5000,
  packetSize: 1316,
  ttl: 16,
  targetBitrateMbps: 30,
  outputMode: 'passthrough',
  globalVideoCodec: 'h264',
  globalAudioCodec: 'aac',
  globalResolution: 'source',
  globalVideoBitrateKbps: 3500,
  globalAudioBitrateKbps: 192,
  globalEncoder: 'auto',
  globalFps: 25,
  globalGop: 50,
  globalPreset: 'veryfast',
  tsid: 1,
  onid: 1,
  nid: 1,
  services: [],
  autoStart: false,
  autoRestart: true,
  filterNullPackets: false,
};

const toService = (source: DiscoveredSource, index: number): MuxServiceInput => {
  const basePid = (index + 1) * 256;
  return {
    id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channelId: source.channelId,
    sourceName: source.name,
    sourceType: source.sourceType,
    inputUrl: source.inputUrl,
    mode: 'copy',
    serviceId: 101 + index,
    serviceName: source.name,
    providerName: 'Kashtrix',
    pmtPid: `0x${basePid.toString(16)}`,
    videoPid: `0x${(basePid + 1).toString(16)}`,
    pcrPid: `0x${(basePid + 1).toString(16)}`,
    audioStreams: [{ streamIndex: 0, audioPid: `0x${(basePid + 2).toString(16)}`, bitrateKbps: 192, enabled: true }],
    videoCodec: 'h264',
    videoBitrateKbps: source.bitrateKbps || 4000,
    resolution: 'source',
    fps: 25,
    gop: 50,
    encoder: 'auto',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    audioSampleRate: 48000,
    audioChannels: 2,
    rateControl: 'cbr',
    enabled: true,
    orderIndex: index,
  };
};

const formatUptime = (seconds = 0) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const MuxView: React.FC<MuxViewProps> = ({ api, ws }) => {
  const [muxes, setMuxes] = useState<MuxConfig[]>([]);
  const [sources, setSources] = useState<DiscoveredSource[]>([]);
  const [interfaces, setInterfaces] = useState<PhysicalInterface[]>([]);
  const [stats, setStats] = useState<Record<string, MuxStats>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspace, setWorkspace] = useState<MuxConfig | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('services');
  const [sourceSearch, setSourceSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [draggedServiceId, setDraggedServiceId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [muxResponse, sourceResponse, networkResponse] = await Promise.all([
        api('/api/mux'),
        api('/api/mux/sources'),
        api('/api/system/network'),
      ]);
      setMuxes(Array.isArray(muxResponse?.muxes) ? muxResponse.muxes : []);
      setSources(Array.isArray(sourceResponse?.sources) ? sourceResponse.sources : []);
      
      const rawPhysical = Array.isArray(networkResponse?.physical) 
        ? networkResponse.physical 
        : (Array.isArray(networkResponse) ? networkResponse : []);
      
      const validIfaces = rawPhysical.map((item: any) => ({
        ...item,
        address: item.address || item.ip || item.ip4 || '',
      })).filter((item: PhysicalInterface) => item.address || item.state === 'Up' || item.isOnline);
      
      setInterfaces(validIfaces.length > 0 ? validIfaces : rawPhysical);
    } catch (error: any) {
      toast.error(error?.message || 'Could not load MPTS configuration');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'mux_stats' && message.muxId) {
          setStats(current => ({ ...current, [message.muxId]: message.payload }));
        }
      } catch (_) {}
    };
    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  useEffect(() => {
    const poll = async () => {
      for (const mux of muxes.filter(item => item.status === 'Running')) {
        try {
          const value = await api(`/api/mux/${encodeURIComponent(mux.id)}/stats`);
          setStats(current => ({ ...current, [mux.id]: value }));
        } catch (_) {}
      }
    };
    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => window.clearInterval(timer);
  }, [api, muxes]);

  const filteredSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    return sources.filter(source => !query || `${source.name} ${source.inputUrl} ${source.sourceType}`.toLowerCase().includes(query));
  }, [sourceSearch, sources]);

  const selectedInterface = useMemo(
    () => interfaces.find(item => item.interface === workspace?.outputInterface || item.address === workspace?.outputInterfaceAddress) || interfaces[0],
    [interfaces, workspace?.outputInterface, workspace?.outputInterfaceAddress],
  );

  const createMux = () => {
    const firstInterface = interfaces.find(item => (item.state === 'Up' || item.isOnline) && item.address) || interfaces.find(item => item.address) || interfaces[0];
    setWorkspace({
      ...DEFAULT_MUX,
      id: `mux-${Date.now()}`,
      name: `MPTS Output ${muxes.length + 1}`,
      outputInterface: firstInterface?.interface || '',
      outputInterfaceAddress: firstInterface?.address || '',
    });
    setWorkspaceTab('services');
  };

  const editMux = (mux: MuxConfig) => {
    const target = JSON.parse(JSON.stringify(mux));
    if (!target.outputInterface && interfaces.length > 0) {
      const fallback = interfaces.find(item => item.address) || interfaces[0];
      target.outputInterface = fallback?.interface || '';
      target.outputInterfaceAddress = fallback?.address || '';
    }
    setWorkspace(target);
    setWorkspaceTab('services');
  };

  const patchWorkspace = (patch: Partial<MuxConfig>) => {
    setWorkspace(current => current ? { ...current, ...patch } : current);
  };

  const patchService = (id: string, patch: Partial<MuxServiceInput>) => {
    setWorkspace(current => current ? {
      ...current,
      services: current.services.map(service => service.id === id ? { ...service, ...patch } : service),
    } : current);
  };

  const addSource = (source: DiscoveredSource) => {
    setWorkspace(current => {
      if (!current || current.services.some(service => service.inputUrl === source.inputUrl)) return current;
      return { ...current, services: [...current.services, toService(source, current.services.length)] };
    });
  };

  const removeService = (id: string) => {
    setWorkspace(current => current ? {
      ...current,
      services: current.services.filter(service => service.id !== id).map((service, index) => ({ ...service, orderIndex: index })),
    } : current);
  };

  const moveService = (id: string, delta: number) => {
    setWorkspace(current => {
      if (!current) return current;
      const services = [...current.services];
      const from = services.findIndex(service => service.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= services.length) return current;
      [services[from], services[to]] = [services[to], services[from]];
      return { ...current, services: services.map((service, index) => ({ ...service, orderIndex: index })) };
    });
  };

  const addCustomSource = () => {
    if (!customUrl.trim()) return toast.error('Enter an input URL');
    addSource({
      id: `custom-${Date.now()}`,
      name: customName.trim() || 'Custom input',
      sourceType: 'custom',
      inputUrl: customUrl.trim(),
      status: 'ONLINE',
    });
    setCustomName('');
    setCustomUrl('');
  };

  const handleSourceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('application/x-streamops-source');
    const source = sources.find(item => item.id === sourceId);
    if (source) addSource(source);
  };

  const handleServiceDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (!draggedServiceId || draggedServiceId === targetId) return;
    setWorkspace(current => {
      if (!current) return current;
      const services = [...current.services];
      const from = services.findIndex(service => service.id === draggedServiceId);
      const to = services.findIndex(service => service.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = services.splice(from, 1);
      services.splice(to, 0, moved);
      return { ...current, services: services.map((service, index) => ({ ...service, orderIndex: index })) };
    });
    setDraggedServiceId(null);
  };

  const saveMux = async () => {
    if (!workspace) return;
    if (!workspace.name.trim()) return toast.error('Enter an MPTS output name');
    if (!workspace.services.length) return toast.error('Drag at least one input into the MPTS output');
    const iface = selectedInterface || interfaces.find(item => item.address) || interfaces[0];
    if (!iface) return toast.error('Select an egress NIC with a valid IP address');
    if (!workspace.outputIp.trim()) return toast.error('Enter a multicast output address');
    const payload = {
      ...workspace,
      outputInterface: iface.interface || workspace.outputInterface,
      outputInterfaceAddress: iface.address || workspace.outputInterfaceAddress,
    };
    setSaving(true);
    try {
      const exists = muxes.some(item => item.id === workspace.id);
      await api(exists ? `/api/mux/${encodeURIComponent(workspace.id)}` : '/api/mux', {
        method: exists ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(exists ? 'MPTS configuration updated' : 'MPTS output created');
      setWorkspace(null);
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.message || 'Could not save MPTS configuration');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (mux: MuxConfig, action: 'start' | 'stop' | 'restart') => {
    try {
      await api(`/api/mux/${encodeURIComponent(mux.id)}/${action}`, { method: 'POST' });
      toast.success(`${mux.name} ${action === 'stop' ? 'stopped' : 'started'}`);
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.message || `Could not ${action} MPTS output`);
    }
  };

  const deleteMux = async (mux: MuxConfig) => {
    if (!window.confirm(`Delete "${mux.name}"?`)) return;
    try {
      await api(`/api/mux/${encodeURIComponent(mux.id)}`, { method: 'DELETE' });
      toast.success('MPTS output deleted');
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete MPTS output');
    }
  };

  const duplicateMux = async (mux: MuxConfig) => {
    const name = window.prompt('Name for the duplicated MPTS output', `${mux.name} Copy`);
    if (!name?.trim()) return;
    try {
      await api(`/api/mux/${encodeURIComponent(mux.id)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ newName: name.trim(), newIp: mux.outputIp, newPort: Number(mux.outputPort) + 1 }),
      });
      toast.success('MPTS output duplicated');
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.message || 'Could not duplicate MPTS output');
    }
  };

  if (workspace) {
    return (
      <div className="space-y-4">
        <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setWorkspace(null)} className="rounded-lg border border-[#E8DFF0] p-2 text-[#6F6078] hover:bg-[#F8F7FA] dark:border-[#371F59] dark:text-[#B9A5CD]">
              <FiArrowLeft />
            </button>
            <div>
              <h1 className="text-base font-bold text-[#1B1024] dark:text-white">{workspace.name || 'New MPTS Output'}</h1>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Assign inputs first, then configure the independent MPTS output settings.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWorkspace(null)} className="h-9 rounded-lg border border-[#E8DFF0] px-4 text-xs font-semibold text-[#6F6078] dark:border-[#371F59] dark:text-[#B9A5CD]">Cancel</button>
            <button type="button" onClick={saveMux} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-colors">
              <FiCheck /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className={`${cardClass} flex gap-1 p-1.5`}>
          <button type="button" onClick={() => setWorkspaceTab('services')} className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold ${workspaceTab === 'services' ? 'bg-violet-600 text-white' : 'text-[#6F6078] dark:text-[#B9A5CD]'}`}>
            <FiLayers /> Input assignment <span className="rounded bg-black/10 px-1.5 py-0.5">{workspace.services.length}</span>
          </button>
          <button type="button" onClick={() => setWorkspaceTab('settings')} className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold ${workspaceTab === 'settings' ? 'bg-violet-600 text-white' : 'text-[#6F6078] dark:text-[#B9A5CD]'}`}>
            <FiSettings /> MPTS settings
          </button>
        </div>

        {workspaceTab === 'services' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className={`${cardClass} min-h-[560px] p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">Available inputs</h2>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Drag a channel or VOD source into the output column.</p>
                </div>
                <button type="button" onClick={() => void fetchAll()} className="rounded-lg border border-[#E8DFF0] p-2 text-[#6F6078] dark:border-[#371F59] dark:text-[#B9A5CD]"><FiRefreshCw /></button>
              </div>
              <div className="relative mb-3">
                <FiSearch className="absolute left-3 top-2.5 text-[#8E78A6]" />
                <input className={`${inputClass} pl-9`} value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="Search inputs" />
              </div>
              <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input className={inputClass} value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Custom name" />
                <input className={inputClass} value={customUrl} onChange={event => setCustomUrl(event.target.value)} placeholder="srt://, udp://, rtmp:// or file path" />
                <button type="button" onClick={addCustomSource} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#251133] px-3 text-xs font-bold text-white"><FiPlus /> Add</button>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="font-semibold text-[#6F6078] dark:text-[#A898BC]">SRT Presets:</span>
                <button type="button" onClick={() => { setCustomName('SRT Listener'); setCustomUrl('srt://0.0.0.0:8890?mode=listener&latency=200'); }} className="px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                  🟢 SRT Listener
                </button>
                <button type="button" onClick={() => { setCustomName('SRT Caller'); setCustomUrl('srt://127.0.0.1:9001?mode=caller&latency=200'); }} className="px-2 py-0.5 rounded font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
                  🔵 SRT Caller
                </button>
                <button type="button" onClick={() => { setCustomName('SRT Rendezvous'); setCustomUrl('srt://127.0.0.1:9001?mode=rendezvous&latency=200'); }} className="px-2 py-0.5 rounded font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300">
                  🟣 SRT Rendezvous
                </button>
              </div>
              <div className="space-y-2">
                {filteredSources.map(source => {
                  const assigned = workspace.services.some(service => service.inputUrl === source.inputUrl);
                  return (
                    <div
                      key={source.id}
                      draggable={!assigned}
                      onDragStart={event => event.dataTransfer.setData('application/x-streamops-source', source.id)}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${assigned ? 'border-emerald-200 bg-emerald-50/60 opacity-70 dark:border-emerald-900 dark:bg-emerald-950/20' : 'cursor-grab border-[#E8DFF0] bg-[#F8F7FA] dark:border-[#371F59] dark:bg-[#211335]'}`}
                    >
                      <div className="rounded-lg bg-violet-100 p-2 text-violet-700 dark:bg-violet-950"><FiWifi /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className="truncate text-xs font-bold text-[#1B1024] dark:text-white">{source.name}</span><span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#6F6078] dark:bg-[#190E28]">{source.sourceType}</span></div>
                        <p className="truncate font-mono text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">{source.inputUrl}</p>
                      </div>
                      {assigned ? <span className="text-[10px] font-bold text-emerald-600">Assigned</span> : <button type="button" onClick={() => addSource(source)} className="rounded-lg border border-[#E8DFF0] p-2 text-violet-600 dark:border-[#371F59]"><FiPlus /></button>}
                    </div>
                  );
                })}
                {!filteredSources.length && <div className="rounded-xl border border-dashed border-[#E8DFF0] p-10 text-center text-xs text-[#6F6078] dark:border-[#371F59] dark:text-[#B9A5CD]"><FiInbox className="mx-auto mb-2 text-2xl" />No matching inputs</div>}
              </div>
            </section>

            <section className={`${cardClass} min-h-[560px] p-4`} onDragOver={event => event.preventDefault()} onDrop={handleSourceDrop}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">MPTS output services</h2>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Drop inputs here. Drag assigned services to reorder programs.</p>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{workspace.services.length} service(s)</span>
              </div>
              {!workspace.services.length ? (
                <div className="flex min-h-[460px] items-center justify-center rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/40 text-center dark:border-violet-900 dark:bg-violet-950/10">
                  <div><FiInbox className="mx-auto mb-3 text-4xl text-violet-300" /><p className="text-sm font-bold text-[#1B1024] dark:text-white">Drop inputs into this column</p><p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Each input becomes one DVB program in the MPTS output.</p></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {workspace.services.map((service, index) => (
                    <div
                      key={service.id}
                      draggable
                      onDragStart={() => setDraggedServiceId(service.id)}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => handleServiceDrop(event, service.id)}
                      className="cursor-grab rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:border-[#371F59] dark:bg-[#211335]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">{index + 1}</div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                            <input className={inputClass} value={service.serviceName} onChange={event => patchService(service.id, { serviceName: event.target.value })} aria-label="Service name" />
                            <select className={inputClass} value={service.mode} onChange={event => patchService(service.id, { mode: event.target.value as 'copy' | 'transcode' })}>
                              <option value="copy">⚡ Pass-through</option><option value="transcode">⚙️ Transcode</option>
                            </select>
                          </div>
                          <p className="truncate font-mono text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">{service.inputUrl}</p>
                          <div className="flex flex-wrap gap-2 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]"><span>Service {service.serviceId}</span><span>PMT {service.pmtPid}</span><span>Video {service.videoPid}</span><span>Audio {service.audioStreams?.[0]?.audioPid || '0x102'}</span></div>

                          {/* Full Per-Service Transcoding Controls */}
                          {service.mode === 'transcode' && (
                            <div className="mt-2 rounded-lg border border-violet-200 bg-white/80 p-3 shadow-2xs dark:border-[#462470] dark:bg-[#1A0E29] space-y-2.5 animate-fadeIn">
                              <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-1.5 dark:border-[#371F59]">
                                <span className="text-[11px] font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1">
                                  <FiSliders size={12} /> Service Transcoding Configuration
                                </span>
                                <span className="text-[9px] font-bold uppercase rounded bg-violet-100 px-1.5 py-0.5 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                                  {service.videoCodec || 'H.264'} · {service.videoBitrateKbps || 4000}k
                                </span>
                              </div>

                              {/* Video Section */}
                              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Video Codec
                                  <select
                                    className={`${inputClass} text-[11px] h-8`}
                                    value={service.videoCodec || 'h264'}
                                    onChange={e => patchService(service.id, { videoCodec: e.target.value as any })}
                                  >
                                    <option value="h264">H.264 / AVC (Broadcast)</option>
                                    <option value="hevc">H.265 / HEVC (UHD/HD)</option>
                                    <option value="copy">Pass-through Video (Copy)</option>
                                  </select>
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Encoder Engine
                                  <select
                                    className={`${inputClass} text-[11px] h-8`}
                                    value={service.encoder || 'auto'}
                                    onChange={e => patchService(service.id, { encoder: e.target.value as any })}
                                  >
                                    <option value="auto">Auto (Hardware / CPU)</option>
                                    <option value="nvidia">NVIDIA NVENC</option>
                                    <option value="cpu">CPU (libx264)</option>
                                  </select>
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Video Bitrate (kbps)
                                  <input
                                    className={`${inputClass} text-[11px] h-8`}
                                    type="number"
                                    min="300"
                                    max="50000"
                                    step="100"
                                    value={service.videoBitrateKbps || 4000}
                                    onChange={e => patchService(service.id, { videoBitrateKbps: Number(e.target.value) })}
                                  />
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Resolution
                                  <select
                                    className={`${inputClass} text-[11px] h-8`}
                                    value={service.resolution || 'source'}
                                    onChange={e => patchService(service.id, { resolution: e.target.value })}
                                  >
                                    <option value="source">Source (Native)</option>
                                    <option value="1920x1080">1080p (1920x1080)</option>
                                    <option value="1280x720">720p (1280x720)</option>
                                    <option value="720x576">576i PAL (720x576)</option>
                                    <option value="3840x2160">4K UHD (3840x2160)</option>
                                  </select>
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Framerate (FPS)
                                  <select
                                    className={`${inputClass} text-[11px] h-8`}
                                    value={service.fps || 25}
                                    onChange={e => patchService(service.id, { fps: Number(e.target.value) })}
                                  >
                                    <option value={25}>25 fps (PAL / DVB)</option>
                                    <option value={50}>50 fps (50p)</option>
                                    <option value={29.97}>29.97 fps (NTSC)</option>
                                    <option value={59.94}>59.94 fps (60p)</option>
                                    <option value={30}>30 fps</option>
                                    <option value={60}>60 fps</option>
                                  </select>
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  GOP Size
                                  <input
                                    className={`${inputClass} text-[11px] h-8`}
                                    type="number"
                                    min="10"
                                    max="300"
                                    value={service.gop || 50}
                                    onChange={e => patchService(service.id, { gop: Number(e.target.value) })}
                                  />
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Audio Codec
                                  <select
                                    className={`${inputClass} text-[11px] h-8`}
                                    value={service.audioCodec || 'aac'}
                                    onChange={e => patchService(service.id, { audioCodec: e.target.value as any })}
                                  >
                                    <option value="aac">AAC-LC (Broadcast)</option>
                                    <option value="mp2">MPEG-1 Layer II (MP2 DVB)</option>
                                    <option value="ac3">Dolby Digital (AC-3)</option>
                                    <option value="copy">Pass-through Audio (Copy)</option>
                                  </select>
                                </label>

                                <label className="space-y-0.5 text-[10px] font-semibold text-[#1B1024] dark:text-white">
                                  Audio Bitrate (kbps)
                                  <select
                                    className={`${inputClass} text-[11px] h-8`}
                                    value={service.audioBitrateKbps || 192}
                                    onChange={e => patchService(service.id, { audioBitrateKbps: Number(e.target.value) })}
                                  >
                                    <option value={128}>128 kbps</option>
                                    <option value={192}>192 kbps (Standard)</option>
                                    <option value={256}>256 kbps (High Quality)</option>
                                    <option value={384}>384 kbps (Master)</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          <button type="button" onClick={() => moveService(service.id, -1)} disabled={index === 0} className="rounded border border-[#E8DFF0] p-1.5 disabled:opacity-30 dark:border-[#371F59]"><FiArrowUp /></button>
                          <button type="button" onClick={() => moveService(service.id, 1)} disabled={index === workspace.services.length - 1} className="rounded border border-[#E8DFF0] p-1.5 disabled:opacity-30 dark:border-[#371F59]"><FiArrowDown /></button>
                          <button type="button" onClick={() => removeService(service.id)} className="rounded border border-rose-200 p-1.5 text-rose-600 dark:border-rose-900"><FiX /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            {/* MPTS Processing & Transcoding Mode Selector */}
            <section className={`${cardClass} p-5`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#1B1024] dark:text-white flex items-center gap-2">
                    <FiSliders className="text-violet-600" /> MPTS Output Processing &amp; Transcoding Mode
                  </h2>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Choose whether this entire MPTS stream passes input packets directly through or transcodes and normalizes all programs.
                  </p>
                </div>
              </div>

              <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* 1. Pass-through Mode */}
                <button
                  type="button"
                  onClick={() => patchWorkspace({ outputMode: 'passthrough' })}
                  className={`flex flex-col text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                    (workspace.outputMode || 'passthrough') === 'passthrough'
                      ? 'border-violet-600 bg-violet-50/80 shadow-xs dark:bg-violet-950/40 dark:border-violet-400'
                      : 'border-[#E8DFF0] bg-[#F8F7FA] hover:bg-slate-100 dark:border-[#371F59] dark:bg-[#211335]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      ⚡ Pass-Through (Copy)
                    </span>
                    {(workspace.outputMode || 'passthrough') === 'passthrough' && (
                      <span className="h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-400" />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Zero CPU overhead. Muxes original video/audio streams directly into the MPTS container.
                  </p>
                </button>

                {/* 2. Full MPTS Transcode Mode */}
                <button
                  type="button"
                  onClick={() => patchWorkspace({ outputMode: 'transcode' })}
                  className={`flex flex-col text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                    workspace.outputMode === 'transcode'
                      ? 'border-violet-600 bg-violet-50/80 shadow-xs dark:bg-violet-950/40 dark:border-violet-400'
                      : 'border-[#E8DFF0] bg-[#F8F7FA] hover:bg-slate-100 dark:border-[#371F59] dark:bg-[#211335]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      ⚙️ Full MPTS Transcode
                    </span>
                    {workspace.outputMode === 'transcode' && (
                      <span className="h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-400" />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Transcodes and normalizes all multiplexed channels to standard broadcast H.264/HEVC + AAC/MP2.
                  </p>
                </button>

                {/* 3. Hybrid / Per-Service Mode */}
                <button
                  type="button"
                  onClick={() => patchWorkspace({ outputMode: 'hybrid' })}
                  className={`flex flex-col text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                    workspace.outputMode === 'hybrid'
                      ? 'border-violet-600 bg-violet-50/80 shadow-xs dark:bg-violet-950/40 dark:border-violet-400'
                      : 'border-[#E8DFF0] bg-[#F8F7FA] hover:bg-slate-100 dark:border-[#371F59] dark:bg-[#211335]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      🔀 Per-Service Hybrid
                    </span>
                    {workspace.outputMode === 'hybrid' && (
                      <span className="h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-400" />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Configure each program individually (Copy or Transcode) in the Services tab.
                  </p>
                </button>
              </div>

              {/* Transcoding Parameters Form (when Transcode mode is active) */}
              {workspace.outputMode === 'transcode' && (
                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-[#462470] dark:bg-[#201138]">
                  <h3 className="text-xs font-bold text-violet-950 dark:text-violet-200 mb-3">
                    Broadcast Transcoding Parameters
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Video Codec
                      <select
                        className={inputClass}
                        value={workspace.globalVideoCodec || 'h264'}
                        onChange={e => patchWorkspace({ globalVideoCodec: e.target.value as any })}
                      >
                        <option value="h264">H.264 / AVC (Broadcast Standard)</option>
                        <option value="hevc">H.265 / HEVC (High Efficiency)</option>
                        <option value="copy">Pass-through Video (Copy)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Audio Codec
                      <select
                        className={inputClass}
                        value={workspace.globalAudioCodec || 'aac'}
                        onChange={e => patchWorkspace({ globalAudioCodec: e.target.value as any })}
                      >
                        <option value="aac">AAC-LC (Broadcast Audio)</option>
                        <option value="mp2">MPEG-1 Layer II (MP2 DVB)</option>
                        <option value="ac3">Dolby Digital (AC-3)</option>
                        <option value="copy">Pass-through Audio (Copy)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Resolution
                      <select
                        className={inputClass}
                        value={workspace.globalResolution || 'source'}
                        onChange={e => patchWorkspace({ globalResolution: e.target.value })}
                      >
                        <option value="source">Source Resolution (Native)</option>
                        <option value="1920x1080">1080p Full HD (1920x1080)</option>
                        <option value="1280x720">720p HD (1280x720)</option>
                        <option value="720x576">576i PAL SD (720x576)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Hardware Acceleration
                      <select
                        className={inputClass}
                        value={workspace.globalEncoder || 'auto'}
                        onChange={e => patchWorkspace({ globalEncoder: e.target.value as any })}
                      >
                        <option value="auto">Auto (NVIDIA / QuickSync / CPU)</option>
                        <option value="nvidia">NVIDIA NVENC</option>
                        <option value="cpu">CPU (libx264 Software)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Target Video Bitrate (kbps)
                      <input
                        className={inputClass}
                        type="number"
                        min="500"
                        max="50000"
                        step="100"
                        value={workspace.globalVideoBitrateKbps || 3500}
                        onChange={e => patchWorkspace({ globalVideoBitrateKbps: Number(e.target.value) })}
                      />
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Target Audio Bitrate (kbps)
                      <select
                        className={inputClass}
                        value={workspace.globalAudioBitrateKbps || 192}
                        onChange={e => patchWorkspace({ globalAudioBitrateKbps: Number(e.target.value) })}
                      >
                        <option value={128}>128 kbps</option>
                        <option value={192}>192 kbps (Standard)</option>
                        <option value={256}>256 kbps (High Quality)</option>
                        <option value={384}>384 kbps (Studio Master)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      Framerate (FPS)
                      <select
                        className={inputClass}
                        value={workspace.globalFps || 25}
                        onChange={e => patchWorkspace({ globalFps: Number(e.target.value) })}
                      >
                        <option value={25}>25 fps (PAL / DVB)</option>
                        <option value={50}>50 fps (PAL 50p)</option>
                        <option value={29.97}>29.97 fps (NTSC / ATSC)</option>
                        <option value={59.94}>59.94 fps (NTSC 60p)</option>
                        <option value={30}>30 fps</option>
                        <option value={60}>60 fps</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold text-[#1B1024] dark:text-white">
                      GOP Size (Frames)
                      <input
                        className={inputClass}
                        type="number"
                        min="10"
                        max="300"
                        value={workspace.globalGop || 50}
                        onChange={e => patchWorkspace({ globalGop: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              )}
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <section className={`${cardClass} p-5`}>
                <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">Output network</h2>
                <p className="mb-4 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">The egress NIC is required and maps to FFmpeg&apos;s multicast local address.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white sm:col-span-2">Name<input className={inputClass} value={workspace.name} onChange={event => patchWorkspace({ name: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white sm:col-span-2">Egress NIC<select className={inputClass} value={workspace.outputInterface || selectedInterface?.interface || ''} onChange={event => {
                    const selected = interfaces.find(item => item.interface === event.target.value);
                    patchWorkspace({ outputInterface: selected?.interface || '', outputInterfaceAddress: selected?.address || '' });
                  }}><option value="" disabled>Select an interface</option>{interfaces.map(item => <option key={item.interface} value={item.interface}>{item.logicalName || item.name || item.interface} — {item.address || 'DHCP'} ({item.state || 'Up'})</option>)}</select>{!interfaces.length && <span className="block text-[10px] font-normal text-rose-600">No NIC with an IP address was detected.</span>}</label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">Multicast / unicast IP<input className={inputClass} value={workspace.outputIp} onChange={event => patchWorkspace({ outputIp: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">UDP port<input className={inputClass} type="number" value={workspace.outputPort} onChange={event => patchWorkspace({ outputPort: Number(event.target.value) })} /></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">Target mux bitrate (Mbps)<input className={inputClass} type="number" min="1" value={workspace.targetBitrateMbps} onChange={event => patchWorkspace({ targetBitrateMbps: Number(event.target.value) })} /></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">Packet size<select className={inputClass} value={workspace.packetSize} onChange={event => patchWorkspace({ packetSize: Number(event.target.value) })}><option value={1316}>1316 bytes (7 TS packets)</option><option value={188}>188 bytes</option></select></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">TTL<input className={inputClass} type="number" min="1" max="255" value={workspace.ttl} onChange={event => patchWorkspace({ ttl: Number(event.target.value) })} /></label>
                </div>
              </section>
              <section className={`${cardClass} p-5`}>
                <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">DVB PSI/SI and supervision</h2>
                <p className="mb-4 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Transport identifiers are kept separate from input assignment.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">TSID<input className={inputClass} type="number" value={workspace.tsid} onChange={event => patchWorkspace({ tsid: Number(event.target.value) })} /></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">ONID<input className={inputClass} type="number" value={workspace.onid} onChange={event => patchWorkspace({ onid: Number(event.target.value) })} /></label>
                  <label className="space-y-1 text-xs font-bold text-[#1B1024] dark:text-white">NID<input className={inputClass} type="number" value={workspace.nid} onChange={event => patchWorkspace({ nid: Number(event.target.value) })} /></label>
                </div>
                <div className="mt-5 space-y-3 rounded-xl border border-[#E8DFF0] p-4 dark:border-[#371F59]">
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#1B1024] dark:text-white"><span><b className="block">Auto start</b><small className="font-normal text-[#6F6078] dark:text-[#B9A5CD]">Start only after the MUX entitlement validates.</small></span><input type="checkbox" checked={workspace.autoStart !== false} onChange={event => patchWorkspace({ autoStart: event.target.checked })} /></label>
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#1B1024] dark:text-white"><span><b className="block">Auto restart</b><small className="font-normal text-[#6F6078] dark:text-[#B9A5CD]">Recover after an unexpected process exit.</small></span><input type="checkbox" checked={workspace.autoRestart !== false} onChange={event => patchWorkspace({ autoRestart: event.target.checked })} /></label>
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#1B1024] dark:text-white"><span><b className="block">Null Packet Filter</b><small className="font-normal text-[#6F6078] dark:text-[#B9A5CD]">Strip 0x1FFF CBR null stuffing packets (VBR mode) or maintain strict broadcast CBR stuffing.</small></span><input type="checkbox" checked={Boolean(workspace.filterNullPackets)} onChange={event => patchWorkspace({ filterNullPackets: event.target.checked })} /></label>
                </div>
                <div className="mt-4 rounded-xl bg-[#120A1D] p-4 text-[11px] text-violet-200">
                  <p className="font-bold text-white">Output preview</p>
                  <p className="mt-1 font-mono">udp://{workspace.outputIp}:{workspace.outputPort}</p>
                  <p className="mt-1">NIC: {selectedInterface ? `${selectedInterface.interface} (${selectedInterface.address})` : 'not selected'}</p>
                  <p>Mode: <span className="font-bold uppercase text-amber-300">{workspace.outputMode || 'passthrough'}</span> · Target: {workspace.targetBitrateMbps} Mbps · {workspace.services.length} service(s)</p>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div>
          <div className="flex items-center gap-2"><FiLayers className="text-violet-600" /><h1 className="text-base font-bold text-[#1B1024] dark:text-white">MPTS Multiplexer</h1></div>
          <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Build multi-program transport streams from available inputs and route them through a selected egress NIC.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void fetchAll()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E8DFF0] px-3 text-xs font-bold text-[#6F6078] dark:border-[#371F59] dark:text-[#B9A5CD]"><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh</button>
          <button type="button" onClick={createMux} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-bold text-white"><FiPlus /> New MPTS output</button>
        </div>
      </div>

      {loading && !muxes.length ? (
        <div className={`${cardClass} p-12 text-center text-xs text-[#6F6078] dark:text-[#B9A5CD]`}><FiRefreshCw className="mx-auto mb-3 animate-spin text-2xl" />Loading MPTS configurations…</div>
      ) : !muxes.length ? (
        <div className={`${cardClass} p-12 text-center`}><FiInbox className="mx-auto mb-3 text-4xl text-violet-300" /><h2 className="text-sm font-bold text-[#1B1024] dark:text-white">No MPTS outputs configured</h2><p className="mt-1 text-xs text-[#6F6078] dark:text-[#B9A5CD]">Create an output, drag inputs into it, then choose the server NIC used for multicast egress.</p><button type="button" onClick={createMux} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-bold text-white"><FiPlus /> Create output</button></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {muxes.map(mux => {
            const live = stats[mux.id];
            const running = mux.status === 'Running' || live?.status === 'Running';
            const capacity = live?.capacityPercent || 0;
            return (
              <article key={mux.id} className={`${cardClass} overflow-hidden flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-3 border-b border-[#E8DFF0] p-4 dark:border-[#311B4E]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-black text-[#1B1024] dark:text-white">{mux.name}</h2>
                        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          {mux.outputMode === 'transcode' ? '⚙️ Transcode' : mux.outputMode === 'hybrid' ? '🔀 Hybrid' : '⚡ Pass-Through'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD] mt-0.5">
                        DVB Multiplexer with {mux.services.length} assigned input stream(s)
                      </p>
                    </div>

                    {/* RED / GREEN SIGNAL INDICATOR */}
                    <div className="flex items-center gap-2 shrink-0">
                      {running ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700 shadow-xs">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]"></span>
                          </span>
                          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            SIGNAL ACTIVE
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-300 dark:bg-rose-950/40 dark:border-rose-800 shadow-xs">
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]"></span>
                          <span className="text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400">
                            SIGNAL DISABLED
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BIG TEXT SIZE OUTPUT MPTS DESTINATION */}
                  <div className="p-4 bg-[#0F0819] rounded-xl mx-4 mt-3 border border-violet-900/60 shadow-inner">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-violet-300 mb-1">
                      <span>MPTS UDP Broadcast Output</span>
                      <span className="font-mono text-violet-400">NIC: {mux.outputInterface || 'Default Interface'}</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-mono font-black text-emerald-400 tracking-tight select-all py-1">
                      udp://{mux.outputIp}:{mux.outputPort}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 mt-2 border-t border-violet-900/50 text-[11px]">
                      <div>
                        <span className="text-[#8E78A6] block text-[9px] uppercase font-bold">Multicast IP</span>
                        <span className="font-mono font-bold text-white text-xs">{mux.outputIp}</span>
                      </div>
                      <div>
                        <span className="text-[#8E78A6] block text-[9px] uppercase font-bold">UDP Port</span>
                        <span className="font-mono font-bold text-white text-xs">{mux.outputPort}</span>
                      </div>
                      <div>
                        <span className="text-[#8E78A6] block text-[9px] uppercase font-bold">Target Bitrate</span>
                        <span className="font-mono font-bold text-white text-xs">{mux.targetBitrateMbps} Mbps</span>
                      </div>
                      <div>
                        <span className="text-[#8E78A6] block text-[9px] uppercase font-bold">Null Filter</span>
                        <span className={`font-bold text-xs ${mux.filterNullPackets ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {mux.filterNullPackets ? 'FILTERED (VBR)' : 'CBR STUFFING'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 p-4">
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-[#8E78A6]">Inputs</span>
                      <b className="text-lg text-[#1B1024] dark:text-white">{mux.services.length}</b>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-[#8E78A6]">Real Output</span>
                      <b className="text-lg text-[#1B1024] dark:text-white">{running ? ((live?.outputKbps || 0) / 1000).toFixed(1) : '0.0'} <small className="text-[10px]">Mbps</small></b>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-[#8E78A6]">Uptime</span>
                      <b className="font-mono text-sm text-[#1B1024] dark:text-white">{formatUptime(live?.uptimeSeconds || mux.uptimeSeconds)}</b>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:border-[#311B4E] dark:bg-[#211335]">
                  <div className="flex items-center gap-2">
                    {/* ENABLE / DISABLE BUTTON */}
                    {running ? (
                      <button
                        type="button"
                        onClick={() => void runAction(mux, 'stop')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition-colors"
                      >
                        <FiSquare /> Disable MPTS
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runAction(mux, 'start')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                      >
                        <FiPlay /> Enable MPTS
                      </button>
                    )}

                    {/* NULL PACKET FILTER OPTION */}
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer px-2.5 py-1 rounded-lg border border-[#E8DFF0] bg-white dark:bg-[#190E28] dark:border-[#371F59] hover:bg-[#F0EDF5]">
                      <input
                        type="checkbox"
                        checked={Boolean(mux.filterNullPackets)}
                        onChange={async (e) => {
                          const updated = { ...mux, filterNullPackets: e.target.checked };
                          try {
                            await api(`/api/mux/${encodeURIComponent(mux.id)}`, {
                              method: 'PUT',
                              body: JSON.stringify(updated)
                            });
                            toast.success(e.target.checked ? 'Null Packet Filter Enabled (VBR mode)' : 'Null Packet Filter Disabled (CBR null stuffing)');
                            await fetchAll();
                          } catch (err: any) {
                            toast.error(err?.message || 'Could not update filter');
                          }
                        }}
                        className="rounded text-violet-600"
                      />
                      <span>Null Pkt Filter</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <button type="button" onClick={() => editMux(mux)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[11px] font-bold text-[#1B1024] dark:border-[#371F59] dark:bg-[#190E28] dark:text-white hover:bg-slate-50"><FiEdit2 /> Edit</button>
                    <button type="button" onClick={() => void duplicateMux(mux)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[11px] font-bold text-[#6F6078] dark:border-[#371F59] dark:bg-[#190E28] dark:text-[#B9A5CD] hover:bg-slate-50"><FiCopy /> Duplicate</button>
                    <button type="button" onClick={() => void deleteMux(mux)} className="rounded-lg border border-rose-200 p-2 text-rose-600 dark:border-rose-900 hover:bg-rose-50"><FiTrash2 /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className={`${cardClass} grid gap-3 p-4 sm:grid-cols-3`}>
        <div className="flex items-center gap-3"><div className="rounded-lg bg-violet-100 p-2 text-violet-700 dark:bg-violet-950"><FiActivity /></div><div><span className="block text-[10px] uppercase text-[#8E78A6]">Configured</span><b className="text-sm text-[#1B1024] dark:text-white">{muxes.length} outputs</b></div></div>
        <div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950"><FiPlay /></div><div><span className="block text-[10px] uppercase text-[#8E78A6]">Running</span><b className="text-sm text-[#1B1024] dark:text-white">{muxes.filter(item => item.status === 'Running').length} outputs</b></div></div>
        <div className="flex items-center gap-3"><div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950"><FiWifi /></div><div><span className="block text-[10px] uppercase text-[#8E78A6]">Egress NICs</span><b className="text-sm text-[#1B1024] dark:text-white">{interfaces.length} selectable</b></div></div>
      </div>
    </div>
  );
};

export default MuxView;
