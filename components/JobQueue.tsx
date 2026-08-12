import React, { useState } from 'react';
import { Channel, ChannelStatus, TranscodingProfile } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';
import StatusBadge from './ui/StatusBadge';
import ChannelCard from './JobItem';
import ProfileEditor from './ProfileEditor';
import { FiList, FiPlus, FiSearch, FiSliders, FiPlay, FiSquare, FiTrash2, FiEdit3, FiCheck, FiX, FiLayers } from 'react-icons/fi';

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
}

const ChannelDashboard: React.FC<Props> = ({
  channels, profiles, username, startChannel, stopChannel, removeChannel,
  clearChannels, startAllChannels, stopAllChannels, addProfile, updateProfile, removeProfile
}) => {
  const [search, setSearch] = useState('');
  const [editingProfile, setEditingProfile] = useState<TranscodingProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const running = channels.filter(c => c.status === ChannelStatus.Running).length;
  const stopped = channels.length - running;

  const filteredChannels = channels.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.inputUrl.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="channels-workspace page-stack">
      {/* 1. Active Channels Card */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-subtle)] text-[var(--primary)]">
              <FiList size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Channels</h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {channels.length} configured channels ({running} active, {stopped} stopped)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative flex items-center">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search channels..."
                className="w-48 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 pr-8 text-xs outline-none focus:border-[var(--primary)] focus:bg-[var(--surface)]"
              />
              <span className="absolute right-2.5 text-[var(--text-muted)] pointer-events-none"><FiSearch size={14} /></span>
            </div>

            {/* Filter button */}
            <button className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
              <FiSliders size={14} />
            </button>

            {/* Start All / Stop All if channels exist */}
            {channels.length > 0 ? (
              <>
                <Button size="sm" variant="success" disabled={stopped === 0} onClick={startAllChannels}>
                  <FiPlay size={12} /> Start All
                </Button>
                <Button size="sm" variant="danger" disabled={running === 0} onClick={stopAllChannels}>
                  <FiSquare size={12} /> Stop All
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Channels Table / Content */}
        {filteredChannels.length > 0 ? (
          <div className="table-responsive">
            <table className="w-full text-left text-xs text-[var(--text-primary)]">
              <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Channel Name</th>
                  <th className="px-5 py-3">Input Source</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Viewers</th>
                  <th className="px-5 py-3">Bitrate</th>
                  <th className="px-5 py-3">Uptime</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredChannels.map((channel, idx) => (
                  <tr key={channel.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[var(--text-muted)]">{idx + 1}</td>
                    <td className="px-5 py-3.5 font-extrabold text-[var(--text-primary)]">{channel.name}</td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--text-secondary)] max-w-[200px] truncate" title={channel.inputUrl}>
                      {channel.inputUrl}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={channel.status === ChannelStatus.Running ? 'Running' : 'Stopped'} />
                    </td>
                    <td className="px-5 py-3.5 text-[var(--text-muted)]">—</td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--text-muted)]">{profiles.find(profile => profile.id === channel.profileId)?.videoBitrate ? `${profiles.find(profile => profile.id === channel.profileId)?.videoBitrate} Kbps` : 'Source'}</td>
                    <td className="px-5 py-3.5 font-mono text-[11px]">
                      {new Date((channel.uptime || 0) * 1000).toISOString().slice(11, 19)}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1">
                      {channel.status === ChannelStatus.Running ? (
                        <Button size="sm" variant="danger" onClick={() => stopChannel(channel.id)}>
                          <FiSquare size={12} /> Stop
                        </Button>
                      ) : (
                        <Button size="sm" variant="success" onClick={() => startChannel(channel.id)}>
                          <FiPlay size={12} /> Start
                        </Button>
                      )}
                      <Button size="sm" variant="danger" className="!px-2" onClick={() => removeChannel(channel.id)}>
                        <FiTrash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty State matching image input_file_0.png */
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--text-muted)] mb-3">
              <FiList size={24} />
            </div>
            <h3 className="text-base font-extrabold text-[var(--text-primary)]">No channels configured</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
              Create a channel using the Channel Composer to attach inputs, outputs, and transcoding profiles.
            </p>
          </div>
        )}
      </Card>

      {/* 2. Transcoding Profiles Card */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">Transcoding Profiles</h2>
            <p className="text-xs text-[var(--text-secondary)]">Hardware acceleration & resolution presets</p>
          </div>
          <button
            onClick={() => { setEditingProfile(null); setProfileModalOpen(true); }}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] transition-all shadow-[var(--shadow-sm)]"
          >
            <FiPlus size={14} /> New Profile
          </button>
        </div>

        {/* Profiles Table */}
        <div className="table-responsive">
          <table className="w-full text-left text-xs text-[var(--text-primary)]">
            <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Profile Name</th>
                <th className="px-5 py-3">Resolution</th>
                <th className="px-5 py-3">Video Codec</th>
                <th className="px-5 py-3">Audio Codec</th>
                <th className="px-5 py-3">Preset</th>
                <th className="px-5 py-3">Hardware</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {profiles.map(p => (
                <tr key={p.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-5 py-3.5 font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span className="text-[var(--text-muted)] font-mono text-[10px]">⠿</span>
                    {p.name}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--text-secondary)]">{p.resolution || '1920x1080'}</td>
                  <td className="px-5 py-3.5 font-semibold text-[var(--text-secondary)]">{p.videoCodec || 'H.264'}</td>
                  <td className="px-5 py-3.5 font-semibold text-[var(--text-secondary)]">{p.audioCodec || 'AAC'}</td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--text-muted)]">{p.preset || 'veryfast'}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-muted)] text-[var(--text-secondary)] border border-[var(--border)]">
                      {p.videoCodec?.includes('nvenc') ? 'NVIDIA NVENC' : p.videoCodec?.includes('amf') ? 'AMD AMF' : p.videoCodec?.includes('videotoolbox') ? 'VideoToolbox' : 'Software'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 font-semibold">
                    <button
                      onClick={() => { setEditingProfile(p); setProfileModalOpen(true); }}
                      className="text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                    >
                      <FiEdit3 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => removeProfile(p.id)}
                      className="text-red-600 hover:underline inline-flex items-center gap-1"
                    >
                      <FiTrash2 size={12} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--surface-muted)] text-xs text-[var(--text-muted)] font-semibold">
          Showing 1 to {profiles.length} of {profiles.length} profiles
        </div>
      </Card>

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
