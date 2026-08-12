import React, { useState } from 'react';
import { Channel, ChannelStatus, TranscodingProfile } from '../types';
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
  Radio
} from 'lucide-react';
import StatusBadge from './ui/StatusBadge';
import ProtocolBadge from './ui/ProtocolBadge';
import Tabs from './ui/Tabs';
import ProfileEditor from './ProfileEditor';
import Configurator from './Configurator';

interface Props {
  channels: Channel[];
  profiles: TranscodingProfile[];
  username?: string;
  startChannel: (id: string) => void;
  stopChannel: (id: string) => void;
  removeChannel: (id: string) => void;
  clearChannels: () => void;
  startAllChannels: () => void;
  stopAllChannels: () => void;
  addProfile: (profileData: Omit<TranscodingProfile, 'id'>) => Promise<void>;
  updateProfile: (profile: TranscodingProfile) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  addChannel: (channelData: Omit<Channel, 'id' | 'command' | 'status' | 'uptime' | 'speed' | 'speedHistory' | 'outputLog'>) => Promise<void>;
  getTsPrograms: (input: string) => Promise<any>;
  fetchIngestStreams: () => Promise<any>;
  settings: any;
  licenseStatus: string;
}

export const ChannelDashboard: React.FC<Props> = ({
  channels,
  profiles,
  username,
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
  getTsPrograms,
  fetchIngestStreams,
  settings,
  licenseStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'channels' | 'profiles'>('channels');
  const [search, setSearch] = useState('');
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [editingProfile, setEditingProfile] = useState<TranscodingProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[18px] font-bold text-[#1B1024]">Channels</h1>
            <span className="rounded-full bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A36A]">
              {running} Active Service{running !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#6F6078]">
            Create, transcode, route and publish live TV channels
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Start All / Stop All */}
          {channels.length > 0 && (
            <div className="flex items-center gap-1.5 border-r border-[#E8DFF0] pr-2">
              <button
                type="button"
                disabled={stopped === 0}
                onClick={startAllChannels}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 text-[11px] font-semibold text-[#16A36A] hover:bg-[#BBF7D0]/50 disabled:opacity-50"
              >
                <Play size={12} /> Start All
              </button>
              <button
                type="button"
                disabled={running === 0}
                onClick={stopAllChannels}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2.5 text-[11px] font-semibold text-[#DC3545] hover:bg-[#FECACA]/50 disabled:opacity-50"
              >
                <Square size={12} /> Stop All
              </button>
            </div>
          )}

          {/* Primary Create Channel Action */}
          <button
            type="button"
            onClick={() => setCreateDrawerOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2B0D3A]"
          >
            <Plus size={14} /> Create Channel
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Configured</span>
          <p className="font-mono text-[20px] font-bold text-[#1B1024]">{channels.length}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Active</span>
          <p className="font-mono text-[20px] font-bold text-[#16A36A]">{running}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Stopped</span>
          <p className="font-mono text-[20px] font-bold text-[#6F6078]">{stopped}</p>
        </div>
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">Profiles</span>
          <p className="font-mono text-[20px] font-bold text-[#4A1B7A]">{profiles.length}</p>
        </div>
      </div>

      {/* 3. Main Workspace with Tabs */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden">
        {/* Navigation Tabs + Search Bar */}
        <div className="flex flex-col gap-2 border-b border-[#E8DFF0] px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            tabs={[
              { id: 'channels', label: 'Channels', count: channels.length },
              { id: 'profiles', label: 'Transcoding Profiles', count: profiles.length },
            ]}
            activeTab={activeTab}
            onChange={tab => setActiveTab(tab as any)}
            className="border-b-0"
          />

          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 w-48 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
            />
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
          </div>
        </div>

        {/* TAB 1: CHANNELS TABLE */}
        {activeTab === 'channels' && (
          <div className="overflow-x-auto">
            {filteredChannels.length > 0 ? (
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                    <th className="px-4 py-3">Channel Name</th>
                    <th className="px-4 py-3">Input Source</th>
                    <th className="px-4 py-3">Profile</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Bitrate</th>
                    <th className="px-4 py-3">Uptime</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFF0]">
                  {filteredChannels.map(channel => {
                    const isRunning = channel.status === ChannelStatus.Running;
                    const profile = profiles.find(p => p.id === channel.profileId);

                    return (
                      <tr key={channel.id} className="transition-colors hover:bg-[#F4EEFF]/50">
                        <td className="px-4 py-3 font-semibold text-[#1B1024]">
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded bg-[#F4EEFF] text-[#4A1B7A]">
                              <Tv size={14} />
                            </span>
                            <span>{channel.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078] max-w-[220px] truncate" title={channel.inputUrl}>
                          {channel.inputUrl}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#4A1B7A]">
                            {profile?.name || 'Custom'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={isRunning ? 'Running' : 'Stopped'} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[#6F6078]">
                          {profile?.videoBitrate ? `${profile.videoBitrate} Kbps` : 'Passthrough'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#6F6078]">
                          {channel.uptime ? new Date((channel.uptime || 0) * 1000).toISOString().slice(11, 19) : '00:00:00'}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {isRunning ? (
                            <button
                              type="button"
                              onClick={() => stopChannel(channel.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-semibold text-[#DC3545] hover:bg-[#FECACA]/50"
                            >
                              <Square size={12} /> Stop
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startChannel(channel.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-semibold text-[#16A36A] hover:bg-[#BBF7D0]/50"
                            >
                              <Play size={12} /> Start
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeChannel(channel.id)}
                            className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545]"
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
                  <Tv size={28} className="mx-auto text-[#6F6078]" />
                  <h3 className="mt-2 font-display text-[14px] font-bold text-[#1B1024]">No channels configured</h3>
                  <p className="mt-1 text-[11px] text-[#6F6078] max-w-sm">
                    Create a channel using the Channel Composer to connect an input, transcoding profile, and output destination.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateDrawerOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#351147] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#2B0D3A]"
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
            <div className="flex items-center justify-between border-b border-[#E8DFF0] bg-[#F8F7FA] px-4 py-2 text-[11px] font-semibold text-[#6F6078]">
              <span>Available hardware-accelerated transcoding presets</span>
              <button
                type="button"
                onClick={() => { setEditingProfile(null); setProfileModalOpen(true); }}
                className="flex items-center gap-1 text-[#6D32D9] hover:underline"
              >
                <Plus size={13} /> New Profile
              </button>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                  <th className="px-4 py-3">Profile Name</th>
                  <th className="px-4 py-3">Resolution</th>
                  <th className="px-4 py-3">Video Codec</th>
                  <th className="px-4 py-3">Audio Codec</th>
                  <th className="px-4 py-3">Preset</th>
                  <th className="px-4 py-3">Hardware Acceleration</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0]">
                {filteredProfiles.map(p => {
                  const hwLabel = p.videoCodec?.includes('nvenc') ? 'NVIDIA NVENC' : p.videoCodec?.includes('amf') ? 'AMD AMF' : p.videoCodec?.includes('videotoolbox') ? 'Apple VideoToolbox' : 'Software';

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[#F4EEFF]/50">
                      <td className="px-4 py-3 font-semibold text-[#1B1024]">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078]">{p.resolution || '1920x1080'}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078]">{p.videoCodec || 'H.264'}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078]">{p.audioCodec || 'AAC'}</td>
                      <td className="px-4 py-3 font-mono text-[#6F6078]">{p.preset || 'medium'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md border border-[#E8DFF0] bg-[#F8F7FA] px-2 py-0.5 text-[10px] font-semibold text-[#4A1B7A]">
                          {hwLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => { setEditingProfile(p); setProfileModalOpen(true); }}
                          className="text-[#6D32D9] hover:underline text-[11px] font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProfile(p.id)}
                          className="text-[#DC3545] hover:underline text-[11px] font-semibold"
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
        onClose={() => setCreateDrawerOpen(false)}
        profiles={profiles}
        settings={settings}
        licenseStatus={licenseStatus}
        addChannel={addChannel}
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
    </div>
  );
};

export default ChannelDashboard;
