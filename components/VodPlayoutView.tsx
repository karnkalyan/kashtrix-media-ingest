import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowRight,
  Cast,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FastForward,
  FileVideo,
  Film,
  Filter,
  Grid,
  HardDrive,
  Layers,
  List,
  Loader2,
  Monitor,
  Play,
  PlayCircle,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  StopCircle,
  Trash2,
  Tv,
  Upload,
  UploadCloud,
  Video,
  X,
  Zap,
  Server
} from 'lucide-react';
import { AppSettings, Channel, ChannelDestination, ChannelStatus, Destination, InputType, Protocol, StorageLocation, TranscodingProfile } from '../types';
import { DEFAULT_DECKLINK_FORMATS, DEFAULT_PROFILES, LIVE_PROTOCOL_OPTIONS } from '../constants';
import DetailDrawer from './ui/DetailDrawer';
import ConfirmDialog from './ui/ConfirmDialog';
import { KashtrixMediaPlayer } from './ui/KashtrixMediaPlayer';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import Select from './ui/Select';

const API_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const WEB_ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';

const defaultUrl = (protocol: Protocol, name: string, settings: AppSettings, streamKey = '') => {
  const slug = safeName(name);
  switch (protocol) {
    case Protocol.HLS:
      return `${WEB_ORIGIN}/live/${slug}/index.m3u8`;
    case Protocol.DASH:
      return `${WEB_ORIGIN}/dash/${slug}/index.mpd`;
    case Protocol.RTMP:
      return `rtmp://${API_HOST}:${settings?.rtmpPort || 1935}/live/${slug}`;
    case Protocol.YOUTUBE:
      return `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
    case Protocol.FACEBOOK:
      return `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;
    case Protocol.CUSTOM:
      return `rtmp://${API_HOST}:${settings?.rtmpPort || 1935}/live/${slug}`;
    case Protocol.SRT:
      return `srt://127.0.0.1:9001?mode=caller`;
    case Protocol.UDP:
    case Protocol.UDP_DVB:
      return `udp://224.1.1.2:3000`;
    case Protocol.HTTP_TS:
      return `${WEB_ORIGIN}/ts/${slug}.ts`;
    case Protocol.DECKLINK:
      return '';
    case Protocol.RECORDING:
      return `media/recordings/${slug}.mp4`;
    default:
      return '';
  }
};

const playbackUrl = (protocol: Protocol, name: string, settings: AppSettings, url: string) => {
  const slug = safeName(name);
  if (protocol === Protocol.HLS) return `${WEB_ORIGIN}/live/${slug}/index.m3u8`;
  if (protocol === Protocol.DASH) return `${WEB_ORIGIN}/dash/${slug}/index.mpd`;
  if (protocol === Protocol.RECORDING) return '';
  return url;
};

interface VodItem {
  id: string | number;
  name: string;
  originalName?: string;
  filePath?: string;
  size?: number;
  duration?: number;
  format?: string;
  type: 'vod' | 'recording';
  created_at?: string;
  thumbnail?: string;
}

