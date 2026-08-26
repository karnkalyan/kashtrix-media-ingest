import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FiPlus,
  FiPlay,
  FiSquare,
  FiRefreshCw,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiActivity,
  FiCpu,
  FiRadio,
  FiLayers,
  FiSearch,
  FiCheck,
  FiX,
  FiAlertTriangle,
  FiArrowUp,
  FiArrowDown,
  FiEye,
  FiTerminal,
  FiSliders,
  FiZap,
  FiTv,
  FiShield,
  FiShare2,
  FiGlobe,
  FiInbox,
  FiSend
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import {
  MuxConfig,
  MuxServiceInput,
  MuxStats,
  MuxProcessingMode,
  Channel,
  TranscodingProfile,
  AppSettings,
  LicenseInfo
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
  codec: string;
  bitrateKbps: number;
  status: 'ONLINE' | 'OFFLINE';
  details?: string;
}

const DEFAULT_MUX_CONFIG: Omit<MuxConfig, 'id'> = {
  name: 'KASHTRIX-MPTS-01',
  description: 'Broadcast Multi-Program Transport Stream (DVB UDP)',
  status: 'Stopped',
  outputInterface: 'any',
  outputIp: '239.10.10.10',
  outputPort: 5000,
  packetSize: 1316,
  ttl: 16,
  targetBitrateMbps: 30,
  tsid: 1,
  onid: 1,
  nid: 1,
  services: [],
  autoStart: true,
  autoRestart: true
};

