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
    enabled: true
  });

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

  // Toggle master security enabled/disabled
  const handleToggleSecurity = async (newEnabled: boolean) => {
    try {
      setSaving(true);
      const updated = { ...settings, enabled: newEnabled };
      const res = await api('/api/live-server/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res && res.settings) {
        setSettings(res.settings);
        toast.success(newEnabled ? 'RTMP Ingest Security ENABLED (Secure Mode)' : 'RTMP Ingest Security DISABLED (Unsecure / Open Mode)');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update security mode');
    } finally {
      setSaving(false);
    }
  };

  // Toggle single-key concurrency lock
  const handleToggleSinglePublisher = async (newVal: boolean) => {
    try {
      setSaving(true);
      const updated = { ...settings, singlePublisherPerKey: newVal };
      const res = await api('/api/live-server/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res && res.settings) {
        setSettings(res.settings);
        toast.success(newVal ? 'Single-Key concurrency enforcement enabled' : 'Multi-publisher key reuse allowed');
      }
    } catch (err: any) {
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
        body: JSON.stringify({ prefix: 'sk_live_' })
      });
      if (res && res.key) {
        setKeyForm(prev => ({ ...prev, key: res.key }));
      }
    } catch (_) {
      const fallback = `sk_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      setKeyForm(prev => ({ ...prev, key: fallback }));
    }
  };

  // Open New Key Modal
  const openNewKeyModal = async () => {
    let newKey = `sk_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    try {
      const res = await api('/api/live-server/security/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'sk_live_' })
      });
      if (res && res.key) newKey = res.key;
    } catch (_) {}

    setKeyForm({
      id: '',
      name: '',
      key: newKey,
      allowedStreams: '*',
      singlePublisherOnly: true,
      expiresAt: '',
      enabled: true
    });
    setKeyModalOpen(true);
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
  const handleDeleteKey = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete stream key "${name}"?`)) return;
    try {
      await api(`/api/live-server/security/keys/${id}`, { method: 'DELETE' });
      toast.success('Stream key deleted');
      fetchSecuritySettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete stream key');
    }
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
  const handleDeleteAccount = async (id: string, username: string) => {
    if (!window.confirm(`Are you sure you want to delete publisher account "${username}"?`)) return;
    try {
      await api(`/api/live-server/security/accounts/${id}`, { method: 'DELETE' });
      toast.success('Publisher account deleted');
      fetchSecuritySettings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    }
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
  const genHlsUrl = `http://${customHost}:8100/live/${genStreamName}/index.m3u8`;

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
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8DFF0] bg-white text-[#6F6078] hover:bg-rose-50 hover:text-rose-600 dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-rose-950/60"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Master Toggle Banner */}
        <div className="border-b border-[#E8DFF0] bg-[#F8F7FA] p-4 dark:border-[#371F59] dark:bg-[#211335]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="master-security-toggle"
                  checked={settings.enabled}
                  onChange={(e) => handleToggleSecurity(e.target.checked)}
                  disabled={saving}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 dark:bg-slate-700"></div>
              </div>
              <div>
                <label htmlFor="master-security-toggle" className="cursor-pointer text-[13px] font-bold text-[#1B1024] dark:text-white">
                  {settings.enabled ? 'Secure Ingest Mode Active' : 'Unsecure / Open Mode Active'}
                </label>
                <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {settings.enabled
                    ? 'Only authorized stream keys or publisher accounts can publish RTMP streams. Unauthorized streams are dropped immediately.'
                    : 'Any encoder can publish to this server without a key or password.'}
                </p>
              </div>
            </div>

            {/* Single Key = Single Stream Concurrency Toggle ("single key only work single") */}
            <div className="flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50/70 px-3.5 py-2 dark:bg-violet-950/40 dark:border-violet-900/60">
              <input
                type="checkbox"
                id="single-key-enforce"
                checked={settings.singlePublisherPerKey}
                onChange={(e) => handleToggleSinglePublisher(e.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="single-key-enforce" className="cursor-pointer text-[11px] font-semibold text-violet-900 dark:text-violet-200">
                <strong>Single-Key Lock (1 Key = 1 Active Stream)</strong>
                <span className="block text-[10px] text-violet-700 dark:text-violet-300 font-normal">
                  Rejects duplicate publishers using the same key simultaneously
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E8DFF0] bg-white px-6 pt-3 dark:border-[#371F59] dark:bg-[#1A1028]">
          <button
            type="button"
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-[12px] font-bold transition-all ${
              activeTab === 'keys'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'
            }`}
          >
            <Key size={14} /> Stream Keys ({settings.keys.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-[12px] font-bold transition-all ${
              activeTab === 'accounts'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'
            }`}
          >
            <Users size={14} /> Publisher Accounts ({settings.accounts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('generator')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-[12px] font-bold transition-all ${
              activeTab === 'generator'
                ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                : 'border-transparent text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'
            }`}
          >
            <Zap size={14} /> OBS &amp; Encoder Setup Generator
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[60vh]">
          
          {/* TAB 1: STREAM KEYS */}
          {activeTab === 'keys' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
                    Authorized Stream Keys
                  </h3>
                  <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Publishers pass keys via URL parameter (e.g. <code className="font-mono text-violet-700 bg-violet-50 px-1 py-0.5 rounded text-[10px] dark:bg-violet-950 dark:text-violet-300">rtmp://host:1935/live/feed?key=YOUR_KEY</code>)
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
                  <p className="mt-2 text-[13px] font-bold text-[#1B1024] dark:text-white">No stream keys generated</p>
                  <p className="mt-1 text-[11px] text-[#6F6078] dark:text-[#B9A5CD] max-w-md mx-auto">
                    Generate secure stream keys for your OBS studios, OB vans, or mobile encoders to control who can broadcast.
                  </p>
                  <button
                    type="button"
                    onClick={openNewKeyModal}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-violet-700"
                  >
                    <Plus size={13} /> Generate First Key
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#E8DFF0] bg-white shadow-xs dark:border-[#371F59] dark:bg-[#1E1130]">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]">
                        <th className="px-4 py-3">Label / Name</th>
                        <th className="px-4 py-3">Secret Key</th>
                        <th className="px-4 py-3">Target Stream</th>
                        <th className="px-4 py-3">Concurrency</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#371F59]">
                      {settings.keys.map((k) => {
                        const isRevealed = !!revealedKeys[k.id];
                        const isLive = activeLocks.keys.some(l => l.keyId === k.id || l.keyPrefix?.startsWith(k.key.slice(0, 8)));

                        return (
                          <tr key={k.id} className="transition-colors hover:bg-[#F4EEFF]/40 dark:hover:bg-[#281640]/40">
                            <td className="px-4 py-3 font-bold text-[#1B1024] dark:text-white">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px]">{k.name}</span>
                                {isLive && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse">
                                    ● LIVE PUBLISHING
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                                Created {new Date(k.createdAt || Date.now()).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-[#F8F7FA] px-2 py-1 border border-[#E8DFF0] text-violet-700 dark:bg-[#2A1745] dark:border-[#422268] dark:text-violet-300 max-w-[180px] truncate">
                                  {isRevealed ? k.key : `${k.key.slice(0, 8)}••••••••••••`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRevealedKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                                  className="p-1 text-[#6F6078] hover:text-violet-600 dark:text-[#B9A5CD] dark:hover:text-violet-300"
                                  title={isRevealed ? 'Hide secret key' : 'Show secret key'}
                                >
                                  {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(k.key, 'Stream key')}
                                  className="p-1 text-[#6F6078] hover:text-violet-600 dark:text-[#B9A5CD] dark:hover:text-violet-300"
                                  title="Copy key string"
                                >
                                  <Copy size={13} />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800 dark:text-slate-200">
                                {k.allowedStreams?.join(', ') || '* (Any)'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {k.singlePublisherOnly !== false ? (
                                <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                                  1 Session Max
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  Multi-Use
                                </span>
                              )}
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
                                onClick={() => {
                                  setSelectedKeyId(k.id);
                                  setActiveTab('generator');
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-[#F4EEFF] dark:bg-[#25173B] dark:border-[#371F59] dark:text-violet-300"
                                title="Get OBS setup codes"
                              >
                                <Zap size={11} /> Setup
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteKey(k.id, k.name)}
                                className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-rose-50 hover:text-rose-600 dark:bg-[#25173B] dark:border-[#371F59] dark:text-[#B9A5CD]"
                                title="Delete stream key"
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
                    For hardware encoders or software connecting with basic credentials (e.g. <code className="font-mono text-violet-700 bg-violet-50 px-1 py-0.5 rounded text-[10px] dark:bg-violet-950 dark:text-violet-300">rtmp://user:pass@host:1935/live/feed</code>)
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
                            {a.allowedStreams?.join(', ') || '* (Any)'}
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
                              title="Delete account"
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
                  <Zap size={16} /> Instant Encoder Configuration Helper
                </div>
                <p className="mt-1 text-[11px] text-violet-800 dark:text-violet-300">
                  Select a stream key and configure your encoder (OBS Studio, vMix, Wirecast, or FFmpeg) with pre-authenticated URLs.
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
                      <option key={k.id} value={k.id}>{k.name} ({k.key.slice(0, 10)}...)</option>
                    ))}
                    {settings.keys.length === 0 && <option value="">No keys generated</option>}
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
                    placeholder="live_feed"
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
                    placeholder="localhost"
                    className="mt-1 h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-2.5 font-mono text-[12px] text-[#1B1024] dark:bg-[#25173B] dark:border-[#371F59] dark:text-white"
                  />
                </div>
              </div>

              {/* Ready Setup Strings */}
              <div className="space-y-3 pt-2">
                {/* 1. OBS Studio */}
                <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-2 dark:border-[#371F59] dark:bg-[#25173B]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      🎥 OBS Studio / Streamlabs Setup:
                    </span>
                    <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">Settings &gt; Stream &gt; Custom</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase">Server</label>
                      <div className="flex items-center justify-between rounded-lg border border-[#E8DFF0] bg-white px-2.5 py-1.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#1A1028] dark:border-[#371F59] dark:text-white">
                        <span className="truncate">{genServerUrl}</span>
                        <button type="button" onClick={() => copyToClipboard(genServerUrl, 'Server URL')} className="ml-2 text-violet-600 hover:text-violet-800">
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD] uppercase">Stream Key</label>
                      <div className="flex items-center justify-between rounded-lg border border-[#E8DFF0] bg-white px-2.5 py-1.5 font-mono text-[11px] text-violet-700 dark:bg-[#1A1028] dark:border-[#371F59] dark:text-violet-300">
                        <span className="truncate">{genStreamKeyOBS}</span>
                        <button type="button" onClick={() => copyToClipboard(genStreamKeyOBS, 'Stream Key')} className="ml-2 text-violet-600 hover:text-violet-800">
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Full URL (vMix, Wirecast, Teradek) */}
                <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-1.5 dark:border-[#371F59] dark:bg-[#25173B]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      📡 Full RTMP Destination URL (vMix / Wirecast / Teradek / Haivision):
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(genFullUrlKey, 'Full RTMP URL')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700"
                    >
                      <Copy size={12} /> Copy Full URL
                    </button>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-white p-2 font-mono text-[11px] text-[#1B1024] break-all dark:bg-[#1A1028] dark:border-[#371F59] dark:text-white">
                    {genFullUrlKey}
                  </div>
                </div>

                {/* 3. FFmpeg Command */}
                <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-1.5 dark:border-[#371F59] dark:bg-[#25173B]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                      <Terminal size={13} /> FFmpeg Ingest Command:
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(genFfmpegCmd, 'FFmpeg command')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700"
                    >
                      <Copy size={12} /> Copy Command
                    </button>
                  </div>
                  <div className="rounded-lg border border-[#E8DFF0] bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 break-all">
                    {genFfmpegCmd}
                  </div>
                </div>

                {/* 4. Live HLS Playback URL */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-1.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      📺 Live HLS Playback / Multi-Viewer URL:
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(genHlsUrl, 'HLS URL')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                    >
                      <Copy size={12} /> Copy HLS URL
                    </button>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-white p-2 font-mono text-[11px] text-emerald-900 break-all dark:bg-[#1A1028] dark:border-emerald-800 dark:text-emerald-200">
                    {genHlsUrl}
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

      {/* CREATE STREAM KEY SUB-MODAL */}
      {keyModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#E8DFF0] bg-white p-6 shadow-2xl dark:border-[#371F59] dark:bg-[#1E1130] space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#371F59]">
              <h3 className="font-display text-[16px] font-bold text-[#1B1024] dark:text-white flex items-center gap-2">
                <Key size={18} className="text-violet-600" />
                {keyForm.id ? 'Edit Stream Key' : 'Generate New Stream Key'}
              </h3>
              <button type="button" onClick={() => setKeyModalOpen(false)} className="text-[#6F6078] hover:text-rose-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveKey} className="space-y-3.5">
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

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-[#1B1024] dark:text-white">
                    Secret Stream Key String: <span className="text-rose-500">*</span>
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

              <div className="flex items-center gap-2 pt-1">
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

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8DFF0] dark:border-[#371F59]">
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
    </div>
  );
};

export default LiveServerSecurityModal;
