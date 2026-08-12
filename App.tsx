import React, { useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  FiActivity, FiKey, FiList, FiSettings, FiUser, FiCheckCircle,
  FiMonitor, FiLogOut, FiMenu, FiX, FiSearch, FiChevronDown,
  FiArchive, FiBarChart2, FiShield, FiServer, FiMaximize, FiMinimize, FiTv, FiBell,
  FiSun, FiMoon,
} from 'react-icons/fi';
import { FaBroadcastTower } from 'react-icons/fa';
import Configurator from './components/Configurator';
import ChannelDashboard from './components/JobQueue';
import SystemMonitor from './components/monitor';
import { IngestServerView } from './components/IngestServerView';
import useEngine from './hooks/useTranscoder';
import { AppSettings, LicenseInfo } from './types';
import Button from './components/ui/Button';
import Card from './components/ui/Card';
import StatusBadge from './components/ui/StatusBadge';
import KashtrixDashboard from './components/KashtrixDashboard';
import RecordingLibrary from './components/RecordingLibrary';

type ActiveView = 'dashboard' | 'channels' | 'live-server' | 'monitor' | 'ingest' | 'recordings' | 'settings' | 'license' | 'account';
type ThemeMode = 'light' | 'dark' | 'system';

const LICENSE_MODULE_OPTIONS = [
  { id: 'live-tv', label: 'Live TV & Channels', description: 'Channel composer, transcoding profiles and playout control.' },
  { id: 'live-server', label: 'Live Server', description: 'Incoming RTMP/SRT streams, history, relays and live monitoring.' },
  { id: 'ingest-server', label: 'Ingest Server', description: 'Device/stream recording controls and professional encoding.' },
  { id: 'recording-library', label: 'Recording Library', description: 'Search, preview, download and manage recording archives.' },
  { id: 'system-monitor', label: 'System Monitor', description: 'Realtime CPU, GPU, memory, disk and network telemetry.' },
] as const;
const LEGACY_LICENSE_MODULES: Record<string, string[]> = {
  'live-tv': ['streaming'], 'live-server': ['streaming'], 'ingest-server': ['streaming', 'recording'],
  'recording-library': ['recording'], 'system-monitor': ['settings'],
};
const hasLicenseModule = (license: LicenseInfo, module?: string) => {
  if (!module) return true;
  if (license.status !== 'activated') return false;
  const features = license.features || [];
  return features.includes(module) || features.includes('all-modules') || (LEGACY_LICENSE_MODULES[module] || []).some(feature => features.includes(feature));
};

/* ═══════════════════════════════════════════
   SHARED STYLES
═══════════════════════════════════════════ */
const inputClass = 'h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10 placeholder:text-[var(--text-muted)]';

/* ═══════════════════════════════════════════
   OFFICIAL KASHTRIX STREAMOPS LOGO
═══════════════════════════════════════════ */
const KashtrixLogo: React.FC<{ size?: number; variant?: 'wordmark' | 'full' | 'icon' }> = ({ size = 176, variant = 'wordmark' }) => (
  <div
    className={`brand-lockup brand-lockup--${variant} shrink-0`}
    style={{ width: size, height: variant === 'full' ? Math.round(size * 0.66) : variant === 'icon' ? size : Math.round(size * 0.22) }}
  >
    <img src="/main-logo.png" alt="KASHTRIX StreamOps" draggable={false} />
  </div>
);

