import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Key,
  Users,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  X,
  ExternalLink,
  Sliders,
  Radio,
  Lock,
  Unlock,
  AlertTriangle,
  Terminal,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { RtmpSecuritySettings, RtmpStreamKey, RtmpPublisherAccount, RtmpActiveLock } from '../types';
import ConfirmDialog from './ui/ConfirmDialog';

interface LiveServerSecurityModalProps {
  open: boolean;
  onClose: () => void;
  rtmpPort?: number;
  api: (endpoint: string, options?: RequestInit) => Promise<any>;
}

export const LiveServerSecurityModal: React.FC<LiveServerSecurityModalProps> = ({
  open,
  onClose,
  rtmpPort = 1935,
  api
}) => {
  const [activeTab, setActiveTab] = useState<'keys' | 'accounts' | 'generator'>('keys');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<RtmpSecuritySettings>({
    enabled: false,
    authMode: 'flexible',
    singlePublisherPerKey: true,
    playbackSecurityEnabled: false,
    keys: [],
    accounts: []
  });
  const [activeLocks, setActiveLocks] = useState<{ keys: RtmpActiveLock[]; accounts: RtmpActiveLock[] }>({
    keys: [],
    accounts: []
  });

  // Reveal keys map (keyId -> boolean)
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  // Add/Edit Key Modal
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({
    id: '',
    name: '',
    key: '',
    allowedStreams: '*',
    singlePublisherOnly: true,
    playbackSecurity: 'inherit' as 'open' | 'secure' | 'inherit',
    playbackToken: '',
    expiresAt: '',
    enabled: true
  });

  // Add/Edit Account Modal
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({
    id: '',
    username: '',
    password: '',
    allowedStreams: '*',
    singlePublisherOnly: true,
    playbackSecurity: 'inherit' as 'open' | 'secure' | 'inherit',
    enabled: true
  });

  // Custom Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    variant: 'danger',
    onConfirm: () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Setup Generator State
  const [genStreamName, setGenStreamName] = useState('live_feed');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [selectedAccId, setSelectedAccId] = useState<string>('');
  const [customHost, setCustomHost] = useState(typeof window !== 'undefined' ? window.location.hostname : 'localhost');

  const fetchSecuritySettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api('/api/live-server/security');
      if (res && res.settings) {
        setSettings(res.settings);
        if (res.activeLocks) setActiveLocks(res.activeLocks);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load RTMP security settings');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (open) {
      fetchSecuritySettings();
    }
  }, [open, fetchSecuritySettings]);

  // Toggle master ingest security enabled/disabled (Open Mode vs Secure Mode)
  const handleToggleSecurity = async (newEnabled: boolean) => {
    const updated = { ...settings, enabled: newEnabled };
    setSettings(updated); // Optimistic UI update
    try {
      setSaving(true);
      const res = await api('/api/live-server/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res && res.settings) {
        setSettings(res.settings);
        toast.success(newEnabled ? 'Ingest Security ENABLED (Secure Mode Active)' : 'Ingest Security DISABLED (Unsecure / Open Mode Active)');
      }
    } catch (err: any) {
      setSettings(settings); // Revert on failure
      toast.error(err.message || 'Failed to update security mode');
    } finally {
      setSaving(false);
    }
  };

  // Toggle master playback security enabled/disabled
  const handleTogglePlaybackSecurity = async (newPlaybackEnabled: boolean) => {
    const updated = { ...settings, playbackSecurityEnabled: newPlaybackEnabled };
    setSettings(updated); // Optimistic UI update
    try {
      setSaving(true);
      const res = await api('/api/live-server/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res && res.settings) {
        setSettings(res.settings);
        toast.success(newPlaybackEnabled ? 'Global Playback Protection ENABLED (Tokens Required)' : 'Global Playback UNSECURED (Open Playback Active)');
      }
    } catch (err: any) {
      setSettings(settings);
      toast.error(err.message || 'Failed to update playback security mode');
    } finally {
      setSaving(false);
    }
  };

  // Toggle single-key concurrency lock
  const handleToggleSinglePublisher = async (newVal: boolean) => {
    const updated = { ...settings, singlePublisherPerKey: newVal };
    setSettings(updated);
    try {
      setSaving(true);
      const res = await api('/api/live-server/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res && res.settings) {
        setSettings(res.settings);
        toast.success(newVal ? 'Single-Key concurrency lock enabled' : 'Multi-publisher key reuse allowed');
      }
    } catch (err: any) {
      setSettings(settings);
      toast.error(err.message || 'Failed to update policy');
    } finally {
      setSaving(false);
    }
  };

  // Generate random key string
  const handleGenerateRandomKey = async () => {
    try {
      const res = await api('/api/live-server/security/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'kas_live_' })
      });
      if (res && res.key) {
        setKeyForm(prev => ({ ...prev, key: res.key }));
      }
    } catch (_) {
      const fallback = `kas_live_${crypto.randomUUID().replace(/-/g, '')}`;
      setKeyForm(prev => ({ ...prev, key: fallback }));
    }
  };

  // Generate random separate playback token string
  const handleGenerateRandomPlaybackToken = async () => {
    try {
      const res = await api('/api/live-server/security/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'kas_play_' })
      });
      if (res && res.key) {
        setKeyForm(prev => ({ ...prev, playbackToken: res.key }));
      }
    } catch (_) {
      const fallback = `kas_play_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
      setKeyForm(prev => ({ ...prev, playbackToken: fallback }));
    }
  };

  // Open New Key Modal
  const openNewKeyModal = async () => {
    let newKey = `kas_live_${crypto.randomUUID().replace(/-/g, '')}`;
    let newPlayToken = `kas_play_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    try {
      const res = await api('/api/live-server/security/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'kas_live_' })
      });
      if (res && res.key) newKey = res.key;
    } catch (_) {}

    setKeyForm({
      id: '',
      name: '',
      key: newKey,
      allowedStreams: '*',
      singlePublisherOnly: true,
      playbackSecurity: 'inherit',
      playbackToken: newPlayToken,
      expiresAt: '',
      enabled: true
    });
    setKeyModalOpen(true);
  };

  // Open Edit Key Modal
  const openEditKeyModal = (keyItem: RtmpStreamKey) => {
    setKeyForm({
      id: keyItem.id,
      name: keyItem.name,
      key: keyItem.key,
      allowedStreams: Array.isArray(keyItem.allowedStreams) ? keyItem.allowedStreams.join(', ') : '*',
      singlePublisherOnly: keyItem.singlePublisherOnly !== false,
      playbackSecurity: keyItem.playbackSecurity || 'inherit',
      playbackToken: keyItem.playbackToken || `kas_play_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      expiresAt: keyItem.expiresAt ? new Date(keyItem.expiresAt).toISOString().slice(0, 16) : '',
      enabled: keyItem.enabled !== false
    });
    setKeyModalOpen(true);
  };

  // Toggle Stream Key Playback Security Mode (1-Click Switch: inherit -> open -> secure -> inherit)
  const handleCycleKeyPlaybackSecurity = async (keyItem: RtmpStreamKey) => {
    const current = keyItem.playbackSecurity || 'inherit';
    const nextMode = current === 'inherit' ? 'open' : current === 'open' ? 'secure' : 'inherit';
    try {
      await api(`/api/live-server/security/keys/${keyItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbackSecurity: nextMode })
      });
      toast.success(`Stream "${keyItem.name}" playback mode set to: ${nextMode.toUpperCase()}`);
      fetchSecuritySettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update playback security mode');
    }
  };

  // Save Stream Key
  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyForm.name.trim()) return toast.error('Key Name is required');
    if (!keyForm.key.trim()) return toast.error('Stream Key string is required');

    try {
      setSaving(true);
      const allowed = keyForm.allowedStreams
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        name: keyForm.name.trim(),
        key: keyForm.key.trim(),
        allowedStreams: allowed.length > 0 ? allowed : ['*'],
        singlePublisherOnly: keyForm.singlePublisherOnly,
        playbackSecurity: keyForm.playbackSecurity,
        playbackToken: keyForm.playbackToken.trim(),
        expiresAt: keyForm.expiresAt ? new Date(keyForm.expiresAt).toISOString() : null,
        enabled: keyForm.enabled
      };

      if (keyForm.id) {
        await api(`/api/live-server/security/keys/${keyForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success(`Stream key "${keyForm.name}" updated`);
      } else {
        await api('/api/live-server/security/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success(`Stream key "${keyForm.name}" created`);
      }

      setKeyModalOpen(false);
      fetchSecuritySettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save stream key');
    } finally {
      setSaving(false);
    }
  };

  // Delete Stream Key
  const handleDeleteKey = (id: string, name: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Stream Key',
      message: `Are you sure you want to delete stream key "${name}"?`,
      confirmLabel: 'Delete Key',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api(`/api/live-server/security/keys/${id}`, { method: 'DELETE' });
          toast.success('Stream key deleted');
          fetchSecuritySettings();
          setConfirmDialog(prev => ({ ...prev, open: false }));
        } catch (err: any) {
          toast.error(err.message || 'Failed to delete stream key');
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  // Toggle Key Enabled
  const handleToggleKeyEnabled = async (keyItem: RtmpStreamKey) => {
    try {
      const updated = !keyItem.enabled;
      await api(`/api/live-server/security/keys/${keyItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: updated })
      });
      toast.success(`Key "${keyItem.name}" ${updated ? 'enabled' : 'disabled'}`);
      fetchSecuritySettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle key');
    }
  };

  // Save Publisher Account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.username.trim()) return toast.error('Username is required');
    if (!accountForm.password.trim() && !accountForm.id) return toast.error('Password is required');

    try {
      setSaving(true);
      const allowed = accountForm.allowedStreams
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        username: accountForm.username.trim(),
        password: accountForm.password.trim(),
        allowedStreams: allowed.length > 0 ? allowed : ['*'],
        singlePublisherOnly: accountForm.singlePublisherOnly,
        enabled: accountForm.enabled
      };

      if (accountForm.id) {
        await api(`/api/live-server/security/accounts/${accountForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success(`Publisher account "${accountForm.username}" updated`);
      } else {
        await api('/api/live-server/security/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success(`Publisher account "${accountForm.username}" created`);
      }

      setAccountModalOpen(false);
      fetchSecuritySettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save publisher account');
    } finally {
      setSaving(false);
    }
  };

  // Delete Publisher Account
  const handleDeleteAccount = (id: string, username: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Publisher Account',
      message: `Are you sure you want to delete publisher account "${username}"?`,
      confirmLabel: 'Delete Account',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api(`/api/live-server/security/accounts/${id}`, { method: 'DELETE' });
          toast.success('Publisher account deleted');
          fetchSecuritySettings();
          setConfirmDialog(prev => ({ ...prev, open: false }));
        } catch (err: any) {
          toast.error(err.message || 'Failed to delete account');
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`, { icon: '📋' });
  };

  if (!open) return null;

  // Selected key for Setup Generator
  const activeKeyForGen = settings.keys.find(k => k.id === selectedKeyId) || settings.keys[0];
  const activeAccForGen = settings.accounts.find(a => a.id === selectedAccId) || settings.accounts[0];

  const genServerUrl = `rtmp://${customHost}:${rtmpPort}/live`;
  const genStreamKeyOBS = activeKeyForGen ? `${genStreamName}?key=${activeKeyForGen.key}` : genStreamName;
  const genFullUrlKey = `${genServerUrl}/${genStreamKeyOBS}`;
  const genFfmpegCmd = `ffmpeg -re -i "input.mp4" -c copy -f flv "${genFullUrlKey}"`;
  
  const genOpenHlsUrl = `http://${customHost}:${settings.httpPort || 8100}/live/${genStreamName}/index.m3u8`;
  const genOpenRtmpUrl = `rtmp://${customHost}:${rtmpPort}/live/${genStreamName}`;

  const genPlayToken = activeKeyForGen?.playbackToken || 'viewer_token';
  const genSecureHlsUrl = `http://${customHost}:${settings.httpPort || 8100}/live/${genStreamName}/index.m3u8?token=${genPlayToken}`;
  const genSecureRtmpUrl = `rtmp://${customHost}:${rtmpPort}/live/${genStreamName}?token=${genPlayToken}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-fadeIn">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-[#E8DFF0] bg-white shadow-2xl overflow-hidden dark:border-[#371F59] dark:bg-[#1A1028]">
        
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-[#E8DFF0] bg-gradient-to-r from-violet-900/10 via-white to-white px-6 py-4 dark:border-[#371F59] dark:from-[#2B1647] dark:via-[#1A1028] dark:to-[#1A1028]">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-xs ${
              settings.enabled
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300'
            }`}>
              {settings.enabled ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">
                  Live Server RTMP Security &amp; Stream Keys
                </h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                  settings.enabled
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${settings.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {settings.enabled ? 'SECURE MODE' : 'OPEN / UNSECURE'}
                </span>
              </div>
              <p className="text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
                Enforce authentication on RTMP streams via URL keys (?key=...) or credentials.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSecuritySettings}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] hover:bg-[#F4EEFF] dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#E2D1F9]"
              title="Refresh Settings"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6F6078] hover:bg-rose-50 hover:text-rose-600 dark:text-[#B9A5CD] dark:hover:bg-rose-950/60"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body with Navigation Tabs */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Master Controls Header */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* 1. Master RTMP Ingest Authentication Mode Toggle */}
            <div className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
              settings.enabled
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
            }`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-[#1B1024] dark:text-white">
                  <Lock size={13} className={settings.enabled ? 'text-emerald-600' : 'text-amber-600'} />
                  Publish Ingest Security
                </div>
                <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {settings.enabled ? 'Key or Login required to stream' : 'Open / Unsecured (Anyone can stream)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSecurity(!settings.enabled)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.enabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* 2. Master Playback Security Toggle */}
            <div className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
              settings.playbackSecurityEnabled
                ? 'border-purple-200 bg-purple-50/50 dark:border-purple-900/60 dark:bg-purple-950/20'
                : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/20'
            }`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-[#1B1024] dark:text-white">
                  <Radio size={13} className={settings.playbackSecurityEnabled ? 'text-purple-600' : 'text-slate-500'} />
                  Playback Protection
                </div>
                <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {settings.playbackSecurityEnabled ? 'Token required to watch' : 'Public HLS / RTMP play'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTogglePlaybackSecurity(!settings.playbackSecurityEnabled)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.playbackSecurityEnabled ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.playbackSecurityEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* 3. Concurrency Lock Policy */}
            <div className="flex items-center justify-between rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 dark:border-[#371F59] dark:bg-[#211335]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-[#1B1024] dark:text-white">
                  <Key size={13} className="text-violet-600" />
                  Single-Session Lock
                </div>
                <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {settings.singlePublisherPerKey ? 'Strict 1 encoder per key' : 'Allow multiple encoders per key'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSinglePublisher(!settings.singlePublisherPerKey)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.singlePublisherPerKey ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.singlePublisherPerKey ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-[#E8DFF0] pb-2 dark:border-[#371F59]">
            <button
              type="button"
              onClick={() => setActiveTab('keys')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${
                activeTab === 'keys'
                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
                  : 'text-[#6F6078] hover:bg-slate-100 dark:text-[#B9A5CD] dark:hover:bg-slate-800'
              }`}
            >
              <Key size={14} /> Stream Keys ({settings.keys.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${
                activeTab === 'accounts'
                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
                  : 'text-[#6F6078] hover:bg-slate-100 dark:text-[#B9A5CD] dark:hover:bg-slate-800'
              }`}
            >
              <Users size={14} /> Publisher Accounts ({settings.accounts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('generator')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${
                activeTab === 'generator'
                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
                  : 'text-[#6F6078] hover:bg-slate-100 dark:text-[#B9A5CD] dark:hover:bg-slate-800'
              }`}
            >
              <Zap size={14} /> OBS Setup &amp; Playback URLs
            </button>
          </div>

          {/* TAB 1: STREAM KEYS */}
          {activeTab === 'keys' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
                    Authorized Ingest Stream Keys
                  </h3>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Publishers connect with: <code className="font-mono text-violet-700 bg-violet-50 px-1 py-0.5 rounded text-[10px] dark:bg-violet-950 dark:text-violet-300">rtmp://host:1935/live/streamName?key=kas_live_...</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewKeyModal}
                  className="flex h-8 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700 transition-colors"
                >
                  <Plus size={14} /> Generate Stream Key
                </button>
              </div>

              {settings.keys.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E8DFF0] bg-[#F8F7FA] p-8 text-center dark:border-[#371F59] dark:bg-[#211335]/50">
                  <Key size={32} className="mx-auto text-[#6F6078] dark:text-[#B9A5CD]" />
                  <p className="mt-2 text-[13px] font-bold text-[#1B1024] dark:text-white">No stream keys generated yet</p>
                  <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD] max-w-md mx-auto">
                    Generate secure stream keys for your broadcast studios, OBS clients, and RTMP encoders.
                  </p>
                  <button
                    type="button"
                    onClick={openNewKeyModal}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700"
                  >
                    <Plus size={14} /> Generate First Key
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-xs dark:border-[#371F59] dark:bg-[#1E1130]">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]">
                        <th className="px-4 py-3">Key Label</th>
                        <th className="px-4 py-3">Publish Key</th>
                        <th className="px-4 py-3">Allowed Streams</th>
                        <th className="px-4 py-3">Playback Security</th>
                        <th className="px-4 py-3">Single Session</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#371F59]">
                      {settings.keys.map((k) => {
                        const isRevealed = !!revealedKeys[k.id];
                        const playMode = k.playbackSecurity || 'inherit';

                        return (
                          <tr key={k.id} className="transition-colors hover:bg-[#F4EEFF]/40 dark:hover:bg-[#281640]/40">
                            <td className="px-4 py-3 font-bold text-[#1B1024] dark:text-white">
                              {k.name}
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-violet-700 dark:text-violet-300">
                                  {isRevealed ? k.key : `${k.key.slice(0, 10)}••••••••`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRevealedKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                                  className="p-1 text-[#6F6078] hover:text-violet-600 dark:text-[#B9A5CD] dark:hover:text-violet-300"
                                >
                                  {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                              {k.allowedStreams?.join(', ') || '*'}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleCycleKeyPlaybackSecurity(k)}
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border transition-colors cursor-pointer ${
                                  playMode === 'secure'
                                    ? 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800'
                                    : playMode === 'open'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                }`}
                                title="Click to cycle: Open Playback ↔ Secure Token Playback ↔ Inherit Global"
                              >
                                {playMode === 'secure' ? (
                                  <>
                                    <Lock size={10} /> Secure ({k.playbackToken ? 'Token' : 'Key'})
                                  </>
                                ) : playMode === 'open' ? (
                                  <>
                                    <Unlock size={10} /> Open Playback
                                  </>
                                ) : (
                                  <>
                                    <Radio size={10} /> Inherit ({settings.playbackSecurityEnabled ? 'Secure' : 'Open'})
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                k.singlePublisherOnly !== false
                                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}>
                                {k.singlePublisherOnly !== false ? 'Enforced' : 'Multi'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleToggleKeyEnabled(k)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                                  k.enabled !== false
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {k.enabled !== false ? 'Enabled' : 'Disabled'}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                type="button"
                                onClick={() => openEditKeyModal(k)}
                                className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2 py-1 text-[11px] font-bold text-[#6F6078] hover:bg-slate-50 dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteKey(k.id, k.name)}
                                className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-rose-50 hover:text-rose-600 dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]"
                              >
                                <Trash2 size={13} />
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
          )}

          {/* TAB 2: PUBLISHER ACCOUNTS */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
                    Publisher Credentials (User &amp; Password)
                  </h3>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                    For encoders connecting with basic credentials (e.g. <code className="font-mono text-violet-700 bg-violet-50 px-1 py-0.5 rounded text-[10px] dark:bg-violet-950 dark:text-violet-300">rtmp://user:pass@host:1935/live/feed</code>)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAccountForm({
                      id: '',
                      username: '',
                      password: '',
                      allowedStreams: '*',
                      singlePublisherOnly: true,
                      playbackSecurity: 'inherit',
                      enabled: true
                    });
                    setAccountModalOpen(true);
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700 transition-colors"
                >
                  <Plus size={14} /> Add Publisher Account
                </button>
              </div>

              {settings.accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E8DFF0] bg-[#F8F7FA] p-8 text-center dark:border-[#371F59] dark:bg-[#211335]/50">
                  <Users size={32} className="mx-auto text-[#6F6078] dark:text-[#B9A5CD]" />
                  <p className="mt-2 text-[13px] font-bold text-[#1B1024] dark:text-white">No publisher accounts registered</p>
                  <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD] max-w-md mx-auto">
                    Create username and password credentials for encoders that support native authentication.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-xs dark:border-[#371F59] dark:bg-[#1E1130]">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]">
                        <th className="px-4 py-3">Username</th>
                        <th className="px-4 py-3">Target Stream</th>
                        <th className="px-4 py-3">Single Session</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#371F59]">
                      {settings.accounts.map((a) => (
                        <tr key={a.id} className="transition-colors hover:bg-[#F4EEFF]/40 dark:hover:bg-[#281640]/40">
                          <td className="px-4 py-3 font-bold text-[#1B1024] dark:text-white font-mono">
                            {a.username}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                            {a.allowedStreams?.join(', ') || '*'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                              {a.singlePublisherOnly !== false ? 'Enforced' : 'Multi'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              a.enabled !== false
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}>
                              {a.enabled !== false ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(a.id, a.username)}
                              className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-rose-50 hover:text-rose-600 dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: OBS & ENCODER SETUP GENERATOR */}
          {activeTab === 'generator' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:bg-violet-950/40 dark:border-violet-900/60">
                <div className="flex items-center gap-2 text-violet-900 dark:text-violet-200 font-bold text-[13px]">
                  <Zap size={16} /> Instant Encoder Configuration &amp; Playback Helper
                </div>
                <p className="mt-1 text-[11px] text-violet-800 dark:text-violet-300">
                  Select a stream key to configure your encoder (OBS Studio, vMix, Wirecast) and preview both Unsecured and Protected HLS/RTMP Playback URLs.
                </p>
              </div>

              {/* Generator Form Controls */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                    Select Stream Key:
                  </label>
                  <select
                    value={selectedKeyId}
                    onChange={(e) => setSelectedKeyId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-2.5 text-[12px] font-semibold text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                  >
                    {settings.keys.map(k => (
                      <option key={k.id} value={k.id}>{k.name} ({k.key.slice(0, 8)}...)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                    Stream Name:
                  </label>
                  <input
                    type="text"
                    value={genStreamName}
                    onChange={(e) => setGenStreamName(e.target.value.trim().replace(/[^a-zA-Z0-9_-]/g, ''))}
                    className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-2.5 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                    Server Host IP / Domain:
                  </label>
                  <input
                    type="text"
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value.trim())}
                    className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-2.5 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                  />
                </div>
              </div>

              {/* Ready Setup Strings */}
              <div className="space-y-4 pt-2">
                {/* 1. OBS Studio Ingest */}
                <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-2 dark:border-[#371F59] dark:bg-[#25173B]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      🎥 OBS Studio / Streamlabs Ingest:
                    </span>
                    <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">Settings &gt; Stream &gt; Custom</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase">Server</label>
                      <div className="flex items-center justify-between rounded-lg border border-[#E8DFF0] bg-white px-2.5 py-1.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#1A1028] dark:border-[#371F59] dark:text-white">
                        <span className="truncate">{genServerUrl}</span>
                        <button type="button" onClick={() => copyToClipboard(genServerUrl, 'Server URL')} className="ml-2 text-violet-600 hover:text-violet-800"><Copy size={12} /></button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase">Stream Key</label>
                      <div className="flex items-center justify-between rounded-lg border border-[#E8DFF0] bg-white px-2.5 py-1.5 font-mono text-[11px] text-violet-700 dark:bg-[#1A1028] dark:border-[#371F59] dark:text-violet-300">
                        <span className="truncate">{genStreamKeyOBS}</span>
                        <button type="button" onClick={() => copyToClipboard(genStreamKeyOBS, 'Stream Key')} className="ml-2 text-violet-600 hover:text-violet-800"><Copy size={12} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. FFmpeg Command */}
                <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-1.5 dark:border-[#371F59] dark:bg-[#25173B]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      <Terminal size={13} /> FFmpeg Ingest Command:
                    </span>
                    <button type="button" onClick={() => copyToClipboard(genFfmpegCmd, 'FFmpeg command')} className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700">
                      <Copy size={12} /> Copy Command
                    </button>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 break-all">
                    {genFfmpegCmd}
                  </div>
                </div>

                {/* 4. BOTH UNSECURE AND SECURE PLAYBACK URLS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Open / Unsecure Playback */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <Unlock size={14} className="text-emerald-600" /> 🔓 Open / Public Playback URLs:
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                        <span>HLS URL (Web / VLC / Player):</span>
                        <button type="button" onClick={() => copyToClipboard(genOpenHlsUrl, 'Open HLS URL')} className="hover:underline flex items-center gap-1"><Copy size={10} /> Copy</button>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white p-2 font-mono text-[10px] text-emerald-900 break-all dark:bg-[#1A1028] dark:border-emerald-800 dark:text-emerald-200">
                        {genOpenHlsUrl}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800 dark:text-emerald-300 pt-1">
                        <span>RTMP Playback URL:</span>
                        <button type="button" onClick={() => copyToClipboard(genOpenRtmpUrl, 'Open RTMP URL')} className="hover:underline flex items-center gap-1"><Copy size={10} /> Copy</button>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white p-2 font-mono text-[10px] text-emerald-900 break-all dark:bg-[#1A1028] dark:border-emerald-800 dark:text-emerald-200">
                        {genOpenRtmpUrl}
                      </div>
                    </div>
                  </div>

                  {/* Secure / Tokenized Playback */}
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 space-y-2 dark:border-purple-900/60 dark:bg-purple-950/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-extrabold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                        <Lock size={14} className="text-purple-600" /> 🔒 Protected Token Playback URLs:
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-purple-800 dark:text-purple-300">
                        <span>HLS Tokenized URL:</span>
                        <button type="button" onClick={() => copyToClipboard(genSecureHlsUrl, 'Secure HLS URL')} className="hover:underline flex items-center gap-1"><Copy size={10} /> Copy</button>
                      </div>
                      <div className="rounded-lg border border-purple-200 bg-white p-2 font-mono text-[10px] text-purple-900 break-all dark:bg-[#1A1028] dark:border-purple-800 dark:text-purple-200">
                        {genSecureHlsUrl}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold text-purple-800 dark:text-purple-300 pt-1">
                        <span>RTMP Tokenized URL:</span>
                        <button type="button" onClick={() => copyToClipboard(genSecureRtmpUrl, 'Secure RTMP URL')} className="hover:underline flex items-center gap-1"><Copy size={10} /> Copy</button>
                      </div>
                      <div className="rounded-lg border border-purple-200 bg-white p-2 font-mono text-[10px] text-purple-900 break-all dark:bg-[#1A1028] dark:border-purple-800 dark:text-purple-200">
                        {genSecureRtmpUrl}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="flex items-center justify-between border-t border-[#E8DFF0] bg-[#F8F7FA] px-6 py-3.5 dark:border-[#371F59] dark:bg-[#211335]">
          <div className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
            Active Publishers: <strong className="text-violet-700 dark:text-violet-300">{activeLocks.keys.length + activeLocks.accounts.length} active</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-xl bg-slate-900 px-5 text-[12px] font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* CREATE / EDIT STREAM KEY SUB-MODAL */}
      {keyModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#E8DFF0] bg-white p-6 shadow-2xl dark:border-[#371F59] dark:bg-[#1E1130] space-y-4 animate-scaleIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#371F59]">
              <h3 className="font-display text-[16px] font-bold text-[#1B1024] dark:text-white flex items-center gap-2">
                <Key size={18} className="text-violet-600" />
                {keyForm.id ? 'Edit Stream Key' : 'Generate New Stream Key'}
              </h3>
              <button type="button" onClick={() => setKeyModalOpen(false)} className="text-[#6F6078] hover:text-rose-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveKey} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                  Key Label / Studio Name: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={keyForm.name}
                  onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                  placeholder="e.g. Main News Studio OBS"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                />
              </div>

              {/* 1. Publishing Ingest Secret Key */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                    Secret Stream Key String (Publishing / Ingest): <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomKey}
                    className="text-[10px] font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1"
                  >
                    <RefreshCw size={11} /> Regenerate Random
                  </button>
                </div>
                <input
                  type="text"
                  value={keyForm.key}
                  onChange={(e) => setKeyForm({ ...keyForm, key: e.target.value.trim() })}
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-violet-700 dark:bg-[#25173B] dark:border-[#371F59] dark:text-violet-300"
                />
                <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                  OBS Studio, vMix, and RTMP encoders push live video using this key.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                  Allowed Target Stream Name (use <code className="font-mono text-violet-600">*</code> for any):
                </label>
                <input
                  type="text"
                  value={keyForm.allowedStreams}
                  onChange={(e) => setKeyForm({ ...keyForm, allowedStreams: e.target.value })}
                  placeholder="* or feed1, live_stream"
                  className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                />
              </div>

              {/* 2. Playback Security & Separate Token */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 space-y-3 dark:border-purple-900/60 dark:bg-purple-950/20">
                <div>
                  <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                    Playback Security (Watching HLS / RTMP stream):
                  </label>
                  <select
                    value={keyForm.playbackSecurity}
                    onChange={(e) => setKeyForm({ ...keyForm, playbackSecurity: e.target.value as any })}
                    className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-2.5 text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                  >
                    <option value="inherit">🌐 Inherit Global ({settings.playbackSecurityEnabled ? 'Protected' : 'Open'})</option>
                    <option value="open">🔓 Always Open (Public Playback)</option>
                    <option value="secure">🔒 Protected (Token or Key Required to Play)</option>
                  </select>
                </div>

                {keyForm.playbackSecurity === 'secure' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-purple-950 dark:text-purple-200">
                        Secret Playback Token (Separate from Stream Key):
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateRandomPlaybackToken}
                        className="text-[10px] font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1 dark:text-purple-300"
                      >
                        <RefreshCw size={11} /> Generate Random Token
                      </button>
                    </div>
                    <input
                      type="text"
                      value={keyForm.playbackToken}
                      onChange={(e) => setKeyForm({ ...keyForm, playbackToken: e.target.value.trim() })}
                      placeholder="e.g. kas_play_viewer_token"
                      className="mt-1 h-9 w-full rounded-lg border border-purple-300 bg-white px-3 font-mono text-[12px] text-purple-700 dark:bg-[#25173B] dark:border-[#371F59] dark:text-purple-300"
                    />
                    <p className="mt-1 text-[10px] text-purple-800 dark:text-purple-300">
                      ✨ Distinct Viewer Token: Viewers play HLS/RTMP using this token without exposing your publisher's secret ingest key.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="single-publisher-checkbox"
                  checked={keyForm.singlePublisherOnly}
                  onChange={(e) => setKeyForm({ ...keyForm, singlePublisherOnly: e.target.checked })}
                  className="h-4 w-4 rounded border-[#E8DFF0] text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="single-publisher-checkbox" className="text-[11px] font-semibold text-[#1B1024] dark:text-white cursor-pointer">
                  Enforce Single Session Lock (Only 1 encoder can stream with this key simultaneously)
                </label>
              </div>

              {/* 3. Live URL Preview Card */}
              <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-2 dark:border-[#371F59] dark:bg-[#211335]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6F6078] dark:text-[#B9A5CD] block">
                  Live URLs Generated For This Key:
                </span>
                
                <div className="space-y-1 text-[10px] font-mono">
                  <div className="p-1.5 rounded bg-white dark:bg-[#1A1028] border border-[#E8DFF0] dark:border-[#371F59] truncate">
                    <span className="text-violet-700 dark:text-violet-300 font-bold">📡 Ingest: </span>
                    <span>rtmp://{customHost || 'localhost'}:{rtmpPort}/live?key={keyForm.key}</span>
                  </div>
                  <div className="p-1.5 rounded bg-white dark:bg-[#1A1028] border border-[#E8DFF0] dark:border-[#371F59] truncate">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">🔓 Open HLS: </span>
                    <span>http://{customHost || 'localhost'}:{settings.httpPort || 8100}/live/{keyForm.allowedStreams?.split(',')[0]?.trim() !== '*' ? keyForm.allowedStreams?.split(',')[0]?.trim() : 'live_stream'}/index.m3u8</span>
                  </div>
                  <div className="p-1.5 rounded bg-white dark:bg-[#1A1028] border border-[#E8DFF0] dark:border-[#371F59] truncate">
                    <span className="text-purple-700 dark:text-purple-400 font-bold">🔒 Secure HLS: </span>
                    <span>http://{customHost || 'localhost'}:{settings.httpPort || 8100}/live/{keyForm.allowedStreams?.split(',')[0]?.trim() !== '*' ? keyForm.allowedStreams?.split(',')[0]?.trim() : 'live_stream'}/index.m3u8?token={keyForm.playbackToken || 'token'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#371F59]">
                <button
                  type="button"
                  onClick={() => setKeyModalOpen(false)}
                  className="h-8 rounded-lg border border-[#E8DFF0] px-4 text-[11px] font-bold text-[#6F6078] hover:bg-slate-50 dark:border-[#371F59] dark:text-[#B9A5CD]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8 rounded-lg bg-violet-600 px-5 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700"
                >
                  {saving ? 'Saving...' : 'Save Stream Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PUBLISHER ACCOUNT SUB-MODAL */}
      {accountModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#E8DFF0] bg-white p-6 shadow-2xl dark:border-[#371F59] dark:bg-[#1E1130] space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#371F59]">
              <h3 className="font-display text-[16px] font-bold text-[#1B1024] dark:text-white flex items-center gap-2">
                <Users size={18} className="text-violet-600" />
                Add Publisher Account
              </h3>
              <button type="button" onClick={() => setAccountModalOpen(false)} className="text-[#6F6078] hover:text-rose-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                  Username: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={accountForm.username}
                  onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value.trim() })}
                  placeholder="e.g. news_studio_1"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                  Password: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value.trim() })}
                  placeholder="••••••••••••"
                  required
                  className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                  Allowed Target Stream Name:
                </label>
                <input
                  type="text"
                  value={accountForm.allowedStreams}
                  onChange={(e) => setAccountForm({ ...accountForm, allowedStreams: e.target.value })}
                  placeholder="* or main_feed"
                  className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8DFF0] dark:border-[#371F59]">
                <button
                  type="button"
                  onClick={() => setAccountModalOpen(false)}
                  className="h-8 rounded-lg border border-[#E8DFF0] px-4 text-[11px] font-bold text-[#6F6078] hover:bg-slate-50 dark:border-[#371F59] dark:text-[#B9A5CD]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8 rounded-lg bg-violet-600 px-5 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700"
                >
                  {saving ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        loading={confirmLoading}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
};

export default LiveServerSecurityModal;
