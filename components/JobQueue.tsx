import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Channel, ChannelDestination, ChannelStatus, TranscodingProfile } from '../types';
import {
  List,
  Plus,
  Search,
  Play,
  Square,
  Trash2,
  Edit3,
  Tv,
  CheckCircle2,
  Activity,
  Layers,
  Cpu,
  MoreVertical,
  Radio,
  Terminal,
  Copy,
  Eye,
  X
} from 'lucide-react';
import StatusBadge from './ui/StatusBadge';
import ProtocolBadge from './ui/ProtocolBadge';
import Tabs from './ui/Tabs';
import ProfileEditor from './ProfileEditor';
import Configurator from './Configurator';
import DetailDrawer from './ui/DetailDrawer';
import { MediaPreview } from './ui/MediaPreview';
import { generateCommand } from '../hooks/useTranscoder';

const sanitizeName = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';

interface Props {
  channels: Channel[];
  profiles: TranscodingProfile[];
  userRole?: string;
  startChannel: (id: string) => Promise<void> | void;
  stopChannel: (id: string) => Promise<void> | void;
  removeChannel: (id: string) => Promise<void> | void;
  clearChannels: () => Promise<void> | void;
  startAllChannels: () => Promise<void> | void;
  stopAllChannels: () => Promise<void> | void;
  addProfile: (profileData: Omit<TranscodingProfile, 'id'>) => Promise<void>;
  updateProfile: (profile: TranscodingProfile) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  addChannel: (channelData: Omit<Channel, 'id' | 'command' | 'status' | 'uptime' | 'speed' | 'speedHistory' | 'outputLog'>) => Promise<void>;
  updateChannel?: (channelData: Partial<Channel> & { id: string }) => Promise<void>;
  getTsPrograms: (input: string) => Promise<any>;
  fetchIngestStreams: () => Promise<any>;
  settings: any;
  licenseStatus: string;
}

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
};