interface VodPlayoutViewProps {
  settings: AppSettings;
  profiles?: TranscodingProfile[];
  channels?: Channel[];
  addChannel?: (channelData: any) => Promise<any>;
  onNavigateToTranscode?: (file: { id?: string | number; name: string; path?: string; type: 'vod' | 'recording' }) => void;
  onNavigateToChannels?: () => void;
}

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const formatSeconds = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  }
  return `${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
};

export const VodPlayoutView: React.FC<VodPlayoutViewProps> = ({
  settings,
  profiles = DEFAULT_PROFILES,
  channels = [],
  addChannel,
  onNavigateToTranscode,
  onNavigateToChannels,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'vod' | 'recordings'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const [vodFiles, setVodFiles] = useState<VodItem[]>([]);
  const [recordings, setRecordings] = useState<VodItem[]>([]);

  // Media Preview & Deletion State
  const [previewItem, setPreviewItem] = useState<VodItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<VodItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Playout Channel Creator Drawer State
  const [playoutDrawerOpen, setPlayoutDrawerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<VodItem | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id || 'live-http-ts-1');
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [creatingChannel, setCreatingChannel] = useState(false);

  // Hardware DeckLink Devices & Formats
  const [decklinkDevices, setDecklinkDevices] = useState<{ id: string; name: string }[]>([]);
  const [decklinkFormats, setDecklinkFormats] = useState<Record<string, any[]>>({});

  // Fetch DeckLink Hardware Devices
  const fetchDecklinkDevices = async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ffmpeg/devices?refresh=true', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to load capture devices');
      const structured = Array.isArray(data.decklinkDevices) && data.decklinkDevices.length > 0
        ? data.decklinkDevices
        : Object.keys(data.decklinkMap || {}).length > 0
          ? Object.entries(data.decklinkMap).map(([name, id]) => ({ id: String(id), name }))
          : (Array.isArray(data.video) ? data.video : []).map((name: string) => ({ id: name, name }));
      const dlink = structured.filter((d: any) =>
        d.id?.includes(':') || d.name?.toLowerCase().includes('decklink') || d.name?.toLowerCase().includes('intensity')
      );
      setDecklinkDevices(dlink);
    } catch (e) {
      setDecklinkDevices([]);
    }
  };

  const fetchDecklinkFormats = async (deviceId: string) => {
    if (!deviceId || decklinkFormats[deviceId]) return;
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ffmpeg/devices/${encodeURIComponent(deviceId)}/formats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.formats) && data.formats.length > 0) {
        setDecklinkFormats(prev => ({ ...prev, [deviceId]: data.formats }));
      } else {
        setDecklinkFormats(prev => ({ ...prev, [deviceId]: DEFAULT_DECKLINK_FORMATS }));
      }
    } catch (e) {
      setDecklinkFormats(prev => ({ ...prev, [deviceId]: DEFAULT_DECKLINK_FORMATS }));
    }
  };

  // Fetch All Media Files
  const fetchAllMedia = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [vodRes, recRes] = await Promise.all([
        fetch('/api/vod/list', { headers }).then(r => r.json()).catch(() => ([])),
        fetch('/api/ingest/recordings?limit=250', { headers }).then(r => r.json()).catch(() => ({ recordings: [] })),
      ]);

      if (Array.isArray(vodRes)) {
        setVodFiles(vodRes.map(v => ({
          id: v.name,
          name: v.originalName || v.name,
          originalName: v.originalName || v.name,
          filePath: `media/vod/${v.name}`,
          size: v.size || 0,
          type: 'vod',
          format: v.name.split('.').pop() || 'mp4',
        })));
      }

      if (Array.isArray(recRes.recordings)) {
        setRecordings(recRes.recordings.map((r: any) => ({
          id: r.id,
          name: r.file_name || `Recording #${r.id}`,
          originalName: r.file_name || `Recording #${r.id}`,
          filePath: r.file_path,
          size: Number(r.size || 0),
          duration: Number(r.duration || 0),
          type: 'recording',
          format: r.format || 'mp4',
          created_at: r.start_time,
          thumbnail: `/recording-thumbnail/${r.id}.jpg`,
        })));
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllMedia();
    fetchDecklinkDevices();
  }, []);

  // Upload VOD File
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('vodFile', file);

    setUploading(true);
    setUploadProgress(10);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/vod/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to upload VOD file');

      toast.success(`Uploaded: ${file.name}`);
      fetchAllMedia();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  // Delete Media File
  const confirmDeleteMedia = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (deletingItem.type === 'vod') {
        const res = await fetch(`/api/vod/${encodeURIComponent(String(deletingItem.id))}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) throw new Error('Failed to delete VOD file');
        toast.success('VOD file deleted');
      } else {
        const res = await fetch(`/api/ingest/recordings/${encodeURIComponent(String(deletingItem.id))}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) throw new Error('Failed to delete recording');
        toast.success('Recording deleted');
      }
      fetchAllMedia();
    } catch (e: any) {
      toast.error(e.message || 'Deletion failed');
    } finally {
      setDeleteLoading(false);
      setDeletingItem(null);
    }
  };

  // Open Playout Creator Drawer
  const openPlayoutCreator = (media: VodItem) => {
    setSelectedMedia(media);
    const cleanName = media.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const chName = `VOD_${cleanName}`;
    setChannelName(chName);
    setChannelDescription(`VOD Playout Stream: ${media.name}`);

    const defaultDest: Destination = {
      id: 'dest_1',
      protocol: Protocol.DECKLINK,
      url: decklinkDevices[0]?.id || '75:05326625:00000000',
      decklinkDeviceId: decklinkDevices[0]?.id || '75:05326625:00000000',
      decklinkDeviceName: decklinkDevices[0]?.name || 'DeckLink SDI 4K',
      decklinkFormatCode: 'Hi50',
    };
    setDestinations([defaultDest]);
    if (defaultDest.decklinkDeviceId) {
      fetchDecklinkFormats(defaultDest.decklinkDeviceId);
    }
    setPlayoutDrawerOpen(true);
  };

  // Add Destination
  const addDestination = (protocol: Protocol = Protocol.DECKLINK) => {
    const nextId = `dest_${Date.now()}`;
    if (protocol === Protocol.DECKLINK) {
      const dev = decklinkDevices[0];
      const newDest: Destination = {
        id: nextId,
        protocol: Protocol.DECKLINK,
        url: dev?.id || '75:05326625:00000000',
        decklinkDeviceId: dev?.id || '75:05326625:00000000',
        decklinkDeviceName: dev?.name || 'DeckLink SDI 4K',
        decklinkFormatCode: 'Hi50',
      };
      setDestinations(prev => [...prev, newDest]);
      if (dev?.id) fetchDecklinkFormats(dev.id);
    } else {
      const url = defaultUrl(protocol, channelName || 'vod_channel', settings);
      const playUrl = playbackUrl(protocol, channelName || 'vod_channel', settings, url);
      const newDest: Destination = {
        id: nextId,
        protocol,
        url,
        playbackUrl: playUrl,
      };
      setDestinations(prev => [...prev, newDest]);
    }
  };

  const updateDestination = (id: string, updates: Partial<Destination>) => {
    setDestinations(prev => prev.map(d => (d.id === id ? { ...d, ...updates } : d)));
  };

  const removeDestination = (id: string) => {
    setDestinations(prev => prev.filter(d => d.id !== id));
  };

  // Launch Playout Channel
  const handleLaunchPlayout = async () => {
    if (!selectedMedia) return toast.error('Source media is missing');
    if (!channelName.trim()) return toast.error('Channel name is required');
    if (destinations.length === 0) return toast.error('At least one output destination is required');

    setCreatingChannel(true);
    try {
      const isVodDirect = selectedMedia.type === 'vod';
      const inputUrl = isVodDirect ? String(selectedMedia.id) : (selectedMedia.filePath || selectedMedia.name);
      const primaryDest = destinations[0];

      const newChannel: Channel = {
        id: `vod_ch_${Date.now()}`,
        name: channelName.trim(),
        inputType: InputType.VOD,
        inputUrl: String(inputUrl),
        outputUrl: primaryDest?.url || '',
        outputProtocol: primaryDest?.protocol || Protocol.DECKLINK,
        destinations,
        profileId: selectedProfileId,
        status: ChannelStatus.Stopped,
        command: '',
        uptime: 0,
        speed: 0,
        speedHistory: [],
        outputLog: [],
      };

      if (addChannel) {
        await addChannel({
          name: channelName.trim(),
          inputType: InputType.VOD,
          inputUrl: String(inputUrl),
          outputUrl: primaryDest?.url || '',
          outputProtocol: primaryDest?.protocol || Protocol.DECKLINK,
          destinations,
          profileId: selectedProfileId,
        });
        toast.success(`Playout channel "${channelName}" created!`);
        setPlayoutDrawerOpen(false);
        if (onNavigateToChannels) onNavigateToChannels();
      } else {
        const token = localStorage.getItem('kte-auth-token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('/api/channels', {
          method: 'POST',
          headers,
          body: JSON.stringify(newChannel),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to create playout channel');

        // Start channel immediately
        await fetch(`/api/channels/${data.channel?.id || newChannel.id}/start`, { method: 'POST', headers });

        toast.success(`Playout channel "${channelName}" launched!`);
        setPlayoutDrawerOpen(false);
        if (onNavigateToChannels) onNavigateToChannels();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to launch playout channel');
    } finally {
      setCreatingChannel(false);
    }
  };

  // Filtered Media
  const allMediaItems = useMemo(() => {
    const items: VodItem[] = [];
    if (activeTab === 'all' || activeTab === 'vod') {
      items.push(...vodFiles);
    }
    if (activeTab === 'all' || activeTab === 'recordings') {
      items.push(...recordings);
    }
    return items.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.format?.toLowerCase().includes(q);
    });
  }, [activeTab, vodFiles, recordings, searchQuery]);

  const totalStorageSize = useMemo(() => {
    const vodBytes = vodFiles.reduce((acc, v) => acc + (v.size || 0), 0);
    const recBytes = recordings.reduce((acc, r) => acc + (r.size || 0), 0);
    return { vodBytes, recBytes, total: vodBytes + recBytes };
  }, [vodFiles, recordings]);

  return (
    <div className="vod-playout-view page-stack space-y-4">
      {/* Top Banner Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F4EEFF] text-[#7C3AED] dark:bg-[#311754] dark:text-[#A78BFA]">
              <Tv size={14} />
            </span>
            <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">
              VOD Media Library & Playout Hub
            </h1>
          </div>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Unified media files library (Uploaded VODs & Master Recordings), multi-destination channel playout, DeckLink SDI/HDMI output, and studio transcoding
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#7C3AED] bg-[#F4EEFF] px-3 text-[12px] font-bold text-[#7C3AED] hover:bg-[#EDE5FB] dark:bg-[#311754] dark:border-[#A78BFA] dark:text-[#C4B5FD]">
            <Upload size={13} /> {uploading ? 'Uploading...' : 'Upload VOD File'}
            <input
              type="file"
              accept="video/*,.mp4,.mov,.mkv,.ts,.flv,.avi,.m4v"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={fetchAllMedia}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2F1A4B]"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-[#7C3AED] dark:bg-purple-950/50 dark:text-[#C4B5FD]">
            <FileVideo size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Total Media Files</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">
              {vodFiles.length + recordings.length}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[#059669] dark:bg-emerald-950/50 dark:text-[#34D399]">
            <UploadCloud size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Uploaded VODs</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">{vodFiles.length}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <Archive size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Recordings Library</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">{recordings.length}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <HardDrive size={18} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Total Media Storage</div>
            <div className="font-mono text-[18px] font-bold text-[#1B1024] dark:text-white">
              {formatBytes(totalStorageSize.total)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden dark:bg-[#190E28] dark:border-[#311B4E]">
        {/* Filter Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] p-3 dark:border-[#311B4E]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#351147] text-white dark:bg-[#6D32D9]'
                  : 'text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#351147] dark:text-[#B9A5CD] dark:hover:bg-[#2F1A4B] dark:hover:text-white'
              }`}
            >
              All Content ({vodFiles.length + recordings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vod')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                activeTab === 'vod'
                  ? 'bg-[#351147] text-white dark:bg-[#6D32D9]'
                  : 'text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#351147] dark:text-[#B9A5CD] dark:hover:bg-[#2F1A4B] dark:hover:text-white'
              }`}
            >
              Uploaded VOD ({vodFiles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recordings')}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                activeTab === 'recordings'
                  ? 'bg-[#351147] text-white dark:bg-[#6D32D9]'
                  : 'text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#351147] dark:text-[#B9A5CD] dark:hover:bg-[#2F1A4B] dark:hover:text-white'
              }`}
            >
              Recordings ({recordings.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search videos..."
                className="h-8 w-48 sm:w-60 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white dark:placeholder-[#8E78A6]"
              />
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#8E78A6]" />
            </div>

            <div className="flex h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 dark:bg-[#211335] dark:border-[#371F59]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded p-1 text-[12px] ${viewMode === 'grid' ? 'bg-white text-[#351147] font-semibold shadow-2xs dark:bg-[#371F59] dark:text-white' : 'text-[#6F6078] dark:text-[#8E78A6]'}`}
              >
                <Grid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded p-1 text-[12px] ${viewMode === 'table' ? 'bg-white text-[#351147] font-semibold shadow-2xs dark:bg-[#371F59] dark:text-white' : 'text-[#6F6078] dark:text-[#8E78A6]'}`}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Media Grid / Table */}
        {allMediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#F4EEFF] text-[#7C3AED] dark:bg-[#311754] dark:text-[#A78BFA]">
              <FileVideo size={24} />
            </div>
            <h3 className="mt-3 text-[14px] font-bold text-[#1B1024] dark:text-white">
              No media files found
            </h3>
            <p className="mt-1 max-w-sm text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
              Upload video files to your VOD storage or capture live broadcast recordings to populate your media library.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allMediaItems.map(item => (
              <div
                key={`${item.type}_${item.id}`}
                className="group flex flex-col justify-between rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs transition-all hover:border-[#7C3AED]/40 hover:shadow-md dark:bg-[#190E28] dark:border-[#311B4E]"
              >
                <div>
                  {/* Thumbnail / Video Box */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900 mb-2.5 flex items-center justify-center">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <Film size={28} className="text-neutral-600" />
                    )}

                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        item.type === 'vod'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-purple-600 text-white'
                      }`}>
                        {item.type === 'vod' ? 'VOD' : 'Recording'}
                      </span>
                      <span className="rounded bg-black/60 backdrop-blur-xs text-white px-1.5 py-0.5 text-[9px] font-mono uppercase">
                        {item.format}
                      </span>
                    </div>

                    {item.duration ? (
                      <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-xs">
                        {formatSeconds(item.duration)}
                      </div>
                    ) : null}

                    {/* Hover Play Button */}
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="absolute inset-0 m-auto grid h-10 w-10 place-items-center rounded-full bg-white/90 text-[#351147] opacity-0 transition-opacity group-hover:opacity-100 shadow-lg hover:scale-110"
                    >
                      <Play size={18} className="ml-0.5 fill-current" />
                    </button>
                  </div>

                  {/* Title & Info */}
                  <h4 className="font-semibold text-[13px] text-[#1B1024] dark:text-white truncate" title={item.name}>
                    {item.name}
                  </h4>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                    <span>{formatBytes(item.size)}</span>
                    {item.created_at && (
                      <>
                        <span>•</span>
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-3 grid grid-cols-2 gap-1.5 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
                  <button
                    type="button"
                    onClick={() => openPlayoutCreator(item)}
                    className="flex h-7 items-center justify-center gap-1 rounded-md bg-[#351147] px-2 text-[11px] font-bold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
                    title="Broadcast this file to DeckLink SDI or network streams"
                  >
                    <Tv size={12} /> Playout
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToTranscode?.({ id: item.id, name: item.name, path: item.filePath, type: item.type })}
                    className="flex h-7 items-center justify-center gap-1 rounded-md border border-[#7C3AED] bg-white px-2 text-[11px] font-bold text-[#7C3AED] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#A78BFA] dark:text-[#C4B5FD]"
                    title="Transcode this file with GPU encoder presets"
                  >
                    <Zap size={12} /> Transcode
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    className="flex h-6 items-center justify-center gap-1 rounded border border-[#E8DFF0] bg-white text-[10px] font-semibold text-[#6F6078] hover:bg-[#F8F7FA] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
                  >
                    <Play size={10} /> Preview
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingItem(item)}
                    className="flex h-6 items-center justify-center gap-1 rounded border border-[#E8DFF0] bg-white text-[10px] font-semibold text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
                  >
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Media Name</th>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Format</th>
                  <th className="px-4 py-2.5 font-bold">Duration</th>
                  <th className="px-4 py-2.5 font-bold">File Size</th>
                  <th className="px-4 py-2.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {allMediaItems.map(item => (
                  <tr key={`${item.type}_${item.id}`} className="hover:bg-[#F8F7FA]/70 dark:hover:bg-[#211335]/40">
                    <td className="px-4 py-2.5 font-semibold text-[#1B1024] dark:text-white max-w-[280px] truncate" title={item.name}>
                      <div className="flex items-center gap-2">
                        <FileVideo size={14} className={item.type === 'vod' ? 'text-emerald-500' : 'text-purple-500'} />
                        <span className="truncate">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        item.type === 'vod' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      }`}>
                        {item.type === 'vod' ? 'VOD File' : 'Recording'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono uppercase text-[#6F6078] dark:text-[#B9A5CD]">
                      {item.format}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                      {item.duration ? formatSeconds(item.duration) : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#1B1024] dark:text-white">
                      {formatBytes(item.size)}
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openPlayoutCreator(item)}
                        className="inline-flex items-center gap-1 rounded bg-[#351147] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9]"
                      >
                        <Tv size={11} /> Playout
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigateToTranscode?.({ id: item.id, name: item.name, path: item.filePath, type: item.type })}
                        className="inline-flex items-center gap-1 rounded border border-[#7C3AED] bg-white px-2.5 py-1 text-[11px] font-bold text-[#7C3AED] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#A78BFA] dark:text-[#C4B5FD]"
                      >
                        <Zap size={11} /> Transcode
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="inline-flex items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 py-1 text-[11px] font-semibold text-[#6F6078] hover:bg-[#F8F7FA] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
                      >
                        <Play size={11} /> Preview
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingItem(item)}
                        className="inline-flex items-center justify-center rounded border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Playout Channel Creator Drawer with Multi-Destination & DeckLink Support */}
      <DetailDrawer
        open={playoutDrawerOpen}
        onClose={() => setPlayoutDrawerOpen(false)}
        title="Create VOD Playout Channel"
        subtitle="Broadcast media file continuously or on loop to SDI/HDMI DeckLink cards and IP destinations"
        width="max-w-[620px]"
        footer={
          <div className="flex justify-between items-center w-full">
            <button
              type="button"
              onClick={() => setPlayoutDrawerOpen(false)}
              className="h-8 rounded-md border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleLaunchPlayout}
              disabled={creatingChannel || !selectedMedia || destinations.length === 0}
              className="flex h-8 items-center gap-1.5 rounded-md bg-[#351147] px-4 text-[12px] font-bold text-white hover:bg-[#2B0D3A] disabled:opacity-50 dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
            >
              <Tv size={14} /> Launch Playout Channel
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Selected Source Media Pill */}
          {selectedMedia && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 dark:border-purple-900/50 dark:bg-purple-950/30">
              <div className="text-[11px] font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">
                Source Media For Playout
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-bold text-[13px] text-[#1B1024] dark:text-white flex items-center gap-1.5">
                  <Film size={15} className="text-[#7C3AED]" />
                  {selectedMedia.name}
                </span>
                <span className="font-mono text-[11px] text-purple-800 dark:text-purple-300">
                  {formatBytes(selectedMedia.size)} {selectedMedia.duration ? `• ${formatSeconds(selectedMedia.duration)}` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Channel Name & Details */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-bold text-[#1B1024] dark:text-white">
                Playout Channel Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                placeholder="e.g. VOD_Live_Playout_1"
                className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-semibold text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-bold text-[#1B1024] dark:text-white">
                Transcoding Profile
              </label>
              <select
                value={selectedProfileId}
                onChange={e => setSelectedProfileId(e.target.value)}
                className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#1B1024] outline-none dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.videoCodec} • {p.resolution} • {p.videoBitrate}k)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-Destination Playout Selector with DeckLink Output */}
          <div className="space-y-3 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-bold text-[#1B1024] dark:text-white">
                Playout Output Destinations ({destinations.length})
              </label>

              {/* Add Destination Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addDestination(Protocol.DECKLINK)}
                  className="flex h-7 items-center gap-1 rounded bg-[#7C3AED] px-2 text-[11px] font-bold text-white hover:bg-[#6D28D9]"
                >
                  <Monitor size={12} /> + DeckLink
                </button>
                <button
                  type="button"
                  onClick={() => addDestination(Protocol.HLS)}
                  className="flex h-7 items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9]"
                >
                  + HLS
                </button>
                <button
                  type="button"
                  onClick={() => addDestination(Protocol.RECORDING)}
                  className="flex h-7 items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9]"
                >
                  <HardDrive size={12} /> + Record
                </button>
                <button
                  type="button"
                  onClick={() => addDestination(Protocol.UDP)}
                  className="flex h-7 items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9]"
                >
                  + UDP / TS
                </button>
                <button
                  type="button"
                  onClick={() => addDestination(Protocol.CUSTOM)}
                  className="flex h-7 items-center gap-1 rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9]"
                >
                  + RTMP Push
                </button>
              </div>
            </div>

            {/* Destinations List */}
            <div className="space-y-3">
              {destinations.map((dest, idx) => {
                const isDecklink = dest.protocol === Protocol.DECKLINK;
                const isRecording = dest.protocol === Protocol.RECORDING;
                const currentFormats = (dest.decklinkDeviceId && decklinkFormats[dest.decklinkDeviceId]?.length)
                  ? decklinkFormats[dest.decklinkDeviceId]
                  : DEFAULT_DECKLINK_FORMATS;
                const selectedFormat = currentFormats.find(f => f.code === (dest.decklinkFormatCode || 'Hi50')) || currentFormats[0];

                return (
                  <div
                    key={dest.id}
                    className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 dark:bg-[#211335] dark:border-[#371F59] space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ProtocolBadge protocol={dest.protocol} />
                        <span className="font-bold text-[12px] text-[#1B1024] dark:text-white">
                          Destination #{idx + 1}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeDestination(dest.id)}
                        className="grid h-6 w-6 place-items-center rounded text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">
                        Destination Protocol
                      </label>
                      <select
                        value={dest.protocol}
                        onChange={e => {
                          const nextProt = e.target.value as Protocol;
                          const nextUrl = defaultUrl(nextProt, channelName || 'vod_channel', settings, dest.streamKey);
                          updateDestination(dest.id, {
                            protocol: nextProt,
                            url: nextUrl,
                            playbackUrl: playbackUrl(nextProt, channelName || 'vod_channel', settings, nextUrl),
                          });
                          if (nextProt === Protocol.DECKLINK && decklinkDevices[0]?.id) {
                            fetchDecklinkFormats(decklinkDevices[0].id);
                          }
                        }}
                        className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                      >
                        {LIVE_PROTOCOL_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(dest.protocol === Protocol.YOUTUBE || dest.protocol === Protocol.FACEBOOK || dest.protocol === Protocol.CUSTOM) && (
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">
                          Stream Key {dest.protocol === Protocol.CUSTOM ? '(Optional)' : '*'}
                        </label>
                        <input
                          type="text"
                          value={dest.streamKey || ''}
                          onChange={e => {
                            const url = defaultUrl(dest.protocol, channelName || 'vod_channel', settings, e.target.value);
                            updateDestination(dest.id, {
                              streamKey: e.target.value,
                              url,
                              playbackUrl: playbackUrl(dest.protocol, channelName || 'vod_channel', settings, url),
                            });
                          }}
                          placeholder={dest.protocol === Protocol.CUSTOM ? 'e.g. secret_live_key' : 'Paste stream key here'}
                          className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                        />
                      </div>
                    )}

                    {!isDecklink && !isRecording && (
                      <div className="space-y-2">
                        <CodeField
                          value={dest.url}
                          label="Output URL"
                          readOnly={false}
                          onChange={url => updateDestination(dest.id, { url })}
                        />
                      </div>
                    )}

                    {isRecording && (() => {
                      const recording = dest.recording || { format: 'mp4', fileName: channelName };
                      const format = recording.format || 'mp4';
                      const fileName = recording.fileName !== undefined ? recording.fileName : channelName;
                      const locations: StorageLocation[] = (dest.locations && dest.locations.length > 0)
                        ? dest.locations
                        : (dest.recording?.locations && dest.recording.locations.length > 0)
                          ? dest.recording.locations
                          : [{ id: 'loc_1', name: 'Primary Storage', storageType: 'local', storagePath: 'media/recordings', enabled: true }];

                      const updateLocations = (newLocs: StorageLocation[]) => {
                        const primary = newLocs.find(l => l.enabled) || newLocs[0];
                        let primaryUrl = '';
                        const safeBaseName = fileName.trim() ? safeName(fileName) : safeName(channelName || 'vod_channel');
                        if (primary) {
                          if (primary.storageType === 'local' || !primary.storageType) {
                            const dir = (primary.storagePath || 'media/recordings').replace(/\\/g, '/').replace(/\/+$/, '');
                            primaryUrl = `${dir}/${safeBaseName}.${format}`;
                          } else if (primary.storageType === 'smb') {
                            const share = (primary.smbShare || '//nas/recordings').replace(/\\/g, '/').replace(/\/+$/, '');
                            primaryUrl = `${share}/${safeBaseName}.${format}`;
                          } else if (primary.storageType === 'ftp') {
                            primaryUrl = `ftp://${primary.ftpHost || '127.0.0.1'}/${safeBaseName}.${format}`;
                          } else if (primary.storageType === 's3') {
                            primaryUrl = `${primary.s3Bucket || 's3://kashtrix-recordings'}/${safeBaseName}.${format}`;
                          }
                        } else {
                          primaryUrl = `media/recordings/${safeBaseName}.${format}`;
                        }

                        updateDestination(dest.id, {
                          locations: newLocs,
                          recording: { ...recording, format, fileName, locations: newLocs },
                          url: primaryUrl,
                        });
                      };

                      const addLocation = () => {
                        const nextLoc: StorageLocation = {
                          id: `loc_${Date.now()}`,
                          name: `Storage Destination ${locations.length + 1}`,
                          storageType: locations.length === 1 ? 'smb' : 'local',
                          storagePath: locations.length === 1 ? '' : 'media/recordings_backup',
                          smbShare: locations.length === 1 ? '\\\\192.168.1.100\\recordings' : '',
                          enabled: true,
                        };
                        updateLocations([...locations, nextLoc]);
                      };

                      const removeLocation = (locId: string) => {
                        if (locations.length === 1) {
                          toast.error('At least one storage destination is required for recording.');
                          return;
                        }
                        updateLocations(locations.filter(l => l.id !== locId));
                      };

                      const patchLocation = (locId: string, updates: Partial<StorageLocation>) => {
                        updateLocations(locations.map(l => (l.id === locId ? { ...l, ...updates } : l)));
                      };

                      return (
                        <div className="space-y-3 pt-2 border-t border-[#E8DFF0] dark:border-[#371F59]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-[#1B1024] dark:text-white mb-1">
                                Container Format
                              </label>
                              <select
                                value={format}
                                onChange={e => {
                                  const nextFormat = e.target.value as any;
                                  updateDestination(dest.id, { recording: { ...recording, format: nextFormat } });
                                  updateLocations(locations);
                                }}
                                className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                              >
                                <option value="mp4">MP4 (MPEG-4 Part 14)</option>
                                <option value="mkv">MKV (Matroska)</option>
                                <option value="ts">TS (MPEG Transport Stream)</option>
                                <option value="mov">MOV (QuickTime ProRes)</option>
                                <option value="flv">FLV (Flash Video)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-[#1B1024] dark:text-white mb-1">
                                File Name Base / Prefix
                              </label>
                              <input
                                type="text"
                                className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                                placeholder="e.g. VOD_Playout_Master"
                                value={fileName}
                                onChange={e => {
                                  const nextName = e.target.value;
                                  updateDestination(dest.id, { recording: { ...recording, fileName: nextName } });
                                  updateLocations(locations);
                                }}
                              />
                            </div>
                          </div>

                          {/* Multiple Storage Destinations Manager */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                                <HardDrive size={13} className="text-[#7C3AED]" />
                                Simultaneous Storage Locations ({locations.length})
                              </label>
                              <button
                                type="button"
                                onClick={addLocation}
                                className="flex items-center gap-1 text-[11px] font-bold text-[#7C3AED] hover:underline dark:text-[#C4B5FD]"
                              >
                                <Plus size={12} /> Add Storage Location
                              </button>
                            </div>

                            <div className="space-y-2">
                              {locations.map((loc, locIdx) => (
                                <div
                                  key={loc.id}
                                  className="rounded-lg border border-[#E8DFF0] bg-white p-2.5 shadow-2xs space-y-2 dark:bg-[#190E28] dark:border-[#371F59]"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded bg-purple-100 text-[#7C3AED] px-1.5 py-0.5 text-[9px] font-bold uppercase dark:bg-[#311754] dark:text-[#C4B5FD]">
                                        {loc.storageType || 'LOCAL'}
                                      </span>
                                      <input
                                        type="text"
                                        value={loc.name || `Location #${locIdx + 1}`}
                                        onChange={e => patchLocation(loc.id, { name: e.target.value })}
                                        className="h-6 rounded border border-transparent hover:border-[#E8DFF0] focus:border-[#7C3AED] px-1 text-[11px] font-semibold text-[#1B1024] dark:text-white bg-transparent outline-none"
                                        placeholder="Location label..."
                                      />
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <label className="flex items-center gap-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD] cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={loc.enabled !== false}
                                          onChange={e => patchLocation(loc.id, { enabled: e.target.checked })}
                                          className="rounded text-[#7C3AED]"
                                        />
                                        <span>Active</span>
                                      </label>

                                      {locations.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => removeLocation(loc.id)}
                                          className="text-[#6F6078] hover:text-[#DC3545] p-0.5"
                                          title="Remove this storage location"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Protocol selector & parameters */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        Storage Protocol
                                      </label>
                                      <select
                                        value={loc.storageType || 'local'}
                                        onChange={e => patchLocation(loc.id, { storageType: e.target.value as any })}
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      >
                                        <option value="local">Local Disk Directory</option>
                                        <option value="smb">Network Share (SMB / NAS)</option>
                                        <option value="ftp">FTP / SFTP Server</option>
                                        <option value="s3">AWS S3 / Cloud Bucket</option>
                                      </select>
                                    </div>

                                    {(!loc.storageType || loc.storageType === 'local') && (
                                      <div>
                                        <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                          Local Directory Path
                                        </label>
                                        <input
                                          type="text"
                                          value={loc.storagePath || 'media/recordings'}
                                          onChange={e => patchLocation(loc.id, { storagePath: e.target.value })}
                                          placeholder="media/recordings or D:/Recordings"
                                          className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                        />
                                      </div>
                                    )}

                                    {loc.storageType === 'smb' && (
                                      <>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                            SMB UNC Path
                                          </label>
                                          <input
                                            type="text"
                                            value={loc.smbShare || ''}
                                            onChange={e => patchLocation(loc.id, { smbShare: e.target.value })}
                                            placeholder="\\192.168.1.100\recordings"
                                            className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                            SMB Username
                                          </label>
                                          <input
                                            type="text"
                                            value={loc.smbUsername || ''}
                                            onChange={e => patchLocation(loc.id, { smbUsername: e.target.value })}
                                            placeholder="admin"
                                            className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                          />
                                        </div>
                                      </>
                                    )}

                                    {loc.storageType === 'ftp' && (
                                      <>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                            FTP Host / Port
                                          </label>
                                          <div className="flex gap-1">
                                            <input
                                              type="text"
                                              value={loc.ftpHost || ''}
                                              onChange={e => patchLocation(loc.id, { ftpHost: e.target.value })}
                                              placeholder="ftp.broadcast.net"
                                              className="h-7 flex-1 rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                            />
                                            <input
                                              type="number"
                                              value={loc.ftpPort || 21}
                                              onChange={e => patchLocation(loc.id, { ftpPort: Number(e.target.value) })}
                                              className="h-7 w-14 rounded border border-[#E8DFF0] bg-[#F8F7FA] px-1 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                            FTP Remote Directory
                                          </label>
                                          <input
                                            type="text"
                                            value={loc.ftpPath || ''}
                                            onChange={e => patchLocation(loc.id, { ftpPath: e.target.value })}
                                            placeholder="/archives/tv/"
                                            className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                          />
                                        </div>
                                      </>
                                    )}

                                    {loc.storageType === 's3' && (
                                      <>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                            S3 Bucket Name
                                          </label>
                                          <input
                                            type="text"
                                            value={loc.s3Bucket || ''}
                                            onChange={e => patchLocation(loc.id, { s3Bucket: e.target.value })}
                                            placeholder="s3://kashtrix-recordings"
                                            className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                            S3 Region
                                          </label>
                                          <input
                                            type="text"
                                            value={loc.s3Region || 'us-east-1'}
                                            onChange={e => patchLocation(loc.id, { s3Region: e.target.value })}
                                            placeholder="us-east-1"
                                            className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                          />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {isDecklink && (
                      <div className="space-y-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">
                            DeckLink Output Device
                          </label>
                          <select
                            value={dest.decklinkDeviceId || decklinkDevices[0]?.id || ''}
                            onChange={e => {
                              const devId = e.target.value;
                              const dev = decklinkDevices.find(d => d.id === devId);
                              updateDestination(dest.id, {
                                decklinkDeviceId: devId,
                                decklinkDeviceName: dev?.name || devId,
                                url: devId,
                              });
                              if (devId) fetchDecklinkFormats(devId);
                            }}
                            className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] font-semibold dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                          >
                            {decklinkDevices.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[#1B1024] dark:text-white">
                            Signal Standard & Frame Rate (Format Code)
                          </label>
                          <select
                            value={dest.decklinkFormatCode || 'Hi50'}
                            onChange={e => updateDestination(dest.id, { decklinkFormatCode: e.target.value })}
                            className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] dark:bg-[#190E28] dark:border-[#371F59] dark:text-white"
                          >
                            {currentFormats.map(f => (
                              <option key={f.code} value={f.code}>
                                {f.code} — {f.description}
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedFormat && (
                          <div className="rounded-lg border border-purple-200 bg-purple-50/70 p-2 text-[11px] text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200 space-y-1">
                            <div className="flex items-center justify-between font-semibold">
                              <span>Format: <strong>{selectedFormat.code}</strong></span>
                              <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${selectedFormat.interlaced ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200' : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'}`}>
                                {selectedFormat.interlaced ? 'Interlaced (50i/59.94i)' : 'Progressive (50p/60p)'}
                              </span>
                            </div>
                            <div className="text-[10px] text-purple-700 dark:text-purple-300">
                              Resolution: <span className="font-mono">{selectedFormat.resolution}</span> • Frame Rate: <span className="font-mono">{selectedFormat.fps} fps</span>
                            </div>
                            <div className="text-[10px] text-purple-600 dark:text-purple-400">
                              Hardware Pixel Format: <span className="font-mono">uyvy422 (Uncompressed)</span> • Audio: <span className="font-mono">pcm_s16le 48kHz Stereo</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DetailDrawer>

      {/* Video Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-purple-500/30">
            <div className="flex items-center justify-between p-3 bg-neutral-900 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-white font-semibold text-[13px]">
                <Film size={16} className="text-purple-400" />
                <span>{previewItem.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700"
              >
                <X size={15} />
              </button>
            </div>
            <KashtrixMediaPlayer
              src={previewItem.type === 'vod' ? `/api/vod/${encodeURIComponent(String(previewItem.id))}/preview` : `/recording-preview/${encodeURIComponent(String(previewItem.id))}/index.m3u8`}
              title={previewItem.name}
              isLive={false}
              autoPlay={true}
              maxHeight="70vh"
            />
          </div>
        </div>
      )}

      {/* Confirm Delete Media Dialog */}
      <ConfirmDialog
        open={!!deletingItem}
        title="Delete Media File"
        message={`Are you sure you want to permanently delete "${deletingItem?.name}" from storage? This cannot be undone.`}
        confirmLabel="Delete File"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteMedia}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
};

export default VodPlayoutView;
