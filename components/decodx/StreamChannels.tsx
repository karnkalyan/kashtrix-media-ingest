import React, { useState } from 'react';
import { FiRadio, FiPlus, FiTrash2, FiPlay, FiTv } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import StatusBadge from '../ui/StatusBadge';
import Modal from '../ui/Modal';

interface StreamChannel {
  id: number;
  name: string;
  streamUrl: string;
  type?: string;
  description?: string;
}

const StreamChannels: React.FC = () => {
  const [channels, setChannels] = useState<StreamChannel[]>([]);
  const [search, setSearch] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: '', streamUrl: '', type: 'LIVE', description: '' });

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.streamUrl) return toast.error('Channel name and Stream URL required');
    const newChan: StreamChannel = {
      id: Date.now(),
      name: form.name,
      streamUrl: form.streamUrl,
      type: form.type,
      description: form.description,
    };
    setChannels(prev => [...prev, newChan]);
    toast.success('Stream Channel created');
    setCreateModal(false);
    setForm({ name: '', streamUrl: '', type: 'LIVE', description: '' });
  };

  const filteredChannels = channels.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.streamUrl.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search channels by name or URL..."
          className="w-full sm:w-80"
        />
        <Button size="sm" onClick={() => setCreateModal(true)}>
          <FiPlus size={16} /> Add Stream Channel
        </Button>
      </div>

      <Card padding="none">
        <div className="table-responsive">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Channel Name</th>
                <th className="px-6 py-4">Stream Type</th>
                <th className="px-6 py-4">Stream URL</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredChannels.map(channel => (
                <tr key={channel.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap font-bold text-[var(--text-primary)]">
                    {channel.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={channel.type || 'LIVE'} />
                  </td>
                  <td className="px-6 py-4 max-w-[300px] truncate text-xs font-mono text-[var(--text-secondary)]">
                    {channel.streamUrl}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setChannels(prev => prev.filter(c => c.id !== channel.id))}
                      className="p-2 text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 rounded-[var(--radius-sm)] transition-colors"
                      title="Delete Channel"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredChannels.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                    No DecodX stream channels configured yet. Click "Add Stream Channel" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title="Add Stream Channel"
      >
        <form onSubmit={handleCreateChannel} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Channel Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Sports HD 1"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Stream Source URL *</label>
            <input
              type="text"
              required
              value={form.streamUrl}
              onChange={e => setForm(prev => ({ ...prev, streamUrl: e.target.value }))}
              placeholder="rtmp://... or http://.../index.m3u8"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm font-mono outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="LIVE">Live Stream</option>
              <option value="VOD">VOD Movie</option>
              <option value="CATCHUP">Catch-up TV</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button type="submit">Create Channel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StreamChannels;