/* ═══════════════════════════════════════════
   LOGIN SCREEN
═══════════════════════════════════════════ */
const LoginScreen: React.FC<{ onLogin: (username: string, password: string) => Promise<void> }> = ({ onLogin }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onLogin(username, password);
      toast.success('Welcome back!');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen font-sans text-[var(--text-primary)]">
      {/* Toast */}
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)', fontSize: '14px' } }} />

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] items-center justify-center bg-[#2B0D3A] p-12 relative overflow-hidden">
        {/* Decorative network lines */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" viewBox="0 0 800 600" fill="none">
            <circle cx="200" cy="150" r="4" fill="white" />
            <circle cx="400" cy="100" r="6" fill="white" />
            <circle cx="600" cy="200" r="4" fill="white" />
            <circle cx="300" cy="350" r="5" fill="white" />
            <circle cx="500" cy="400" r="4" fill="white" />
            <circle cx="150" cy="450" r="6" fill="white" />
            <circle cx="650" cy="350" r="5" fill="white" />
            <path d="M200 150 Q300 100 400 100" stroke="white" strokeWidth="1" />
            <path d="M400 100 Q500 100 600 200" stroke="white" strokeWidth="1" />
            <path d="M200 150 Q250 250 300 350" stroke="white" strokeWidth="1" />
            <path d="M300 350 Q400 380 500 400" stroke="white" strokeWidth="1" />
            <path d="M600 200 Q630 280 650 350" stroke="white" strokeWidth="1" />
            <path d="M150 450 Q220 400 300 350" stroke="white" strokeWidth="1" />
          </svg>
        </div>
        <div className="relative z-10 max-w-md text-white">
          <KashtrixLogo size={390} variant="full" />
          <p className="mt-8 text-lg font-medium leading-relaxed opacity-90">
            Live Streaming • Transcoding • Ingest
          </p>
          <p className="mt-4 text-sm leading-relaxed opacity-70">
            Enterprise-grade IPTV management, OTT content delivery, and middleware administration. Manage live TV, VOD, subscriptions, devices, and streaming infrastructure from a single unified platform.
          </p>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex w-full lg:w-1/2 xl:w-[45%] items-center justify-center bg-[var(--background)] p-6">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <KashtrixLogo size={210} />
          </div>

          <div className="hidden lg:block mb-10">
            <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">Welcome back</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Sign in to your admin dashboard</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Username</label>
              <input
                className={inputClass}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Password</label>
              <div className="relative">
                <input
                  className={inputClass}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full !h-12" loading={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
            KASHTRIX StreamOps — Live Streaming • Transcoding • Ingest
          </p>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   SETTINGS VIEW
═══════════════════════════════════════════ */
const SettingsView: React.FC<{ settings: AppSettings; onSave: (settings: AppSettings) => Promise<any> }> = ({ settings, onSave }) => {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const setPort = (key: keyof AppSettings, value: string) => setForm(prev => ({ ...prev, [key]: Number(value) || 0 }));
  const save = async () => {
    setSaving(true);
    try {
      const result = await onSave(form);
      toast.success(result.restartRequired ? 'Settings saved. Restart backend.' : 'Settings saved.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="max-w-4xl" padding="sm">
      <h2 className="text-xl font-bold text-[var(--text-primary)]">Application Settings</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Configure ports and server settings. Backend restart applies changes.</p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          ['rtmpPort', 'RTMP Ingest Port', 'Primary RTMP input port'],
          ['httpPort', 'HTTP Stream Port', 'DASH/HLS stream distribution port'],
          ['mediaPort', 'HLS/TS Helper Port', 'Local HLS and HTTP-TS helper server'],
          ['apiPort', 'API/WebSocket Port', 'Backend API port for frontend calls'],
        ].map(([key, label, help]) => (
          <div key={key}>
            <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">{label}</label>
            <input className={inputClass} type="number" min={1} max={65535} value={(form as any)[key]} onChange={e => setPort(key as keyof AppSettings, e.target.value)} />
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">{help}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button onClick={save} loading={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
      </div>
    </Card>
  );
};

/* ═══════════════════════════════════════════
   ACCOUNT VIEW
═══════════════════════════════════════════ */
const AccountView: React.FC<{ username?: string; onSave: (payload: { username: string; currentPassword: string; newPassword?: string }) => Promise<any> }> = ({ username = '', onSave }) => {
  const [nextUsername, setNextUsername] = useState(username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ username: nextUsername, currentPassword, newPassword: newPassword || undefined });
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Account updated.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card padding="sm"><p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Administrator</p><div className="mt-3 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary-subtle)] font-display font-bold text-[var(--primary)]">{username.charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{username}</p><p className="text-[10px] text-[var(--text-muted)]">StreamOps administrator</p></div></div></Card>
    <Card padding="sm">
      <h2 className="text-xl font-bold text-[var(--text-primary)]">Login Management</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Update the administrator username and password.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Username</label>
          <input className={inputClass} value={nextUsername} onChange={e => setNextUsername(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Current Password</label>
          <input className={inputClass} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">New Password</label>
          <input className={inputClass} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" />
        </div>
        <Button className="md:col-span-2 md:w-fit" onClick={save} loading={saving} disabled={!currentPassword}>
          {saving ? 'Updating...' : 'Update Account'}
        </Button>
      </div>
    </Card></div>
  );
};

/* ═══════════════════════════════════════════
   LICENSE VIEW
═══════════════════════════════════════════ */
const LicenseView: React.FC<{
  status: string;
  license: LicenseInfo;
  username?: string;
  onActivate: (key: string) => Promise<any>;
  onGenerate: (payload: { adminEmail: string; adminPassword: string; customerName: string; customerEmail?: string; expiresAt?: string; days?: number; features: string[]; hardwareId: string }) => Promise<any>;
  fetchLicenses: () => Promise<any[]>;
  suspendLicense: (id: number) => Promise<any>;
  resumeLicense: (id: number) => Promise<any>;
  resetLicense: () => Promise<any>;
}> = ({ status, license, username, onActivate, onGenerate, fetchLicenses, suspendLicense, resumeLicense, resetLicense }) => {
  const [key, setKey] = useState('');
  const [generated, setGenerated] = useState('');
  const [generator, setGenerator] = useState({ adminEmail: 'karnkalyan@gmail.com', adminPassword: '', customerName: '', customerEmail: '', days: 365, hardwareId: license.systemHwid || '', features: LICENSE_MODULE_OPTIONS.map(module => module.id) as string[] });
  const [loading, setLoading] = useState(false);
  const [licensesList, setLicensesList] = useState<any[]>([]);

  const canShowGenerator = username === 'karnkalyan@gmail.com';

  React.useEffect(() => {
    if (canShowGenerator) {
      fetchLicenses().then(setLicensesList).catch(() => { });
    }
  }, [canShowGenerator, fetchLicenses]);

  React.useEffect(() => {
    if (license.systemHwid) setGenerator(previous => ({ ...previous, hardwareId: previous.hardwareId || license.systemHwid || '' }));
  }, [license.systemHwid]);

  const toggleStatus = async (l: any) => {
    setLoading(true);
    try {
      if (l.status === 'active') await suspendLicense(l.id);
      else await resumeLicense(l.id);
      const updated = await fetchLicenses();
      setLicensesList(updated);
      toast.success(`License ${l.status === 'active' ? 'suspended' : 'activated'}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const activate = async () => {
    setLoading(true);
    try {
      await onActivate(key.trim());
      toast.success('License activated.');
      setKey('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (!generator.features.length) return toast.error('Select at least one licensed module.');
    if (!generator.hardwareId.trim()) return toast.error('Enter the customer system HWID.');
    setLoading(true);
    try {
      const result = await onGenerate(generator);
      setGenerated(result.licenseKey);
      toast.success('License generated.');
      const updated = await fetchLicenses();
      setLicensesList(updated);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const clearCurrentLicense = async () => {
    setLoading(true);
    try {
      await resetLicense();
      toast.success('Active license has been removed.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">License Activation</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Paste a JWT license token to activate.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Status</p><p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{license.status}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Customer</p><p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{license.customerName || 'Not activated'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Email</p><p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{license.customerEmail || '-'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Expires</p><p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{license.expiresAt ? new Date(license.expiresAt).toLocaleString() : '-'}</p></div>
        </div>
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">This system HWID</p><code className="mt-1 block break-all text-sm font-bold text-indigo-900">{license.systemHwid || 'Loading…'}</code></div><button type="button" disabled={!license.systemHwid} onClick={() => { navigator.clipboard.writeText(license.systemHwid || ''); toast.success('System HWID copied'); }} className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700">Copy HWID</button></div><p className="mt-2 text-[10px] text-indigo-600">Send this static identifier when requesting a license. It remains unchanged after restart.</p></div>
        {license.status === 'activated' && <p className={`mt-3 text-xs font-semibold ${license.hardwareBound ? 'text-emerald-600' : 'text-amber-600'}`}>{license.hardwareBound ? `Hardware-bound license: ${license.hardwareId}` : 'Legacy license: not hardware-bound. Request a new HWID license before the next activation.'}</p>}
        <div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Licensed modules</p><div className="mt-2 flex flex-wrap gap-2">{LICENSE_MODULE_OPTIONS.filter(module => hasLicenseModule(license, module.id)).map(module => <span key={module.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">{module.label}</span>)}{license.status === 'activated' && !LICENSE_MODULE_OPTIONS.some(module => hasLicenseModule(license, module.id)) && <span className="text-xs text-amber-600">No product modules enabled</span>}</div></div>

        {license.status === 'activated' ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 p-5 text-sm font-medium text-emerald-800">
              ✓ This license is active and valid. No activation required.
            </div>
            {!canShowGenerator && (
              <Button variant="danger" className="w-full" onClick={clearCurrentLicense} loading={loading}>
                {loading ? 'Working...' : 'Reset / Remove Current License'}
              </Button>
            )}
          </div>
        ) : (
          <>
            <textarea className={`${inputClass} mt-6 h-36 resize-none font-mono text-xs`} value={key} onChange={e => setKey(e.target.value)} placeholder="JWT license token" />
            <div className="mt-5 flex items-center justify-between">
              <Button onClick={activate} loading={loading} disabled={!key.trim()}>
                {loading ? 'Working...' : 'Activate License'}
              </Button>
              <StatusBadge status={status} />
            </div>
          </>
        )}
      </Card>

      {canShowGenerator && <Card>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">License Generator</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Generator admin: <span className="font-bold text-[var(--primary)]">karnkalyan@gmail.com</span></p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className={inputClass} value={generator.adminEmail} onChange={e => setGenerator(prev => ({ ...prev, adminEmail: e.target.value }))} placeholder="Generator email" />
          <input className={inputClass} type="password" value={generator.adminPassword} onChange={e => setGenerator(prev => ({ ...prev, adminPassword: e.target.value }))} placeholder="Generator password" />
          <input className={inputClass} value={generator.customerName} onChange={e => setGenerator(prev => ({ ...prev, customerName: e.target.value }))} placeholder="Customer name" />
          <input className={inputClass} value={generator.customerEmail} onChange={e => setGenerator(prev => ({ ...prev, customerEmail: e.target.value }))} placeholder="Customer email" />
          <input className={inputClass} type="number" value={generator.days} onChange={e => setGenerator(prev => ({ ...prev, days: Number(e.target.value) || 365 }))} placeholder="Valid days" />
          <input className={`${inputClass} font-mono`} value={generator.hardwareId} onChange={e => setGenerator(prev => ({ ...prev, hardwareId: e.target.value.toUpperCase() }))} placeholder="Customer system HWID" />
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Licensed modules</p><button type="button" onClick={() => setGenerator(prev => ({ ...prev, features: prev.features.length === LICENSE_MODULE_OPTIONS.length ? [] : LICENSE_MODULE_OPTIONS.map(module => module.id) }))} className="text-xs font-semibold text-[var(--primary)]">{generator.features.length === LICENSE_MODULE_OPTIONS.length ? 'Clear all' : 'Select all'}</button></div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LICENSE_MODULE_OPTIONS.map(module => <label key={module.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${generator.features.includes(module.id) ? 'border-indigo-300 bg-indigo-50' : 'border-[var(--border)] bg-white'}`}><input type="checkbox" checked={generator.features.includes(module.id)} onChange={() => setGenerator(prev => ({ ...prev, features: prev.features.includes(module.id) ? prev.features.filter(feature => feature !== module.id) : [...prev.features, module.id] }))} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-semibold text-slate-800">{module.label}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">{module.description}</span></span></label>)}
          </div>
        </div>
        <div className="mt-6">
          <Button onClick={generate} loading={loading}>Generate License</Button>
        </div>
        {generated && (
          <textarea readOnly className={`${inputClass} mt-6 h-28 resize-none font-mono text-[10px] text-[var(--text-muted)]`} value={generated} onFocus={e => e.currentTarget.select()} />
        )}

        <div className="mt-6">
          <h3 className="mb-3 text-xs font-semibold text-[var(--text-primary)]">Generated licenses</h3>
          <div className="data-panel data-table-wrap max-h-72">
            <table className="data-table min-w-[720px]"><thead><tr><th>Customer</th><th>Modules</th><th>HWID</th><th>Expires</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>
              {licensesList.map(l => <tr key={l.id}>
                <td><p className="font-semibold">{l.customer_name}</p><p className="text-[9px] text-[var(--text-muted)]">{l.customer_email || 'No email'}</p></td>
                <td>{(l.features || []).length} modules</td>
                <td><code className="block max-w-[150px] truncate text-[9px]" title={l.hardware_id}>{l.hardware_id || 'Legacy / unbound'}</code></td>
                <td>{new Date(l.expires_at).toLocaleDateString()}</td><td><StatusBadge status={l.status} /></td>
                <td><div className="flex justify-end gap-2"><button onClick={() => navigator.clipboard.writeText(l.license_key)} className="h-8 rounded-md border border-[var(--border)] px-2.5 text-[10px] font-semibold">Copy token</button><button onClick={() => toggleStatus(l)} disabled={loading} className={`h-8 rounded-md px-2.5 text-[10px] font-semibold text-white ${l.status === 'active' ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`}>{l.status === 'active' ? 'Suspend' : 'Reactivate'}</button></div></td>
              </tr>)}
              {licensesList.length === 0 && <tr><td colSpan={6}><div className="compact-empty">No licenses generated yet.</div></td></tr>}
            </tbody></table>
          </div>
        </div>
      </Card>}
    </div>
  );
};

/* ═══════════════════════════════════════════
   EXPIRED SCREEN
═══════════════════════════════════════════ */
const ExpiredScreen: React.FC<{ license: LicenseInfo; username?: string; onActivate: (key: string) => Promise<any>; onGenerate: any; onLogout: () => void }> = ({ license, username, onActivate, onGenerate, onLogout }) => (
  <div className="relative flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
    <Toaster position="top-right" />
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Card>
        <h1 className="text-2xl font-extrabold text-[var(--danger)]">{license.status === 'hardware_mismatch' ? 'License HWID Mismatch' : license.status === 'suspended' ? 'Application License Suspended' : 'Application License Expired'}</h1>
        <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">{license.status === 'hardware_mismatch' ? 'This key belongs to another system. Copy the HWID below and request a matching license.' : 'The console is disabled until a valid license is activated.'}</p>
        <button className="mt-6 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" onClick={onLogout}>Logout Session</button>
      </Card>
      <LicenseView status="expired" license={license} username={username} onActivate={onActivate} onGenerate={onGenerate} fetchLicenses={() => Promise.resolve([])} suspendLicense={() => Promise.resolve()} resumeLicense={() => Promise.resolve()} resetLicense={() => Promise.resolve()} />
    </div>
  </div>
);

/* ═══════════════════════════════════════════
   NAVIGATION ITEMS
═══════════════════════════════════════════ */
interface NavItem {
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group?: string;
  licenseModule?: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2, group: 'Operations' },
  { id: 'channels', label: 'Live TV & Channels', icon: FiTv, group: 'Operations', licenseModule: 'live-tv' },
  { id: 'ingest', label: 'Ingest Server', icon: FaBroadcastTower, group: 'Operations', licenseModule: 'ingest-server' },
  { id: 'live-server', label: 'Live Server', icon: FiServer, group: 'Operations', licenseModule: 'live-server' },
  { id: 'recordings', label: 'Recording Library', icon: FiArchive, group: 'Media', licenseModule: 'recording-library' },
  { id: 'monitor', label: 'System Monitor', icon: FiActivity, group: 'Observability', licenseModule: 'system-monitor' },
  { id: 'settings', label: 'Settings', icon: FiSettings, group: 'System' },
  { id: 'license', label: 'License', icon: FiKey, group: 'System' },
  { id: 'account', label: 'Account', icon: FiUser, group: 'System' },
];

/* ═══════════════════════════════════════════
   SIDEBAR COMPONENT
═══════════════════════════════════════════ */
const Sidebar: React.FC<{
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  collapsed: boolean;
  onToggle: () => void;
  licenseStatus: string;
  customerName?: string;
  license: LicenseInfo;
  username?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}> = ({ activeView, setActiveView, collapsed, onToggle, licenseStatus, customerName, license, username, mobileOpen, onMobileClose }) => {
  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeView === item.id;
    return (
      <button
        key={item.id}
        onClick={() => { setActiveView(item.id); onMobileClose(); }}
        className={`group relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] font-medium transition-colors duration-150 ${
          isActive
            ? 'bg-[var(--primary-subtle)] text-[var(--primary)] before:absolute before:-left-2 before:h-5 before:w-[3px] before:rounded-r before:bg-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
        } ${collapsed && !mobileOpen ? 'justify-center px-0' : ''}`}
        title={collapsed && !mobileOpen ? item.label : undefined}
      >
        <Icon size={16} className={`shrink-0 ${isActive ? 'text-[var(--operational-purple)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'}`} />
        {(!collapsed || mobileOpen) && <span>{item.label}</span>}
      </button>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className={`flex flex-col ${collapsed && !mobileOpen ? 'items-center' : 'items-start'}`}>
          <KashtrixLogo size={collapsed && !mobileOpen ? 36 : 154} variant={collapsed && !mobileOpen ? 'icon' : 'wordmark'} />
          {(!collapsed || mobileOpen) && <p className="mt-1 text-[9px] font-medium tracking-wide text-[var(--text-muted)]">Streaming · Transcoding · Ingest</p>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-hide">
        {navItems.filter(item => username === 'karnkalyan@gmail.com' || hasLicenseModule(license, item.licenseModule)).map((item, index, visibleItems) => (
          <React.Fragment key={item.id}>
            {(!collapsed || mobileOpen) && (index === 0 || visibleItems[index - 1]?.group !== item.group) && <p className={`${index ? 'mt-3 border-t border-[var(--border)] pt-3' : 'pt-1'} px-2.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]`}>{item.group}</p>}
            {renderNavItem(item)}
          </React.Fragment>
        ))}

      </nav>

      {/* Bottom status card */}
      {(!collapsed || mobileOpen) && (
        <div className="border-t border-[var(--border)] p-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-2.5">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-[var(--text-primary)]">
              <FiShield className="text-[var(--primary)]" size={14} />
              {licenseStatus === 'activated' ? 'Pro License Active' : 'License status'}
            </div>
            {customerName && (
              <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">{customerName}</p>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${licenseStatus === 'activated' ? 'bg-emerald-500' : licenseStatus === 'expired' ? 'bg-red-500' : 'bg-amber-500'}`} />
              <span className="text-[9px] font-medium text-[var(--text-muted)]">
                {licenseStatus === 'activated' ? 'All Systems Operational' : licenseStatus === 'expired' ? 'License Required' : 'Limited Features'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && <div className="drawer-overlay lg:hidden" onClick={onMobileClose} />}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 ${
          mobileOpen ? 'w-[224px] translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed && !mobileOpen ? 'lg:w-[64px]' : 'lg:w-[224px]'}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

/* ═══════════════════════════════════════════
   TOP HEADER
═══════════════════════════════════════════ */
const TopHeader: React.FC<{
  activeView: ActiveView;
  username?: string;
  saveStatus: string;
  onLogout: () => void;
  onMobileMenuOpen: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}> = ({ activeView, username, saveStatus, onLogout, onMobileMenuOpen, sidebarCollapsed, onToggleSidebar, themeMode, onThemeChange }) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const viewLabels: Record<string, string> = {
    dashboard: 'Operations Dashboard',
    channels: 'Channels',
    monitor: 'System Monitor',
    ingest: 'Ingest Server',
    recordings: 'Recording Library',
    'live-server': 'Live Server',
    settings: 'Settings',
    license: 'License',
    account: 'Account',
  };
  const viewDescriptions: Record<string, string> = {
    dashboard: 'Realtime television operations overview',
    channels: 'Live TV channel composition and transcoding',
    monitor: 'Infrastructure health and performance telemetry',
    ingest: 'Television Recording Control & Live Ingest Management',
    recordings: 'Search, preview and manage recorded media',
    'live-server': 'Incoming stream monitoring and distribution',
    settings: 'Network ports and platform configuration',
    license: 'HWID-bound feature access management',
    account: 'Administrator profile and security',
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-[58px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-5">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] lg:hidden"
          aria-label="Open menu"
        >
          <FiMenu size={20} />
        </button>

        {/* Collapse sidebar button (desktop) */}
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] transition-colors"
          aria-label="Toggle sidebar"
        >
          <FiMenu size={18} />
        </button>

        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{viewLabels[activeView] || activeView}</h2>
          <p className="hidden text-[10px] text-[var(--text-muted)] sm:block">
            {viewDescriptions[activeView] || 'Manage configurations'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <label className="relative hidden xl:block">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input aria-label="Search" placeholder="Search anything..." className="h-9 w-52 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] pl-9 pr-3 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
        </label>
        <button className="relative hidden h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 sm:flex" aria-label="Notifications"><FiBell size={17} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-pink-500 ring-2 ring-white" /></button>
        <button
          onClick={() => onThemeChange(themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light')}
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
          aria-label={`Theme: ${themeMode}. Change theme`}
          title={`Theme: ${themeMode}`}
        >
          {themeMode === 'dark' ? <FiMoon size={16} /> : <FiSun size={16} />}
        </button>
        {/* Sync status */}
        {saveStatus === 'saving' && (
          <span className="hidden sm:flex items-center gap-2 text-xs font-bold text-[var(--primary)] animate-pulse">
            <span className="h-2 w-2 rounded-full bg-[var(--primary)]" /> Syncing...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="hidden sm:flex items-center gap-2 text-xs font-bold text-emerald-600">
            <FiCheckCircle size={14} /> Synced
          </span>
        )}

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="hidden sm:flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] transition-colors"
          aria-label="Toggle fullscreen"
        >
          {fullscreen ? <FiMinimize size={16} /> : <FiMaximize size={16} />}
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 transition-all hover:bg-slate-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-subtle)] text-sm font-bold text-[var(--primary)]">
              {username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="hidden text-sm font-semibold text-[var(--text-primary)] sm:block">{username || 'User'}</span>
            <span className="hidden text-[var(--text-muted)] sm:block"><FiChevronDown size={14} /></span>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-[var(--shadow-lg)] animate-[scale-in_0.15s_ease-out]">
                <div className="px-4 py-2 border-b border-[var(--border)] mb-1.5">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{username}</p>
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Administrator</p>
                </div>
                <button
                  onClick={() => { onLogout(); setUserMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <FiLogOut size={15} /> Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

/* ═══════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════ */
const App: React.FC = () => {
  const engine = useEngine();
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('kashtrix-theme') as ThemeMode) || 'system');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    localStorage.setItem('kashtrix-theme', themeMode);
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [themeMode]);

  useEffect(() => {
    const item = navItems.find(navItem => navItem.id === activeView);
    const isGeneratorAdmin = engine.auth.user?.username === 'karnkalyan@gmail.com';
    if (item?.licenseModule && !isGeneratorAdmin && !hasLicenseModule(engine.auth.license, item.licenseModule)) setActiveView('dashboard');
  }, [activeView, engine.auth.license, engine.auth.user?.username]);

  if (!engine.auth.token) return <LoginScreen onLogin={engine.login} />;

  if (engine.auth.license.status === 'expired' || engine.auth.license.status === 'suspended' || engine.auth.license.status === 'hardware_mismatch') {
    return <ExpiredScreen license={engine.auth.license} username={engine.auth.user?.username} onActivate={engine.activateLicense} onGenerate={engine.generateLicense} onLogout={engine.logout} />;
  }

  return (
    <div className="kashtrix-app flex min-h-screen bg-[var(--background)] font-sans text-[var(--text-primary)]">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border)',
            fontSize: '14px',
            fontWeight: '500',
          },
        }}
      />

      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        licenseStatus={engine.auth.license.status}
        customerName={engine.auth.license.customerName}
        license={engine.auth.license}
        username={engine.auth.user?.username}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content */}
      <div className={`flex min-h-screen flex-1 flex-col transition-all duration-200 ${sidebarCollapsed ? 'lg:ml-[64px]' : 'lg:ml-[224px]'}`}>
        {/* Header */}
        <TopHeader
          activeView={activeView}
          username={engine.auth.user?.username}
          saveStatus={engine.saveStatus}
          onLogout={engine.logout}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          themeMode={themeMode}
          onThemeChange={setThemeMode}
        />

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 scrollbar-hide">
          {activeView === 'dashboard' && <KashtrixDashboard onNavigate={view => setActiveView(view as ActiveView)} mediaPort={engine.state.settings.mediaPort} />}
          {activeView === 'channels' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <Configurator
                profiles={engine.state.profiles}
                settings={engine.state.settings}
                licenseStatus={engine.auth.license.status}
                addChannel={engine.addChannel}
                getTsPrograms={engine.getTsPrograms}
                fetchIngestStreams={engine.fetchIngestStreams}
                profileId={engine.state.profiles[0]?.id || ''}
                setProfileId={() => {}}
              />
              <ChannelDashboard
                channels={engine.state.channels}
                profiles={engine.state.profiles}
                username={engine.auth.user?.username}
                startChannel={engine.startChannel}
                stopChannel={engine.stopChannel}
                removeChannel={engine.removeChannel}
                clearChannels={engine.clearChannels}
                startAllChannels={engine.startAllChannels}
                stopAllChannels={engine.stopAllChannels}
                addProfile={engine.addProfile}
                updateProfile={engine.updateProfile}
                removeProfile={engine.removeProfile}
              />
            </div>
          )}
          {activeView === 'monitor' && <SystemMonitor />}
          {activeView === 'ingest' && (
            <IngestServerView
              fetchIngestStreams={engine.fetchIngestStreams}
              fetchIngestHistory={engine.fetchIngestHistory}
              fetchRecordings={engine.fetchRecordings}
              startRecording={engine.startRecording}
              stopRecording={engine.stopRecording}
              deleteRecording={engine.deleteRecording}
              settings={engine.state.settings}
              ingestStreams={engine.ingestStreams}
              ingestHistory={engine.ingestHistory}
              recordings={engine.recordings}
              profiles={engine.state.profiles}
              mode="recording"
            />
          )}
          {activeView === 'live-server' && (
            <IngestServerView
              fetchIngestStreams={engine.fetchIngestStreams}
              fetchIngestHistory={engine.fetchIngestHistory}
              fetchRecordings={engine.fetchRecordings}
              startRecording={engine.startRecording}
              stopRecording={engine.stopRecording}
              deleteRecording={engine.deleteRecording}
              settings={engine.state.settings}
              ingestStreams={engine.ingestStreams}
              ingestHistory={engine.ingestHistory}
              recordings={engine.recordings}
              profiles={engine.state.profiles}
              mode="live"
            />
          )}
          {activeView === 'recordings' && <RecordingLibrary realtimeRecordings={engine.recordings} settings={engine.state.settings} deleteRecording={engine.deleteRecording} />}
          {activeView === 'settings' && <SettingsView settings={engine.state.settings} onSave={engine.updateSettings} />}
          {activeView === 'license' && <LicenseView status={engine.auth.license.status} license={engine.auth.license} username={engine.auth.user?.username} onActivate={engine.activateLicense} onGenerate={engine.generateLicense} fetchLicenses={engine.fetchLicenses} suspendLicense={engine.suspendLicense} resumeLicense={engine.resumeLicense} resetLicense={engine.resetLicense} />}
          {activeView === 'account' && <AccountView username={engine.auth.user?.username} onSave={engine.changeAccount} />}

        </main>
      </div>
    </div>
  );
};

export default App;
