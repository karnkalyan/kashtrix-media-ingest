import React, { useEffect, useState } from 'react';
import { FiSmartphone, FiRefreshCw, FiPower, FiEdit3, FiCheck, FiX, FiInfo, FiTrash2, FiPlay, FiStopCircle, FiList } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import SearchInput from '../ui/SearchInput';
import DetailDrawer from '../ui/DetailDrawer';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';

interface Device {
  id: number;
  hwid: string;
  name?: string;
  isActivated: boolean;
  streamUrl?: string;
  status: string;
  lastSeen: string;
  model?: string;
  brand?: string;
  osVersion?: string;
  appVersion?: string;
  ipAddress?: string;
  isOnline: boolean;
  runtime?: {
    currentUrl?: string;
    bufferPercent?: number;
    uptime?: number;
    status?: string;
  };
}

const DeviceList: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceLogs, setDeviceLogs] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUrlModal, setEditUrlModal] = useState<Device | null>(null);
  const [newStreamUrl, setNewStreamUrl] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Device | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await fetch('/v1/admin/devices', {
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      }
    } catch (e) {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleActivation = async (device: Device) => {
    setActionLoading(true);
    try {
      const res = await fetch('/v1/admin/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123',
        },
        body: JSON.stringify({ hwid: device.hwid, isActivated: !device.isActivated }),
      });
      if (res.ok) {
        toast.success(`Device ${!device.isActivated ? 'Activated' : 'Deauthorized'}`);
        fetchDevices();
      } else {
        toast.error('Failed to update activation state');
      }
    } catch (e) {
      toast.error('Request error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetStreamUrl = async () => {
    if (!editUrlModal || !newStreamUrl) return;
    setActionLoading(true);
    try {
      const res = await fetch('/v1/admin/seturl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123',
        },
        body: JSON.stringify({ hwid: editUrlModal.hwid, streamUrl: newStreamUrl }),
      });
      if (res.ok) {
        toast.success('Stream URL updated');
        setEditUrlModal(null);
        fetchDevices();
      } else {
        toast.error('Failed to update stream URL');
      }
    } catch (e) {
      toast.error('Request error');
    } finally {
      setActionLoading(false);
    }
  };

  const rebootDevice = async (hwid: string) => {
    try {
      const res = await fetch(`/v1/admin/device/${hwid}/reboot`, {
        method: 'POST',
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) toast.success('Reboot command sent to device');
      else toast.error('Device offline or unavailable');
    } catch (e) {
      toast.error('Failed to send reboot command');
    }
  };

  const handleDeleteDevice = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/v1/admin/device/${deleteConfirm.hwid}`, {
        method: 'DELETE',
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        toast.success('Device removed');
        setDeleteConfirm(null);
        fetchDevices();
      }
    } catch (e) {
      toast.error('Failed to delete device');
    } finally {
      setActionLoading(false);
    }
  };

  const viewDeviceDetails = async (device: Device) => {
    setSelectedDevice(device);
    setDrawerOpen(true);
    try {
      const res = await fetch(`/v1/admin/device/${device.hwid}/logs`, {
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        const logs = await res.json();
        setDeviceLogs(logs);
      }
    } catch (e) {
      setDeviceLogs([]);
    }
  };

  const filteredDevices = devices.filter(d =>
    d.hwid.toLowerCase().includes(search.toLowerCase()) ||
    (d.name && d.name.toLowerCase().includes(search.toLowerCase())) ||
    (d.model && d.model.toLowerCase().includes(search.toLowerCase())) ||
    (d.ipAddress && d.ipAddress.includes(search))
  );

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by HWID, name, model, or IP..."
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={fetchDevices} loading={loading}>
            <FiRefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* Device Table */}
      <Card padding="none">
        <div className="table-responsive">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Device HWID / Name</th>
                <th className="px-6 py-4">Model & Specs</th>
                <th className="px-6 py-4">Stream Source</th>
                <th className="px-6 py-4">Activation</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredDevices.map(device => (
                <tr key={device.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={device.isOnline ? (device.runtime?.status || 'Online') : 'Offline'} />
                  </td>

                  {/* Device HWID / Name */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-bold text-[var(--text-primary)]">{device.name || device.hwid}</div>
                    <div className="text-xs font-mono text-[var(--text-muted)]">{device.hwid}</div>
                    {device.ipAddress && <div className="text-[11px] text-[var(--text-muted)]">{device.ipAddress}</div>}
                  </td>

                  {/* Model & Specs */}
                  <td className="px-6 py-4 whitespace-nowrap text-xs">
                    <div className="font-semibold text-[var(--text-secondary)]">{device.brand || ''} {device.model || 'Generic Android STB'}</div>
                    <div className="text-[var(--text-muted)]">Android {device.osVersion || 'N/A'} • App v{device.appVersion || '1.0.0'}</div>
                  </td>

                  {/* Stream Source */}
                  <td className="px-6 py-4 max-w-[200px] truncate text-xs">
                    <span className="font-mono text-[var(--text-secondary)] truncate block" title={device.streamUrl || 'No Stream URL'}>
                      {device.streamUrl || <span className="text-[var(--text-muted)] italic">No URL set</span>}
                    </span>
                  </td>

                  {/* Activation Toggle */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Button
                      variant={device.isActivated ? 'success' : 'secondary'}
                      size="sm"
                      onClick={() => toggleActivation(device)}
                      loading={actionLoading}
                    >
                      {device.isActivated ? <FiCheck size={14} /> : <FiX size={14} />}
                      {device.isActivated ? 'Activated' : 'Pending'}
                    </Button>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <button
                      onClick={() => { setEditUrlModal(device); setNewStreamUrl(device.streamUrl || ''); }}
                      className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--primary-50)] rounded-[var(--radius-sm)] transition-colors"
                      title="Set Stream URL"
                    >
                      <FiEdit3 size={16} />
                    </button>
                    <button
                      onClick={() => rebootDevice(device.hwid)}
                      className="p-2 text-[var(--text-secondary)] hover:text-amber-600 hover:bg-amber-50 rounded-[var(--radius-sm)] transition-colors"
                      title="Reboot Device"
                    >
                      <FiPower size={16} />
                    </button>
                    <button
                      onClick={() => viewDeviceDetails(device)}
                      className="p-2 text-[var(--text-secondary)] hover:text-sky-600 hover:bg-sky-50 rounded-[var(--radius-sm)] transition-colors"
                      title="Device Details & Logs"
                    >
                      <FiInfo size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(device)}
                      className="p-2 text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 rounded-[var(--radius-sm)] transition-colors"
                      title="Delete Device"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                    No devices registered yet. Connect an Android decoder client to auto-register.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Stream URL Modal */}
      {editUrlModal && (
        <Modal
          isOpen={true}
          onClose={() => setEditUrlModal(null)}
          title={`Set Stream URL: ${editUrlModal.name || editUrlModal.hwid}`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">Stream URL</label>
              <input
                type="text"
                value={newStreamUrl}
                onChange={e => setNewStreamUrl(e.target.value)}
                placeholder="rtmp://... or http://.../index.m3u8"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-mono text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={() => setEditUrlModal(null)}>Cancel</Button>
              <Button onClick={handleSetStreamUrl} loading={actionLoading}>Save Stream URL</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remove Device"
        message={`Are you sure you want to delete device ${deleteConfirm?.hwid}? It will be deauthorized.`}
        onConfirm={handleDeleteDevice}
        onCancel={() => setDeleteConfirm(null)}
        loading={actionLoading}
      />

      {/* Device Details Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Device ${selectedDevice?.name || selectedDevice?.hwid}`}
        subtitle={`Hardware ID: ${selectedDevice?.hwid}`}
      >
        {selectedDevice && (
          <div className="space-y-6">
            <div className="space-y-3 border-b border-[var(--border)] pb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Model</span>
                <span className="font-semibold">{selectedDevice.brand} {selectedDevice.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">IP Address</span>
                <span className="font-mono">{selectedDevice.ipAddress || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Last Seen</span>
                <span>{new Date(selectedDevice.lastSeen).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Recent Connection Logs</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {deviceLogs.map(log => (
                  <div key={log.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-xs">
                    <div className="flex justify-between font-bold text-[var(--primary)]">
                      <span>{log.event}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                    {log.details && <p className="text-[var(--text-secondary)] mt-1 font-mono">{log.details}</p>}
                  </div>
                ))}
                {deviceLogs.length === 0 && <p className="text-xs text-[var(--text-muted)]">No logs available</p>}
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
};

export default DeviceList;