const ChannelLogsModal: React.FC<{
  channel: Channel | null;
  onClose: () => void;
  profiles?: TranscodingProfile[];
  settings?: any;
}> = ({ channel, onClose, profiles = [], settings }) => {
  if (!channel) return null;

  const isRunning = channel.status === ChannelStatus.Running;
  const logs = channel.outputLog?.length
    ? channel.outputLog.join('\n')
    : (isRunning ? 'Waiting for FFmpeg output stream logs...' : 'Channel is currently stopped.');

  const profile = profiles.find(p => p.id === channel.profileId);
  const effectiveCommand = channel.command || (profile && settings ? generateCommand(channel, profile, settings) : (generateCommand(channel, profile, settings) || ''));
  const displayCommand = effectiveCommand || 'No command string available';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl rounded-xl border border-[#E8DFF0] bg-white p-5 shadow-2xl space-y-4 dark:bg-[#190E28] dark:border-[#311B4E]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#F4EEFF] text-[#7C3AED] dark:bg-[#311754] dark:text-[#A78BFA]">
              <Terminal size={18} />
            </div>
            <div>
              <h2 className="font-display text-[16px] font-bold text-[#1B1024] dark:text-white flex items-center gap-2">
                {channel.name}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isRunning ? 'bg-[#F0FDF4] text-[#16A36A] dark:bg-[#064E3B] dark:text-[#34D399]' : 'bg-[#FEF2F2] text-[#DC3545] dark:bg-[#450A0A] dark:text-[#FCA5A5]'}`}>
                  {channel.status}
                </span>
              </h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Real-time FFmpeg transcoding process output logs & CLI command</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#6F6078] hover:bg-[#F8F7FA] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:bg-[#211335] dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* FFmpeg Command Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
            <span>FFmpeg Command Pipeline</span>
            <button
              type="button"
              onClick={() => {
                if (displayCommand && displayCommand !== 'No command string available') {
                  navigator.clipboard.writeText(displayCommand);
                  toast.success('Command copied!');
                }
              }}
              className="flex items-center gap-1 text-[#6D32D9] hover:underline dark:text-[#A78BFA]"
            >
              <Copy size={11} /> Copy Command
            </button>
          </div>
          <div className="rounded-lg border border-[#E8DFF0] bg-[#0F0817] p-2.5 font-mono text-[11px] text-[#A78BFA] overflow-x-auto select-all max-h-24 dark:border-[#311B4E]">
            {displayCommand}
          </div>
        </div>

        {/* Live Logs Terminal Output Box */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
            <span>Console Output Log (STDERR)</span>
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              {channel.outputLog?.length || 0} line(s)
            </span>
          </div>
          <div className="h-64 rounded-lg border border-[#E8DFF0] bg-[#0A0512] p-3 font-mono text-[11px] text-[#34D399] overflow-y-auto whitespace-pre-wrap dark:border-[#311B4E]">
            {logs}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
          <div className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
            {isRunning ? `Speed: ${channel.speed || 1}x` : 'Process Offline'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#351147] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
          >
            Close Terminal
          </button>
        </div>
      </div>
    </div>
  );
};

export const ChannelDashboard: React.FC<Props> = ({
  channels,
  profiles,
  userRole,
  startChannel,
  stopChannel,
  removeChannel,
  clearChannels,
  startAllChannels,
  stopAllChannels,
  addProfile,
  updateProfile,
  removeProfile,
  addChannel,
  updateChannel,
  getTsPrograms,
  fetchIngestStreams,
  settings,
  licenseStatus,
}) => {
  const canViewTerminal = userRole === 'superadmin';
  const [activeTab, setActiveTab] = useState<'channels' | 'profiles'>('channels');
  const [search, setSearch] = useState('');
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [selectedLogChannel, setSelectedLogChannel] = useState<Channel | null>(null);
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [editingProfile, setEditingProfile] = useState<TranscodingProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [previewChannel, setPreviewChannel] = useState<Channel | null>(null);

  const running = channels.filter(c => c.status === ChannelStatus.Running).length;
  const stopped = channels.length - running;

  const filteredChannels = channels.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.inputUrl.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProfiles = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="channels-workspace page-stack space-y-4">
      {/* 1. Page Header Strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">Channels</h1>
            <span className="rounded-full bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A36A] dark:bg-[#064E3B] dark:border-[#047857] dark:text-[#34D399]">
              {running} Active Service{running !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Create, transcode, route and publish live TV channels
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Start All / Stop All */}
          {channels.length > 0 && (
            <div className="flex items-center gap-1.5 border-r border-[#E8DFF0] pr-2 dark:border-[#311B4E]">
              <button
                type="button"
                disabled={stopped === 0}
                onClick={startAllChannels}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 text-[11px] font-semibold text-[#16A36A] hover:bg-[#BBF7D0]/50 disabled:opacity-50 dark:bg-[#064E3B] dark:border-[#059669]/60 dark:text-[#34D399]"
              >
                <Play size={12} /> Start All
              </button>
              <button
                type="button"
                disabled={running === 0}
                onClick={stopAllChannels}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2.5 text-[11px] font-semibold text-[#DC3545] hover:bg-[#FECACA]/50 disabled:opacity-50 dark:bg-[#450A0A] dark:border-[#DC3545]/60 dark:text-[#FCA5A5]"
              >
                <Square size={12} /> Stop All
              </button>
            </div>
          )}

          {/* Primary Create Channel Action */}
          <button
            type="button"
            onClick={() => { setEditingChannel(null); setCreateDrawerOpen(true); }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
          >
            <Plus size={14} /> Create Channel
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold text-[#6F6078] uppercase tracking-wider dark:text-[#B9A5CD]">Configured</span>
          <p className="mt-1 font-display text-[20px] font-bold text-[#1B1024] dark:text-white">{channels.length}</p>
        </div>
        <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3 shadow-xs dark:bg-[#064E3B]/60 dark:border-[#059669]">
          <span className="text-[10px] font-semibold text-[#16A36A] uppercase tracking-wider dark:text-[#34D399]">Active</span>
          <p className="mt-1 font-display text-[20px] font-bold text-[#16A36A] dark:text-[#34D399]">{running}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold text-[#6F6078] uppercase tracking-wider dark:text-[#B9A5CD]">Stopped</span>
          <p className="mt-1 font-display text-[20px] font-bold text-[#1B1024] dark:text-white">{stopped}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <span className="text-[10px] font-semibold text-[#6F6078] uppercase tracking-wider dark:text-[#B9A5CD]">Profiles</span>
          <p className="mt-1 font-display text-[20px] font-bold text-[#1B1024] dark:text-white">{profiles.length}</p>
        </div>
      </div>

      {/* 3. Main Data Card with Sub-Tabs */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs dark:bg-[#190E28] dark:border-[#311B4E] overflow-hidden">
        {/* Navigation & Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] p-3 dark:border-[#311B4E]">
          <div className="flex items-center gap-1 rounded-lg bg-[#F8F7FA] p-0.5 dark:bg-[#211335]">
            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'channels' ? 'bg-white text-[#351147] shadow-xs dark:bg-[#2D1845] dark:text-white' : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'}`}
            >
              <Tv size={13} /> Channels
              <span className="ml-1 rounded-full bg-[#E8DFF0] px-1.5 py-0.2 text-[10px] font-bold text-[#351147] dark:bg-[#3B1F5C] dark:text-[#E2D1F9]">{channels.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profiles')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${activeTab === 'profiles' ? 'bg-white text-[#351147] shadow-xs dark:bg-[#2D1845] dark:text-white' : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'}`}
            >
              <Cpu size={13} /> Transcoding Profiles
              <span className="ml-1 rounded-full bg-[#E8DFF0] px-1.5 py-0.2 text-[10px] font-bold text-[#351147] dark:bg-[#3B1F5C] dark:text-[#E2D1F9]">{profiles.length}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#B9A5CD]" />
              <input
                className="h-8 w-44 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* TAB 1: LIVE CHANNELS TABLE */}
        {activeTab === 'channels' && (
          <div className="overflow-x-auto">
            {filteredChannels.length > 0 ? (
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
                    <th className="px-4 py-2.5">Channel Name</th>
                    <th className="px-4 py-2.5">Input Source</th>
                    <th className="px-4 py-2.5">Profile</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Output Stream Destinations</th>
                    <th className="px-4 py-2.5">Bitrate</th>
                    <th className="px-4 py-2.5">Streaming Duration</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                  {filteredChannels.map(channel => {
                    const isRunning = channel.status === ChannelStatus.Running;
                    const profile = profiles.find(p => p.id === channel.profileId);
                    const formattedUptime = isRunning && channel.uptime ? formatDuration(channel.uptime) : '00:00:00';
                    const destinationsList = channel.destinations?.length
                      ? channel.destinations
                      : [{ id: 'default', name: channel.outputProtocol || 'HLS', protocol: (channel.outputProtocol || 'hls') as any, url: channel.outputUrl }];

                    return (
                      <tr key={channel.id} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#2B1745]">
                        <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">
                          {channel.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD] max-w-[180px] truncate" title={channel.inputUrl}>
                          {channel.inputUrl}
                        </td>
                        <td className="px-4 py-3 text-[#6F6078] dark:text-[#B9A5CD]">
                          {profile ? `${profile.name}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isRunning ? 'bg-[#F0FDF4] text-[#16A36A] dark:bg-[#064E3B] dark:text-[#34D399]' : 'bg-[#FEF2F2] text-[#DC3545] dark:bg-[#450A0A] dark:text-[#FCA5A5]'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-[#16A36A] animate-pulse dark:bg-[#34D399]' : 'bg-[#DC3545]'}`} />
                            {channel.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] max-w-[280px]">
                          <div className="flex flex-col gap-1">
                            {destinationsList.map((d, i) => {
                              const isSrtListener = d.url?.startsWith('srt://') && (d.url.includes('0.0.0.0') || d.url.includes('mode=listener'));
                              const portMatch = d.url?.match(/:(\d+)/);
                              const srtPort = portMatch ? portMatch[1] : '9998';
                              const clientHost = typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? window.location.hostname : '127.0.0.1';
                              const vlcUrl = `srt://${clientHost}:${srtPort}?mode=caller`;
                              const displayUrl = isSrtListener ? vlcUrl : d.url;
                              const copyUrl = isSrtListener ? vlcUrl : (d.playbackUrl || d.url);
                              const protocolLabel = isSrtListener ? 'SRT (VLC)' : d.protocol;

                              return (
                                <div key={d.id || i} className="flex items-center gap-1.5 truncate">
                                  <span className="rounded bg-[#F4EEFF] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#4A1B7A] dark:bg-[#311754] dark:text-[#C4B5FD] shrink-0">
                                    {protocolLabel}
                                  </span>
                                  <span className="truncate text-[#6D32D9] dark:text-[#A78BFA] font-semibold" title={isSrtListener ? `VLC Playback URL: ${vlcUrl}` : d.url}>
                                    {displayUrl}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(copyUrl);
                                      toast.success(isSrtListener ? 'VLC SRT Playout URL copied!' : `${(d.protocol || 'Stream').toUpperCase()} URL copied!`);
                                    }}
                                    className="text-[#6F6078] hover:text-[#6D32D9] dark:text-[#B9A5CD] dark:hover:text-white shrink-0 cursor-pointer"
                                    title={isSrtListener ? `Copy for VLC: ${vlcUrl}` : "Copy URL"}
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#6F6078] dark:text-[#B9A5CD]">
                          {profile?.videoBitrate ? `${profile.videoBitrate} Kbps` : '4000 Kbps'}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {isRunning ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px] whitespace-nowrap dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {formattedUptime}
                            </span>
                          ) : (
                            <span className="text-[#6F6078] dark:text-[#B9A5CD] text-[11px]">Stopped</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                          {isRunning ? (
                            <button
                              type="button"
                              onClick={() => stopChannel(channel.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-semibold text-[#DC3545] hover:bg-[#FECACA]/50 dark:bg-[#450A0A] dark:border-[#DC3545]/60 dark:text-[#FCA5A5]"
                            >
                              <Square size={12} /> Stop
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startChannel(channel.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-semibold text-[#16A36A] hover:bg-[#BBF7D0]/50 dark:bg-[#064E3B] dark:border-[#059669]/60 dark:text-[#34D399]"
                            >
                              <Play size={12} /> Start
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPreviewChannel(channel)}
                            className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#6D32D9] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2D1A45]"
                            title="Preview Live Stream"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              toast.success(`Channel "${channel.name}" available in MPTS MUX module.`, { icon: '📡' });
                            }}
                            className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#6D32D9] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2D1A45]"
                            title="Multiplex into MPTS MUX"
                          >
                            <Layers size={13} />
                          </button>
                          {canViewTerminal && (
                            <button
                              type="button"
                              onClick={() => setSelectedLogChannel(channel)}
                              className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#6D32D9] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2D1A45]"
                              title="View Terminal Logs & Command"
                            >
                              <Terminal size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setEditingChannel(channel); setProfileId(channel.profileId || ''); setCreateDrawerOpen(true); }}
                            className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#6D32D9] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2D1A45]"
                            title="Edit Channel"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeChannel(channel.id)}
                            className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#450A0A] dark:hover:text-[#FCA5A5]"
                            title="Delete channel"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* Compact Empty State (max 220px height) */
              <div className="grid min-h-[180px] place-items-center p-8 text-center">
                <div>
                  <Tv size={28} className="mx-auto text-[#6F6078] dark:text-[#B9A5CD]" />
                  <h3 className="mt-2 font-display text-[14px] font-bold text-[#1B1024] dark:text-white">No channels configured</h3>
                  <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD] max-w-sm">
                    Create a channel using the Channel Composer to connect an input, transcoding profile, and output destination.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setEditingChannel(null); setCreateDrawerOpen(true); }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#351147] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
                  >
                    <Plus size={14} /> Create Channel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TRANSCODING PROFILES TABLE */}
        {activeTab === 'profiles' && (
          <div className="overflow-x-auto">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] bg-[#F8F7FA] px-4 py-2 text-[11px] font-semibold text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
              <span>Available hardware-accelerated transcoding presets</span>
              <button
                type="button"
                onClick={() => { setEditingProfile(null); setProfileModalOpen(true); }}
                className="flex items-center gap-1 text-[#6D32D9] hover:underline dark:text-[#A78BFA]"
              >
                <Plus size={13} /> New Profile
              </button>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
                  <th className="px-4 py-3">Profile Name</th>
                  <th className="px-4 py-3">Resolution</th>
                  <th className="px-4 py-3">Video Codec</th>
                  <th className="px-4 py-3">Audio Codec</th>
                  <th className="px-4 py-3">Preset</th>
                  <th className="px-4 py-3">Hardware Acceleration</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {filteredProfiles.map(p => {
                  const hwLabel = p.videoCodec?.includes('nvenc') ? 'NVIDIA NVENC' : p.videoCodec?.includes('amf') ? 'AMD AMF' : p.videoCodec?.includes('videotoolbox') ? 'Apple VideoToolbox' : 'Software';

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[#F4EEFF]/50 dark:hover:bg-[#2B1745]">
                      <td className="px-4 py-3 font-semibold text-[#1B1024] dark:text-white">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{p.resolution || '1920x1080'}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{p.videoCodec || 'H.264'}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{p.audioCodec || 'AAC'}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078] dark:text-[#B9A5CD]">{p.preset || 'medium'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-0.5 text-[10px] font-semibold text-[#4A1B7A] dark:bg-[#2D1845] dark:border-[#45266E] dark:text-[#C4B5FD]">
                          {hwLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => { setEditingProfile(p); setProfileModalOpen(true); }}
                          className="text-[#6D32D9] hover:underline text-[11px] font-semibold dark:text-[#A78BFA]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProfile(p.id)}
                          className="text-[#DC3545] hover:underline text-[11px] font-semibold dark:text-[#FCA5A5]"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Channel Composer Right-Side Drawer */}
      <Configurator
        isOpen={createDrawerOpen}
        onClose={() => { setCreateDrawerOpen(false); setEditingChannel(null); }}
        profiles={profiles}
        settings={settings}
        licenseStatus={licenseStatus}
        addChannel={addChannel}
        updateChannel={updateChannel}
        editingChannel={editingChannel}
        getTsPrograms={getTsPrograms}
        fetchIngestStreams={fetchIngestStreams}
        profileId={profileId}
        setProfileId={setProfileId}
      />

      {/* Transcoding Profile Editor Modal */}
      <ProfileEditor
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSave={editingProfile ? updateProfile : addProfile}
        profile={editingProfile}
      />

      {/* Live Terminal Logs & Command Inspector Modal */}
      {canViewTerminal && (
        <ChannelLogsModal
          channel={selectedLogChannel}
          onClose={() => setSelectedLogChannel(null)}
          profiles={profiles}
          settings={settings}
        />
      )}

      {/* Channel Live Stream Preview Drawer */}
      {previewChannel && (
        <DetailDrawer
          open={!!previewChannel}
          onClose={() => setPreviewChannel(null)}
          title={`Channel Preview — ${previewChannel.name}`}
          subtitle={`Live confidence playback for ${previewChannel.name}`}
          width="max-w-[620px]"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Status: <b className={previewChannel.status === ChannelStatus.Running ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}>{previewChannel.status}</b>
              </span>
              <button
                type="button"
                onClick={() => setPreviewChannel(null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]"
              >
                Close Preview
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl bg-black shadow-inner">
              <MediaPreview
                url={`/hls/${sanitizeName(previewChannel.name)}/index.m3u8`}
                title={previewChannel.name}
                autoPlay
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-[#311B4E] dark:bg-[#211335]/60 space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#B9A5CD]">Channel Stream Specifications</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[9px]">Input Source:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block" title={previewChannel.inputUrl}>{previewChannel.inputUrl}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">Transcoding Profile:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{profiles.find(p => p.id === previewChannel.profileId)?.name || 'Custom Profile'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">Streaming Duration:</span>
                  <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                    {previewChannel.status === ChannelStatus.Running && previewChannel.uptime ? formatDuration(previewChannel.uptime) : 'Offline / Stopped'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[9px]">HLS Preview URL:</span>
                  <span className="font-mono text-[10px] text-[#6D32D9] dark:text-[#A78BFA] break-all">
                    {window.location.origin}/hls/{sanitizeName(previewChannel.name)}/index.m3u8
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DetailDrawer>
      )}
    </div>
  );
};

export default ChannelDashboard;