export const MuxView: React.FC<MuxViewProps> = ({
  api,
  channels,
  profiles,
  settings,
  license,
  userRole,
  ws
}) => {
  const [muxList, setMuxList] = useState<MuxConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMuxId, setSelectedMuxId] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<Record<string, MuxStats>>({});
  
  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingMux, setEditingMux] = useState<MuxConfig | null>(null);
  const [editorViewMode, setEditorViewMode] = useState<'studio' | 'pipeline'>('studio');
  const [availableSources, setAvailableSources] = useState<DiscoveredSource[]>([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [customInputUrl, setCustomInputUrl] = useState('');
  const [customInputName, setCustomInputName] = useState('');
  const [saving, setSaving] = useState(false);

  // Probe & Test Input Modal
  const [probingUrl, setProbingUrl] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<any | null>(null);
  const [isProbeOpen, setIsProbeOpen] = useState(false);

  // Duplicate Modal
  const [duplicateMuxId, setDuplicateMuxId] = useState<string | null>(null);
  const [dupName, setDupName] = useState('');
  const [dupIp, setDupIp] = useState('');
  const [dupPort, setDupPort] = useState<number>(5001);

  // Filter & Search in Mux List
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Running' | 'Stopped'>('all');

  // Logs Console
  const [muxLogs, setMuxLogs] = useState<string[]>([]);

  // Fetch all MUXes
  const fetchMuxes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api('/api/mux', { method: 'GET' });
      setMuxList(res.muxes || []);
    } catch (err: any) {
      console.error('Fetch MUX error:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Fetch Available Channel/VOD sources
  const fetchSources = useCallback(async () => {
    try {
      const res = await api('/api/mux/sources', { method: 'GET' });
      setAvailableSources(res.sources || []);
    } catch (err) {
      console.warn('Sources discovery error:', err);
    }
  }, [api]);

  useEffect(() => {
    fetchMuxes();
    fetchSources();
  }, [fetchMuxes, fetchSources]);

  // WebSocket Live MUX stats listener
  useEffect(() => {
    if (!ws) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'mux_stats' && msg.muxId) {
          setLiveStats(prev => ({ ...prev, [msg.muxId]: msg.payload }));
        }
      } catch (_) {}
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  // Polling fallback for stats if WS not connected
  useEffect(() => {
    const timer = setInterval(async () => {
      if (muxList.length === 0) return;
      for (const m of muxList) {
        if (m.status === 'Running' || selectedMuxId === m.id) {
          try {
            const stats = await api(`/api/mux/${m.id}/stats`, { method: 'GET' });
            setLiveStats(prev => ({ ...prev, [m.id]: stats }));
          } catch (_) {}
        }
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [api, muxList, selectedMuxId]);

  // Fetch logs when a specific MUX is selected
  useEffect(() => {
    if (!selectedMuxId) return;
    const fetchLogs = async () => {
      try {
        const res = await api(`/api/mux/${selectedMuxId}/logs`, { method: 'GET' });
        setMuxLogs(res.logs || []);
      } catch (_) {}
    };
    fetchLogs();
    const timer = setInterval(fetchLogs, 3000);
    return () => clearInterval(timer);
  }, [api, selectedMuxId]);

  // Action: Start MUX
  const handleStartMux = async (id: string, name: string) => {
    try {
      toast.loading(`Starting MPTS MUX "${name}"...`, { id: `mux-${id}` });
      await api(`/api/mux/${id}/start`, { method: 'POST' });
      toast.success(`MUX "${name}" started successfully!`, { id: `mux-${id}` });
      fetchMuxes();
    } catch (err: any) {
      toast.error(`Failed to start "${name}": ${err.message}`, { id: `mux-${id}` });
    }
  };

  // Action: Stop MUX
  const handleStopMux = async (id: string, name: string) => {
    try {
      toast.loading(`Stopping "${name}"...`, { id: `mux-${id}` });
      await api(`/api/mux/${id}/stop`, { method: 'POST' });
      toast.success(`MUX "${name}" stopped`, { id: `mux-${id}` });
      fetchMuxes();
    } catch (err: any) {
      toast.error(`Failed to stop: ${err.message}`, { id: `mux-${id}` });
    }
  };

  // Action: Restart MUX
  const handleRestartMux = async (id: string, name: string) => {
    try {
      toast.loading(`Restarting "${name}"...`, { id: `mux-${id}` });
      await api(`/api/mux/${id}/restart`, { method: 'POST' });
      toast.success(`MUX "${name}" restarted`, { id: `mux-${id}` });
      fetchMuxes();
    } catch (err: any) {
      toast.error(`Failed to restart: ${err.message}`, { id: `mux-${id}` });
    }
  };

  // Action: Delete MUX
  const handleDeleteMux = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete MUX "${name}"? This action cannot be undone.`)) return;
    try {
      await api(`/api/mux/${id}`, { method: 'DELETE' });
      toast.success(`MUX "${name}" deleted`);
      if (selectedMuxId === id) setSelectedMuxId(null);
      fetchMuxes();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  // Action: Duplicate MUX
  const openDuplicateModal = (m: MuxConfig) => {
    setDuplicateMuxId(m.id);
    setDupName(`${m.name} (Copy)`);
    setDupIp(m.outputIp);
    setDupPort(Number(m.outputPort) + 1);
  };

  const handleDuplicateSubmit = async () => {
    if (!duplicateMuxId) return;
    try {
      await api(`/api/mux/${duplicateMuxId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({
          newName: dupName,
          newIp: dupIp,
          newPort: dupPort
        })
      });
      toast.success('MUX duplicated successfully');
      setDuplicateMuxId(null);
      fetchMuxes();
    } catch (err: any) {
      toast.error(`Duplicate failed: ${err.message}`);
    }
  };

  // Action: Open Editor (Create / Edit)
  const openCreateModal = () => {
    const newId = `mux-${Date.now()}`;
    setEditingMux({
      ...DEFAULT_MUX_CONFIG,
      id: newId,
      name: `MPTS-MUX-${muxList.length + 1}`
    });
    setEditorViewMode('studio');
    setSelectedSourceIds([]);
    setCustomInputUrl('');
    setCustomInputName('');
    setIsEditorOpen(true);
    fetchSources();
  };

  const openEditModal = (m: MuxConfig) => {
    setEditingMux(JSON.parse(JSON.stringify(m)));
    setEditorViewMode('studio');
    setSelectedSourceIds([]);
    setCustomInputUrl('');
    setCustomInputName('');
    setIsEditorOpen(true);
    fetchSources();
  };

  // Editor: Save MUX
  const handleSaveMux = async () => {
    if (!editingMux) return;
    if (!editingMux.name.trim()) {
      toast.error('MUX Name is required');
      return;
    }
    if (!editingMux.outputIp.trim()) {
      toast.error('Output Multicast/Unicast IP is required');
      return;
    }
    if (editingMux.services.length === 0) {
      toast.error('Please add at least one channel/service to this MUX.');
      return;
    }

    setSaving(true);
    try {
      const isNew = !muxList.some(m => m.id === editingMux.id);
      if (isNew) {
        await api('/api/mux', {
          method: 'POST',
          body: JSON.stringify(editingMux)
        });
        toast.success(`MUX "${editingMux.name}" created!`);
      } else {
        await api(`/api/mux/${editingMux.id}`, {
          method: 'PUT',
          body: JSON.stringify(editingMux)
        });
        toast.success(`MUX "${editingMux.name}" updated!`);
      }
      setIsEditorOpen(false);
      setEditingMux(null);
      fetchMuxes();
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Editor: Auto-assign PIDs
  const handleAutoAssignPids = async () => {
    if (!editingMux) return;
    try {
      const res = await api('/api/mux/auto-assign-pids', {
        method: 'POST',
        body: JSON.stringify({ services: editingMux.services })
      });
      if (res.services) {
        setEditingMux(prev => prev ? { ...prev, services: res.services } : null);
        toast.success('PIDs auto-assigned with collision prevention!');
      }
    } catch (err: any) {
      toast.error(`PID assignment error: ${err.message}`);
    }
  };

  // Editor: Add Discovered Sources
  const handleAddDiscoveredSources = () => {
    if (!editingMux || selectedSourceIds.length === 0) return;
    const toAdd = availableSources.filter(s => selectedSourceIds.includes(s.id));
    
    const newServices: MuxServiceInput[] = toAdd.map((s, idx) => {
      const currentCount = editingMux.services.length + idx;
      const baseNum = (currentCount + 1) * 100;
      return {
        id: `svc-${Date.now()}-${idx}`,
        channelId: s.channelId,
        sourceName: s.name,
        sourceType: s.sourceType,
        inputUrl: s.inputUrl,
        mode: 'copy',
        serviceId: currentCount + 101,
        serviceName: s.name,
        providerName: 'StreamOps',
        pmtPid: `0x${baseNum.toString(16).padStart(3, '0')}`,
        videoPid: `0x${(baseNum + 1).toString(16).padStart(3, '0')}`,
        pcrPid: `0x${(baseNum + 1).toString(16).padStart(3, '0')}`,
        audioStreams: [
          {
            streamIndex: 0,
            audioPid: `0x${(baseNum + 2).toString(16).padStart(3, '0')}`,
            bitrateKbps: 192,
            enabled: true
          }
        ],
        videoBitrateKbps: s.bitrateKbps || 4000,
        enabled: true
      };
    });

    setEditingMux(prev => prev ? {
      ...prev,
      services: [...prev.services, ...newServices]
    } : null);

    setSelectedSourceIds([]);
    toast.success(`Added ${newServices.length} service(s) to MUX`);
  };

  // Editor: Add Custom Source
  const handleAddCustomSource = () => {
    if (!editingMux) return;
    if (!customInputUrl.trim()) {
      toast.error('Input URL is required');
      return;
    }
    const currentCount = editingMux.services.length;
    const baseNum = (currentCount + 1) * 100;
    const newService: MuxServiceInput = {
      id: `svc-${Date.now()}`,
      sourceName: customInputName.trim() || `Custom Service ${currentCount + 1}`,
      sourceType: 'custom',
      inputUrl: customInputUrl.trim(),
      mode: 'copy',
      serviceId: currentCount + 101,
      serviceName: customInputName.trim() || `Custom Service ${currentCount + 1}`,
      providerName: 'StreamOps',
      pmtPid: `0x${baseNum.toString(16).padStart(3, '0')}`,
      videoPid: `0x${(baseNum + 1).toString(16).padStart(3, '0')}`,
      pcrPid: `0x${(baseNum + 1).toString(16).padStart(3, '0')}`,
      audioStreams: [
        {
          streamIndex: 0,
          audioPid: `0x${(baseNum + 2).toString(16).padStart(3, '0')}`,
          bitrateKbps: 192,
          enabled: true
        }
      ],
      videoBitrateKbps: 4000,
      enabled: true
    };

    setEditingMux(prev => prev ? {
      ...prev,
      services: [...prev.services, newService]
    } : null);

    setCustomInputUrl('');
    setCustomInputName('');
    toast.success('Custom input service added');
  };

  // Editor: Remove Service
  const handleRemoveService = (serviceId: string) => {
    if (!editingMux) return;
    setEditingMux({
      ...editingMux,
      services: editingMux.services.filter(s => s.id !== serviceId)
    });
  };

  // Editor: Move Service Up / Down
  const handleMoveService = (index: number, direction: 'up' | 'down') => {
    if (!editingMux) return;
    const list = [...editingMux.services];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setEditingMux({ ...editingMux, services: list });
  };

  // Probe Source
  const handleProbeInput = async (url: string) => {
    setProbingUrl(url);
    setIsProbeOpen(true);
    setProbeResult(null);
    try {
      const res = await api('/api/mux/probe-input', {
        method: 'POST',
        body: JSON.stringify({ inputUrl: url })
      });
      setProbeResult(res);
    } catch (err: any) {
      setProbeResult({ success: false, error: err.message });
    }
  };

  // Capacity calculations for editing MUX
  const capacityInfo = useMemo(() => {
    if (!editingMux) return { totalInputMbps: 0, targetMbps: 30, percent: 0, isWarning: false, isOver: false };
    const targetMbps = Number(editingMux.targetBitrateMbps || 30);
    const totalInputKbps = editingMux.services
      .filter(s => s.enabled !== false)
      .reduce((acc, s) => acc + (Number(s.videoBitrateKbps || (s.mode === 'copy' ? 4000 : 3500)) + 192), 0);
    const totalInputMbps = Math.round((totalInputKbps / 1000) * 100) / 100;
    const percent = targetMbps > 0 ? Math.round((totalInputMbps / targetMbps) * 100) : 0;
    return {
      totalInputMbps,
      targetMbps,
      percent,
      isWarning: percent >= 85 && percent <= 100,
      isOver: percent > 100
    };
  }, [editingMux]);

  // Filtered Muxes
  const filteredMuxes = useMemo(() => {
    return muxList.filter(m => {
      const matchesSearch = !searchQuery ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.outputIp.includes(searchQuery) ||
        String(m.outputPort).includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [muxList, searchQuery, statusFilter]);

  const selectedMux = useMemo(() => {
    return muxList.find(m => m.id === selectedMuxId) || null;
  }, [muxList, selectedMuxId]);

  const activeStats = selectedMuxId ? liveStats[selectedMuxId] : null;

  return (
    <div className="space-y-6 animate-fade-in text-[#1B1024] dark:text-[#E2D1F9]">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E8DFF0] dark:border-[#311B4E] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-black text-[#1B1024] dark:text-white flex items-center gap-2">
              <FiLayers className="text-[#7C3AED]" />
              Broadcast MPTS Multiplexer
            </h1>
            <span className="rounded-full bg-violet-100 border border-violet-200 px-2.5 py-0.5 text-[10px] font-bold text-[#7C3AED] dark:bg-[#311754] dark:border-[#522588] dark:text-[#E2D1F9]">
              DVB Transport Engine
            </span>
          </div>
          <p className="text-xs text-[#6F6078] dark:text-[#B9A5CD]">
            Aggregate multiple live video channels, VOD streams, and audio PIDs into single multi-program transport streams (DVB-ASI / UDP Multicast).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { fetchMuxes(); fetchSources(); }}
            className="flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#371F59] bg-white dark:bg-[#1E1233] px-3.5 py-2 text-xs font-bold text-[#475569] dark:text-[#E2D1F9] hover:bg-[#F8FAFC] dark:hover:bg-[#2A1747] transition-colors shadow-2xs"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-600/25 hover:bg-violet-700 transition-colors"
          >
            <FiPlus size={16} />
            Create MPTS MUX
          </button>
        </div>
      </div>

      {/* ── Metric HUD Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-white/80 dark:bg-[#190E28]/90 p-4 backdrop-blur-md shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#64748B] dark:text-[#A78BFA]">
            <span>Total MUX Instances</span>
            <FiLayers className="text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-black">{muxList.length}</div>
          <div className="mt-1 text-[11px] text-[#94A3B8] dark:text-[#8E78A6]">
            {muxList.filter(m => m.status === 'Running').length} Online / Running
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-white/80 dark:bg-[#190E28]/90 p-4 backdrop-blur-md shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#64748B] dark:text-[#A78BFA]">
            <span>Combined Total Services</span>
            <FiTv className="text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black">
            {muxList.reduce((acc, m) => acc + (m.services?.length || 0), 0)}
          </div>
          <div className="mt-1 text-[11px] text-[#94A3B8] dark:text-[#8E78A6]">
            Program transport streams
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-white/80 dark:bg-[#190E28]/90 p-4 backdrop-blur-md shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#64748B] dark:text-[#A78BFA]">
            <span>Total Configured Egress</span>
            <FiRadio className="text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-black">
            {muxList.reduce((acc, m) => acc + Number(m.targetBitrateMbps || 0), 0)} <span className="text-sm font-bold text-[#64748B]">Mbps</span>
          </div>
          <div className="mt-1 text-[11px] text-[#94A3B8] dark:text-[#8E78A6]">
            CBR Stuffed Multicast bandwidth
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-white/80 dark:bg-[#190E28]/90 p-4 backdrop-blur-md shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#64748B] dark:text-[#A78BFA]">
            <span>Multiplexer Engine</span>
            <FiCpu className="text-fuchsia-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            DVB-ASI / IP
          </div>
          <div className="mt-1 text-[11px] text-[#94A3B8] dark:text-[#8E78A6]">
            Pass-Through & Statmux Ready
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search MUX by name, IP, or port..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#E2E8F0] dark:border-[#371F59] bg-white dark:bg-[#1E1233] pl-10 pr-4 py-2 text-xs text-[#0F172A] dark:text-white placeholder-[#94A3B8] focus:outline-hidden focus:ring-2 focus:ring-violet-500 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="flex rounded-xl border border-[#E2E8F0] dark:border-[#371F59] bg-white dark:bg-[#1E1233] p-1 shadow-2xs text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-3 py-1 transition-colors ${statusFilter === 'all' ? 'bg-violet-600 text-white' : 'text-[#64748B] dark:text-[#A78BFA] hover:text-[#0F172A]'}`}
            >
              All ({muxList.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Running')}
              className={`rounded-lg px-3 py-1 transition-colors ${statusFilter === 'Running' ? 'bg-emerald-600 text-white' : 'text-[#64748B] dark:text-[#A78BFA] hover:text-[#0F172A]'}`}
            >
              Running ({muxList.filter(m => m.status === 'Running').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Stopped')}
              className={`rounded-lg px-3 py-1 transition-colors ${statusFilter === 'Stopped' ? 'bg-slate-600 text-white' : 'text-[#64748B] dark:text-[#A78BFA] hover:text-[#0F172A]'}`}
            >
              Stopped ({muxList.filter(m => m.status === 'Stopped').length})
            </button>
          </div>
        </div>
      </div>

      {/* ── MUX Cards List ── */}
      {filteredMuxes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#CBD5E1] dark:border-[#371F59] bg-white/50 dark:bg-[#190E28]/40 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 mb-3">
            <FiLayers size={28} />
          </div>
          <h3 className="text-base font-extrabold text-[#0F172A] dark:text-white">No MPTS MUX Configurations Found</h3>
          <p className="mt-1 text-xs text-[#64748B] dark:text-[#A78BFA] max-w-md mx-auto">
            Create a new MPTS multiplexer to aggregate your existing live channels and VOD UDP feeds into a single broadcast transport stream.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-violet-700 transition-colors"
          >
            <FiPlus size={16} /> Create MPTS MUX
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredMuxes.map(mux => {
            const isRunning = mux.status === 'Running';
            const stats = liveStats[mux.id];
            const capacityPercent = stats ? stats.capacityPercent : 0;
            const isOverCapacity = stats ? stats.isOverCapacity : false;
            const isWarning = stats ? stats.isCapacityWarning : false;

            return (
              <div
                key={mux.id}
                className={`group relative rounded-2xl border transition-all duration-200 shadow-sm ${
                  selectedMuxId === mux.id
                    ? 'border-violet-500 ring-2 ring-violet-500/20 bg-white dark:bg-[#1C1030]'
                    : 'border-[#E8EDF5] dark:border-[#311B4E] bg-white/90 dark:bg-[#190E28]/95 hover:border-violet-300 dark:hover:border-violet-700'
                } p-5`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className={`relative flex h-3 w-3 ${isRunning ? 'animate-pulse' : ''}`}>
                        <span className={`inline-flex h-full w-full rounded-full ${isRunning ? 'bg-emerald-500 shadow-sm shadow-emerald-500' : 'bg-slate-400'}`} />
                      </span>
                      <h2 className="text-base font-extrabold tracking-tight text-[#0F172A] dark:text-white">
                        {mux.name}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isRunning
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30'
                        }`}
                      >
                        {isRunning ? 'RUNNING' : 'STOPPED'}
                      </span>
                    </div>
                    {mux.description && (
                      <p className="text-[11px] text-[#64748B] dark:text-[#A78BFA] line-clamp-1">
                        {mux.description}
                      </p>
                    )}
                  </div>

                  {/* Top quick controls */}
                  <div className="flex items-center gap-1.5">
                    {isRunning ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRestartMux(mux.id, mux.name)}
                          title="Restart MUX Process"
                          className="rounded-lg p-2 text-[#64748B] hover:text-violet-600 hover:bg-violet-50 dark:text-[#A78BFA] dark:hover:bg-[#2B1745] transition-colors"
                        >
                          <FiRefreshCw size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStopMux(mux.id, mux.name)}
                          title="Stop MUX"
                          className="rounded-lg bg-rose-50 dark:bg-rose-950/40 p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                        >
                          <FiSquare size={15} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartMux(mux.id, mux.name)}
                        title="Start MPTS MUX"
                        className="rounded-lg bg-emerald-600 p-2 text-white shadow-xs hover:bg-emerald-700 transition-colors"
                      >
                        <FiPlay size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2 Columns: Input Summary & Output Summary */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#E8EDF5] dark:border-[#311B4E] text-xs">
                  {/* Left Column: Input Programs */}
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1E1233] p-3 border border-[#E8EDF5] dark:border-[#371F59] space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1">
                      <FiInbox size={12} /> Inputs ({mux.services?.length || 0} Programs)
                    </div>
                    <div className="text-[11px] text-[#475569] dark:text-[#D8C6E8] truncate font-medium">
                      {mux.services && mux.services.length > 0
                        ? mux.services.map(s => s.serviceName).join(', ')
                        : 'No services mapped'}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] font-mono">
                      TSID: #{mux.tsid || 1} | ONID: #{mux.onid || 1}
                    </div>
                  </div>

                  {/* Right Column: Output Egress */}
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1E1233] p-3 border border-[#E8EDF5] dark:border-[#371F59] space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <FiSend size={12} /> Output Egress Stream
                    </div>
                    <div className="font-mono font-bold text-xs text-[#0F172A] dark:text-white truncate">
                      udp://{mux.outputIp}:{mux.outputPort}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] font-mono">
                      Target: {mux.targetBitrateMbps || 30} Mbps CBR
                    </div>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#64748B] dark:text-[#A78BFA]">
                    <span>Bandwidth Allocation & Null Stuffing:</span>
                    <span className={`font-mono font-bold ${isOverCapacity ? 'text-rose-600' : isWarning ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {stats ? `${(stats.totalInputKbps / 1000).toFixed(2)} / ${mux.targetBitrateMbps} Mbps` : `${mux.services?.length || 0} services configured`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#371F59]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverCapacity
                          ? 'bg-rose-600'
                          : isWarning
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, capacityPercent || 50))}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-4 pt-3 flex items-center justify-between border-t border-[#E8EDF5] dark:border-[#311B4E]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(mux)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-[#371F59] bg-white dark:bg-[#1E1233] px-2.5 py-1 text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] hover:bg-[#F8FAFC] dark:hover:bg-[#2D184C] transition-colors"
                    >
                      <FiEdit2 size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openDuplicateModal(mux)}
                      title="Duplicate MUX"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-[#371F59] bg-white dark:bg-[#1E1233] px-2.5 py-1 text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] hover:bg-[#F8FAFC] dark:hover:bg-[#2D184C] transition-colors"
                    >
                      <FiCopy size={12} /> Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMux(mux.id, mux.name)}
                      className="rounded-lg p-1.5 text-[#94A3B8] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="Delete MUX"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedMuxId(selectedMuxId === mux.id ? null : mux.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-extrabold transition-colors ${
                      selectedMuxId === mux.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 hover:bg-violet-100'
                    }`}
                  >
                    <FiEye size={13} />
                    {selectedMuxId === mux.id ? 'Close Monitor' : '2-Column Monitor & Telemetry'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2-COLUMN LIVE MPTS CONFIDENCE MONITOR & TELEMETRY SECTION ── */}
      {selectedMux && (
        <div className="rounded-3xl border border-violet-500/30 bg-white/95 dark:bg-[#190E28]/98 p-6 shadow-xl backdrop-blur-xl space-y-6 animate-scale-up">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E8EDF5] dark:border-[#311B4E] pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md">
                <FiRadio size={20} />
              </span>
              <div>
                <h3 className="text-lg font-black text-[#0F172A] dark:text-white flex items-center gap-2">
                  Live MPTS Monitor: {selectedMux.name}
                  <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300">
                    {selectedMux.outputIp}:{selectedMux.outputPort}
                  </span>
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#A78BFA]">
                  2-Column real-time input program streams vs egress output bandwidth and supervisor telemetry
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMuxId(null)}
                className="rounded-xl border border-[#E2E8F0] dark:border-[#371F59] px-3.5 py-1.5 text-xs font-bold text-[#64748B] dark:text-[#A78BFA] hover:bg-[#F8FAFC] dark:hover:bg-[#26143F]"
              >
                Close Monitor
              </button>
            </div>
          </div>

          {/* ── 2-COLUMN MONITOR GRID (INPUTS vs OUTPUTS) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* COLUMN 1: Input Program Services (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                  <FiInbox size={14} /> Column 1: Input Program Services ({selectedMux.services?.length || 0})
                </h4>
                <span className="text-[10px] text-[#94A3B8]">Active Ingest Streams</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-[#F8FAFC] dark:bg-[#1E1233]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E8EDF5] dark:border-[#311B4E] bg-[#F1F5F9] dark:bg-[#281544] text-[10px] font-extrabold uppercase tracking-wider text-[#64748B] dark:text-[#C4B5FD]">
                      <th className="py-2.5 px-3">Prog / SID</th>
                      <th className="py-2.5 px-3">Service Name</th>
                      <th className="py-2.5 px-3">PIDs</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Bitrate</th>
                      <th className="py-2.5 px-3 text-right">Probe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EDF5] dark:divide-[#311B4E] font-medium">
                    {selectedMux.services && selectedMux.services.length > 0 ? (
                      selectedMux.services.map((svc) => {
                        const svcStats = activeStats?.inputs?.[svc.id];
                        const isSvcOnline = selectedMux.status === 'Running';
                        const bitrateKbps = svcStats ? svcStats.bitrateKbps : (svc.videoBitrateKbps || 4000);

                        return (
                          <tr key={svc.id} className="hover:bg-white/60 dark:hover:bg-[#25143E]/60 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-violet-700 dark:text-violet-300">
                              #{svc.serviceId}
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              <div>{svc.serviceName || `Service ${svc.serviceId}`}</div>
                              <div className="text-[10px] font-normal text-[#94A3B8] truncate max-w-xs">{svc.inputUrl}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-[#475569] dark:text-[#D8C6E8]">
                              V: {svc.videoPid} | A: {svc.audioStreams?.[0]?.audioPid || '0x102'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isSvcOnline
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-slate-500/10 text-slate-500'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isSvcOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                {isSvcOnline ? 'ONLINE' : 'OFFLINE'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[#0F172A] dark:text-white">
                              {isSvcOnline ? `${(bitrateKbps / 1000).toFixed(2)} Mbps` : '0 Mbps'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleProbeInput(svc.inputUrl)}
                                className="rounded-lg bg-violet-600/10 dark:bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300 hover:bg-violet-600 hover:text-white transition-colors"
                              >
                                Test
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-xs text-[#94A3B8]">
                          No program services mapped
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* COLUMN 2: Output Egress & Supervisor Telemetry (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <FiSend size={14} /> Column 2: Output Egress Stream
                </h4>
                <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                  PID: {selectedMux.pid || '—'}
                </span>
              </div>

              {/* Output Endpoint Box */}
              <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-[#F8FAFC] dark:bg-[#1E1233] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[#94A3B8]">Egress Multicast Target</span>
                    <div className="font-mono font-extrabold text-sm text-[#0F172A] dark:text-white">
                      udp://{selectedMux.outputIp}:{selectedMux.outputPort}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`udp://@${selectedMux.outputIp}:${selectedMux.outputPort}?pkt_size=${selectedMux.packetSize || 1316}&ttl=${selectedMux.ttl || 16}`);
                      toast.success('Egress UDP stream URL copied!');
                    }}
                    className="rounded-lg border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-2.5 py-1 text-[11px] font-bold text-violet-600 hover:bg-violet-50 dark:text-violet-300 transition-colors flex items-center gap-1"
                  >
                    <FiCopy size={11} /> Copy URL
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold pt-1">
                  <div className="rounded-xl bg-white dark:bg-[#281544] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                    <div className="text-[10px] text-[#94A3B8] uppercase">Target Egress</div>
                    <div className="mt-0.5 text-sm font-mono text-violet-700 dark:text-violet-300 font-extrabold">
                      {selectedMux.targetBitrateMbps || 30} Mbps CBR
                    </div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-[#281544] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                    <div className="text-[10px] text-[#94A3B8] uppercase">Uptime</div>
                    <div className="mt-0.5 text-sm font-mono text-[#0F172A] dark:text-white">
                      {activeStats ? `${Math.floor(activeStats.uptimeSeconds / 60)}m ${activeStats.uptimeSeconds % 60}s` : '0s'}
                    </div>
                  </div>
                </div>

                {/* Console stderr log output */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold uppercase text-[#94A3B8] flex items-center gap-1">
                    <FiTerminal size={11} className="text-emerald-500" /> Live Supervisor Log Output
                  </span>
                  <div className="rounded-xl bg-[#0D0714] p-3 font-mono text-[10px] text-emerald-400 overflow-y-auto max-h-32 scrollbar-thin space-y-1">
                    {muxLogs.length > 0 ? (
                      muxLogs.map((log, lIdx) => (
                        <div key={lIdx} className="leading-relaxed whitespace-pre-wrap break-all">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-[#64748B] italic">Awaiting telemetry logs...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SEPARATE SECTION: MPTS SETTINGS & PSI/SI TABLE ENGINE ── */}
          <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#311B4E] bg-[#F8FAFC] dark:bg-[#1E1233] p-4.5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#E8EDF5] dark:border-[#311B4E] pb-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                <FiShield size={14} /> MPTS Settings & DVB PSI/SI Table Specifications
              </h4>
              <span className="text-[10px] font-mono text-[#94A3B8]">DVB / ISO-13818 Compliance</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-white dark:bg-[#281544] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                <span className="text-[10px] text-[#94A3B8] font-bold uppercase">Transport Stream ID (TSID)</span>
                <p className="font-mono font-bold text-sm text-[#0F172A] dark:text-white">#{selectedMux.tsid || 1}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[#281544] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                <span className="text-[10px] text-[#94A3B8] font-bold uppercase">Original Network ID (ONID)</span>
                <p className="font-mono font-bold text-sm text-[#0F172A] dark:text-white">#{selectedMux.onid || 1}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[#281544] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                <span className="text-[10px] text-[#94A3B8] font-bold uppercase">Network ID (NID)</span>
                <p className="font-mono font-bold text-sm text-[#0F172A] dark:text-white">#{selectedMux.nid || 1}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-[#281544] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                <span className="text-[10px] text-[#94A3B8] font-bold uppercase">Packet Size & TTL</span>
                <p className="font-mono font-bold text-sm text-[#0F172A] dark:text-white">{selectedMux.packetSize || 1316}B / TTL {selectedMux.ttl || 16}</p>
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[10px] font-bold uppercase text-[#94A3B8]">Generated MPTS Command Pipeline:</span>
              <div className="mt-1 rounded-xl bg-[#0D0714] p-3 font-mono text-[10px] text-violet-200 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-20 scrollbar-thin">
                {selectedMux.generatedCommand || 'Pipeline string configured on runtime startup.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT MUX MODAL: 2-COLUMN INPUTS/OUTPUTS + SEPARATE MPTS SETTINGS ── */}
      {isEditorOpen && editingMux && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-5xl rounded-3xl border border-[#E8EDF5] dark:border-[#371F59] bg-white dark:bg-[#180D26] shadow-2xl overflow-hidden animate-scale-up my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E8EDF5] dark:border-[#311B4E] px-6 py-4 bg-[#F8FAFC] dark:bg-[#1E1233]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md">
                  <FiSliders size={20} />
                </span>
                <div>
                  <h2 className="text-base font-black text-[#0F172A] dark:text-white">
                    {muxList.some(m => m.id === editingMux.id) ? `Edit MUX: ${editingMux.name}` : 'Create New MPTS Multiplexer'}
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#A78BFA]">
                    2-Column Input Services & Egress Output Architecture with Separate MPTS DVB Settings
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-xl border border-[#CBD5E1] dark:border-[#371F59] p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setEditorViewMode('studio')}
                    className={`rounded-lg px-3 py-1 transition-colors ${editorViewMode === 'studio' ? 'bg-violet-600 text-white' : 'text-[#64748B] dark:text-[#A78BFA]'}`}
                  >
                    2-Column Studio
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorViewMode('pipeline')}
                    className={`rounded-lg px-3 py-1 transition-colors ${editorViewMode === 'pipeline' ? 'bg-violet-600 text-white' : 'text-[#64748B] dark:text-[#A78BFA]'}`}
                  >
                    Pipeline Preview
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => { setIsEditorOpen(false); setEditingMux(null); }}
                  className="rounded-xl p-2 text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white transition-colors"
                >
                  <FiX size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[72vh] overflow-y-auto space-y-6">
              {editorViewMode === 'studio' ? (
                <>
                  {/* Top Bar: MUX Display Name & Description */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-violet-50/60 dark:bg-violet-950/20 p-4 rounded-2xl border border-violet-500/20">
                    <div>
                      <label className="block text-xs font-bold text-[#334155] dark:text-[#E2D1F9] mb-1">
                        MUX Display Name *
                      </label>
                      <input
                        type="text"
                        value={editingMux.name}
                        onChange={(e) => setEditingMux({ ...editingMux, name: e.target.value })}
                        className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3.5 py-2 text-xs font-bold text-[#0F172A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                        placeholder="e.g. KASHTRIX-MPTS-01"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#334155] dark:text-[#E2D1F9] mb-1">
                        Description / Application
                      </label>
                      <input
                        type="text"
                        value={editingMux.description || ''}
                        onChange={(e) => setEditingMux({ ...editingMux, description: e.target.value })}
                        className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3.5 py-2 text-xs text-[#0F172A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                        placeholder="e.g. Broadcast DVB Transport Stream for QAM / IRD"
                      />
                    </div>
                  </div>

                  {/* ── 2 COLUMNS: INPUTS (LEFT) vs OUTPUTS (RIGHT) ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    {/* LEFT COLUMN: INPUT PROGRAM SERVICES (7 cols) */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* One-Click Auto-Discovery Browser */}
                      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                            <FiTv size={14} /> Available Channels & VOD Feeds
                          </span>
                          <button
                            type="button"
                            onClick={fetchSources}
                            className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                          >
                            <FiRefreshCw size={11} /> Refresh Sources
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                            <input
                              type="text"
                              placeholder="Search channels or VOD streams..."
                              value={sourceSearch}
                              onChange={(e) => setSourceSearch(e.target.value)}
                              className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] pl-9 pr-3 py-1.5 text-xs text-[#0F172A] dark:text-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleAddDiscoveredSources}
                            disabled={selectedSourceIds.length === 0}
                            className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50 transition-colors"
                          >
                            + Add ({selectedSourceIds.length})
                          </button>
                        </div>

                        <div className="max-h-32 overflow-y-auto rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] divide-y divide-[#E8EDF5] dark:divide-[#311B4E]">
                          {availableSources.filter(s => !sourceSearch || s.name.toLowerCase().includes(sourceSearch.toLowerCase())).map(s => {
                            const isSelected = selectedSourceIds.includes(s.id);
                            const isAlreadyAdded = editingMux.services.some(svc => svc.inputUrl === s.inputUrl);

                            return (
                              <div
                                key={s.id}
                                onClick={() => {
                                  if (isAlreadyAdded) return;
                                  setSelectedSourceIds(prev =>
                                    isSelected ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                  );
                                }}
                                className={`flex items-center justify-between p-2 text-xs cursor-pointer transition-colors ${
                                  isAlreadyAdded
                                    ? 'opacity-40 bg-slate-100 dark:bg-slate-900 cursor-not-allowed'
                                    : isSelected
                                      ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-200'
                                      : 'hover:bg-[#F8FAFC] dark:hover:bg-[#201235]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected || isAlreadyAdded}
                                    disabled={isAlreadyAdded}
                                    onChange={() => {}}
                                    className="rounded text-violet-600 pointer-events-none"
                                  />
                                  <div>
                                    <div className="font-bold">{s.name}</div>
                                    <div className="text-[10px] text-[#94A3B8] font-mono truncate max-w-xs">{s.inputUrl}</div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-bold">
                                  <span className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 uppercase">
                                    {s.sourceType}
                                  </span>
                                  {isAlreadyAdded && <span className="text-emerald-500 font-bold">In MUX</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Input Source Adder */}
                      <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#371F59] bg-[#F8FAFC] dark:bg-[#1E1233] p-3.5 space-y-2">
                        <span className="text-xs font-bold text-[#475569] dark:text-[#C4B5FD] flex items-center gap-1">
                          <FiPlus size={13} /> Or Add Custom Input Stream (UDP / RTMP / SRT)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            placeholder="Service Name (e.g. ESPN HD)"
                            value={customInputName}
                            onChange={(e) => setCustomInputName(e.target.value)}
                            className="sm:col-span-4 rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs text-[#0F172A] dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder="Input URL (e.g. udp://127.0.0.1:5002)"
                            value={customInputUrl}
                            onChange={(e) => setCustomInputUrl(e.target.value)}
                            className="sm:col-span-6 rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono text-[#0F172A] dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomSource}
                            className="sm:col-span-2 rounded-xl bg-violet-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                          >
                            + Add
                          </button>
                        </div>
                      </div>

                      {/* Configured Program Services List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A] dark:text-white flex items-center gap-1.5">
                            <FiInbox size={14} /> Configured Services in MPTS ({editingMux.services.length})
                          </h3>

                          <button
                            type="button"
                            onClick={handleAutoAssignPids}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 transition-colors"
                          >
                            <FiZap size={13} /> Auto-Assign PIDs
                          </button>
                        </div>

                        {editingMux.services.map((svc, idx) => (
                          <div
                            key={svc.id || idx}
                            className="rounded-2xl border border-[#E8EDF5] dark:border-[#371F59] bg-[#F8FAFC] dark:bg-[#1E1233] p-3.5 space-y-3 shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-[#E8EDF5] dark:border-[#311B4E] pb-2">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-violet-600 text-white text-[11px] font-black">
                                  {idx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={svc.serviceName}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    list[idx].serviceName = e.target.value;
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="font-extrabold text-xs text-[#0F172A] dark:text-white bg-transparent border-b border-dashed border-slate-400 focus:border-violet-500 focus:outline-hidden"
                                  placeholder="Service Name"
                                />
                                <span className="text-[10px] text-[#94A3B8] font-mono">
                                  (SID: #{svc.serviceId})
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveService(idx, 'up')}
                                  disabled={idx === 0}
                                  title="Move Up"
                                  className="rounded p-1 text-[#94A3B8] hover:text-[#0F172A] disabled:opacity-30"
                                >
                                  <FiArrowUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveService(idx, 'down')}
                                  disabled={idx === editingMux.services.length - 1}
                                  title="Move Down"
                                  className="rounded p-1 text-[#94A3B8] hover:text-[#0F172A] disabled:opacity-30"
                                >
                                  <FiArrowDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleProbeInput(svc.inputUrl)}
                                  title="Test Input Source"
                                  className="rounded bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300"
                                >
                                  Test
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveService(svc.id)}
                                  title="Remove Service"
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                >
                                  <FiTrash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* URL & Mode */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold uppercase text-[#64748B] dark:text-[#A78BFA] mb-0.5">
                                  Input Source URL
                                </label>
                                <input
                                  type="text"
                                  value={svc.inputUrl}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    list[idx].inputUrl = e.target.value;
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1 text-xs font-mono text-[#0F172A] dark:text-white"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold uppercase text-[#64748B] dark:text-[#A78BFA] mb-0.5">
                                  Processing Mode
                                </label>
                                <select
                                  value={svc.mode}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    list[idx].mode = e.target.value as MuxProcessingMode;
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-2 py-1 text-xs font-bold text-[#0F172A] dark:text-white"
                                >
                                  <option value="copy">Pass Through (-c copy)</option>
                                  <option value="transcode">Transcode (Re-encode)</option>
                                </select>
                              </div>
                            </div>

                            {/* PIDs */}
                            <div className="grid grid-cols-4 gap-2 text-[10px]">
                              <div>
                                <span className="text-[#94A3B8]">SID #</span>
                                <input
                                  type="number"
                                  value={svc.serviceId}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    list[idx].serviceId = Number(e.target.value);
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="w-full rounded border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-1.5 py-0.5 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <span className="text-[#94A3B8]">PMT PID</span>
                                <input
                                  type="text"
                                  value={svc.pmtPid}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    list[idx].pmtPid = e.target.value;
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="w-full rounded border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-1.5 py-0.5 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <span className="text-[#94A3B8]">Video PID</span>
                                <input
                                  type="text"
                                  value={svc.videoPid}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    list[idx].videoPid = e.target.value;
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="w-full rounded border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-1.5 py-0.5 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <span className="text-[#94A3B8]">Audio PID</span>
                                <input
                                  type="text"
                                  value={svc.audioStreams?.[0]?.audioPid || '0x102'}
                                  onChange={(e) => {
                                    const list = [...editingMux.services];
                                    if (!list[idx].audioStreams || list[idx].audioStreams.length === 0) {
                                      list[idx].audioStreams = [{ streamIndex: 0, audioPid: e.target.value }];
                                    } else {
                                      list[idx].audioStreams[0].audioPid = e.target.value;
                                    }
                                    setEditingMux({ ...editingMux, services: list });
                                  }}
                                  className="w-full rounded border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-1.5 py-0.5 text-xs font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: OUTPUT EGRESS & BANDWIDTH ALLOCATION (5 cols) */}
                    <div className="lg:col-span-5 space-y-4">
                      {/* Egress Network Parameters Card */}
                      <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#371F59] bg-[#F8FAFC] dark:bg-[#1E1233] p-4 space-y-3.5 shadow-2xs">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <FiSend size={14} /> Output Egress Destination
                        </h3>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                              Multicast / Unicast Output IP *
                            </label>
                            <input
                              type="text"
                              value={editingMux.outputIp}
                              onChange={(e) => setEditingMux({ ...editingMux, outputIp: e.target.value })}
                              className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono font-bold text-[#0F172A] dark:text-white"
                              placeholder="e.g. 239.10.10.10"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                                UDP Port *
                              </label>
                              <input
                                type="number"
                                value={editingMux.outputPort}
                                onChange={(e) => setEditingMux({ ...editingMux, outputPort: Number(e.target.value) })}
                                className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono font-bold text-[#0F172A] dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                                Egress NIC Interface
                              </label>
                              <input
                                type="text"
                                value={editingMux.outputInterface || 'any'}
                                onChange={(e) => setEditingMux({ ...editingMux, outputInterface: e.target.value })}
                                className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono text-[#0F172A] dark:text-white"
                                placeholder="any / eth0"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Egress Bitrate & Capacity Meter Card */}
                      <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#371F59] bg-[#F8FAFC] dark:bg-[#1E1233] p-4 space-y-3 shadow-2xs">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                          <FiActivity size={14} /> CBR Capacity & Null-Stuffing Allocation
                        </h3>

                        <div>
                          <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                            Target MUX Constant Bitrate (Mbps) *
                          </label>
                          <input
                            type="number"
                            value={editingMux.targetBitrateMbps}
                            onChange={(e) => setEditingMux({ ...editingMux, targetBitrateMbps: Number(e.target.value) })}
                            className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono font-extrabold text-violet-700 dark:text-violet-300"
                          />
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span className="text-[#64748B] dark:text-[#A78BFA]">Payload vs Target:</span>
                            <span className={`font-mono font-bold ${capacityInfo.isOver ? 'text-rose-600' : capacityInfo.isWarning ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {capacityInfo.totalInputMbps} / {capacityInfo.targetMbps} Mbps ({capacityInfo.percent}%)
                            </span>
                          </div>

                          <div className="h-2 w-full overflow-hidden rounded-full bg-[#CBD5E1] dark:bg-[#2D1A45]">
                            <div
                              className={`h-full rounded-full transition-all ${
                                capacityInfo.isOver
                                  ? 'bg-rose-600'
                                  : capacityInfo.isWarning
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, capacityInfo.percent))}%` }}
                            />
                          </div>

                          {capacityInfo.isOver ? (
                            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <FiAlertTriangle size={12} /> Over-capacity: Input streams exceed target bandwidth.
                            </p>
                          ) : (
                            <p className="text-[10px] text-[#94A3B8]">
                              Remaining {(capacityInfo.targetMbps - capacityInfo.totalInputMbps).toFixed(2)} Mbps is filled with standard DVB Null Stuffing.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── SEPARATE SECTION: MPTS SETTINGS (DVB PSI/SI TRANSPORT PARAMETERS) ── */}
                  <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#371F59] bg-[#F8FAFC] dark:bg-[#1E1233] p-4.5 space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-[#E8EDF5] dark:border-[#311B4E] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600 dark:text-violet-300">
                          <FiShield size={16} />
                        </span>
                        <div>
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A] dark:text-white">
                            MPTS Settings (DVB PSI/SI Table & Stream Engine)
                          </h4>
                          <p className="text-[10px] text-[#64748B] dark:text-[#A78BFA]">
                            Transport Stream IDs, Original Network Identifiers, Packetization & 24/7 Automation
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                          TSID (Transport Stream ID)
                        </label>
                        <input
                          type="number"
                          value={editingMux.tsid}
                          onChange={(e) => setEditingMux({ ...editingMux, tsid: Number(e.target.value) })}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono text-[#0F172A] dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                          ONID (Original Network ID)
                        </label>
                        <input
                          type="number"
                          value={editingMux.onid}
                          onChange={(e) => setEditingMux({ ...editingMux, onid: Number(e.target.value) })}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono text-[#0F172A] dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                          NID (Network ID)
                        </label>
                        <input
                          type="number"
                          value={editingMux.nid}
                          onChange={(e) => setEditingMux({ ...editingMux, nid: Number(e.target.value) })}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono text-[#0F172A] dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                          Packet Size (Bytes)
                        </label>
                        <select
                          value={editingMux.packetSize}
                          onChange={(e) => setEditingMux({ ...editingMux, packetSize: Number(e.target.value) })}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-bold text-[#0F172A] dark:text-white"
                        >
                          <option value={1316}>1316 Bytes (7 TS Packets - DVB/Broadcast Standard)</option>
                          <option value={188}>188 Bytes (Single TS Packet)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] dark:text-[#C4B5FD] mb-1">
                          Multicast TTL (Time To Live)
                        </label>
                        <input
                          type="number"
                          value={editingMux.ttl}
                          onChange={(e) => setEditingMux({ ...editingMux, ttl: Number(e.target.value) })}
                          className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#180D26] px-3 py-1.5 text-xs font-mono text-[#0F172A] dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-[#E8EDF5] dark:border-[#311B4E]">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#334155] dark:text-[#E2D1F9]">
                        <input
                          type="checkbox"
                          checked={editingMux.autoStart !== false}
                          onChange={(e) => setEditingMux({ ...editingMux, autoStart: e.target.checked })}
                          className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        Auto-Start MUX on System Boot
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#334155] dark:text-[#E2D1F9]">
                        <input
                          type="checkbox"
                          checked={editingMux.autoRestart !== false}
                          onChange={(e) => setEditingMux({ ...editingMux, autoRestart: e.target.checked })}
                          className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        Auto-Restart on Crash (24/7 Supervisor Resilience)
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                /* PIPELINE PREVIEW TAB */
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#E8EDF5] dark:border-[#371F59] bg-[#F8FAFC] dark:bg-[#1E1233] p-4 space-y-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                      <FiTerminal size={14} /> Generated MPTS FFmpeg Pipeline Command
                    </h3>
                    <p className="text-[11px] text-[#64748B] dark:text-[#A78BFA]">
                      This pipeline is dynamically compiled and managed by the MPTS supervisor process.
                    </p>

                    <div className="rounded-xl bg-[#0D0714] p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                      {`ffmpeg -hide_banner ${editingMux.services.map(s => `-thread_queue_size 2048 -i "${s.inputUrl}"`).join(' ')} ${editingMux.services.map((s, i) => `-map ${i}:v:0? -map ${i}:a:0? ${s.mode === 'copy' ? `-c:v:${i} copy -c:a:${i} copy` : `-c:v:${i} libx264 -b:v:${i} ${s.videoBitrateKbps || 3500}k -c:a:${i} aac -b:a:${i} 192k`}`).join(' ')} ${editingMux.services.map((s, i) => `-program title="${s.serviceName}":service_name="${s.serviceName}":service_provider="StreamOps":program_num=${s.serviceId}:pmt_pid=${s.pmtPid}:pcr_pid=${s.videoPid}:st=${i * 2}:st=${i * 2 + 1}`).join(' ')} -f mpegts -muxrate ${Math.round(editingMux.targetBitrateMbps * 1000000)} -ts_id ${editingMux.tsid} -ts_original_network_id ${editingMux.onid} -ts_network_id ${editingMux.nid} -pcr_period 20 -pat_period 0.1 -sdt_period 0.5 "udp://${editingMux.outputIp}:${editingMux.outputPort}?pkt_size=${editingMux.packetSize}&ttl=${editingMux.ttl}&buffer_size=10485760&bitrate=${Math.round(editingMux.targetBitrateMbps * 1000000)}"`}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-[#E8EDF5] dark:border-[#311B4E] px-6 py-4 bg-[#F8FAFC] dark:bg-[#1E1233]">
              <button
                type="button"
                onClick={() => { setIsEditorOpen(false); setEditingMux(null); }}
                className="rounded-xl border border-[#CBD5E1] dark:border-[#371F59] px-4 py-2 text-xs font-bold text-[#64748B] dark:text-[#A78BFA] hover:bg-white dark:hover:bg-[#2A1747] transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveMux}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <FiCheck size={16} />
                {saving ? 'Saving MPTS MUX...' : 'Save MPTS Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROBE / TEST INPUT SIGNAL MODAL ── */}
      {isProbeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E8EDF5] dark:border-[#371F59] bg-white dark:bg-[#180D26] shadow-2xl p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#E8EDF5] dark:border-[#311B4E] pb-3">
              <h3 className="text-sm font-extrabold text-[#0F172A] dark:text-white flex items-center gap-2">
                <FiActivity className="text-violet-500" /> Live FFprobe Signal Inspector
              </h3>
              <button type="button" onClick={() => setIsProbeOpen(false)} className="text-[#94A3B8] hover:text-[#0F172A]">
                <FiX size={18} />
              </button>
            </div>

            <div className="text-xs font-mono text-[#64748B] dark:text-[#A78BFA] break-all">
              Probing: <span className="text-violet-700 dark:text-violet-300 font-bold">{probingUrl}</span>
            </div>

            {!probeResult ? (
              <div className="py-8 text-center space-y-2">
                <FiRefreshCw className="animate-spin mx-auto text-violet-500" size={24} />
                <p className="text-xs text-[#94A3B8]">Analyzing transport stream & PID tables...</p>
              </div>
            ) : probeResult.success ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1E1233] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                    <span className="text-[#94A3B8]">Format / Container</span>
                    <p className="font-bold font-mono">{probeResult.format?.toUpperCase()}</p>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#1E1233] p-2.5 border border-[#E8EDF5] dark:border-[#371F59]">
                    <span className="text-[#94A3B8]">Detected Bitrate</span>
                    <p className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{probeResult.bitrateKbps} Kbps</p>
                  </div>
                </div>

                {probeResult.video && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                    <div className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">Video Stream Detected</div>
                    <div className="font-mono text-[11px]">
                      Codec: {probeResult.video.codec} | {probeResult.video.width}x{probeResult.video.height} @ {probeResult.video.fps} fps
                    </div>
                  </div>
                )}

                {probeResult.audioTracks && probeResult.audioTracks.length > 0 && (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-1">
                    <div className="font-bold text-violet-600 dark:text-violet-300 text-xs">
                      Audio Tracks ({probeResult.audioTracks.length})
                    </div>
                    {probeResult.audioTracks.map((a: any, idx: number) => (
                      <div key={idx} className="font-mono text-[11px]">
                        Track #{idx + 1}: {a.codec} ({a.channels}ch, {a.samplerate}Hz, {a.lang})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-600 dark:text-rose-400 space-y-1">
                <div className="font-bold">Probe Failed / No Signal</div>
                <div className="font-mono text-[11px]">{probeResult.error}</div>
              </div>
            )}

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setIsProbeOpen(false)}
                className="rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DUPLICATE MODAL ── */}
      {duplicateMuxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-3xl border border-[#E8EDF5] dark:border-[#371F59] bg-white dark:bg-[#180D26] shadow-2xl p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#E8EDF5] dark:border-[#311B4E] pb-3">
              <h3 className="text-sm font-extrabold text-[#0F172A] dark:text-white flex items-center gap-2">
                <FiCopy className="text-violet-500" /> Duplicate MPTS MUX
              </h3>
              <button type="button" onClick={() => setDuplicateMuxId(null)} className="text-[#94A3B8] hover:text-[#0F172A]">
                <FiX size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold mb-1">New MUX Name</label>
                <input
                  type="text"
                  value={dupName}
                  onChange={(e) => setDupName(e.target.value)}
                  className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#1E1233] px-3 py-2 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-1">Output IP</label>
                  <input
                    type="text"
                    value={dupIp}
                    onChange={(e) => setDupIp(e.target.value)}
                    className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#1E1233] px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Output Port</label>
                  <input
                    type="number"
                    value={dupPort}
                    onChange={(e) => setDupPort(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#CBD5E1] dark:border-[#371F59] bg-white dark:bg-[#1E1233] px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateMuxId(null)}
                className="rounded-xl border border-[#CBD5E1] dark:border-[#371F59] px-3.5 py-1.5 text-xs font-bold text-[#64748B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDuplicateSubmit}
                className="rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-violet-700"
              >
                Create Duplicate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
