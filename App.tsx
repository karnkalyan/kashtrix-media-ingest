import React, { useEffect, useState, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  FiActivity, FiKey, FiList, FiSettings, FiUser, FiUsers, FiCheckCircle,
  FiMonitor, FiLogOut, FiMenu, FiX, FiSearch, FiChevronDown, FiChevronLeft, FiChevronRight,
  FiArchive, FiBarChart2, FiShield, FiServer, FiMaximize, FiMinimize, FiTv, FiBell,
  FiSun, FiMoon, FiLock, FiCpu, FiHardDrive, FiTerminal, FiCopy, FiEye, FiEyeOff, FiRadio
} from 'react-icons/fi';
import { FaBroadcastTower } from 'react-icons/fa';
import ChannelDashboard from './components/JobQueue';
import SystemMonitor from './components/monitor';
import { IngestServerView } from './components/IngestServerView';
import useEngine from './hooks/useTranscoder';
import { AppSettings, LicenseInfo } from './types';
import Button from './components/ui/Button';
import Card from './components/ui/Card';
import StatusBadge from './components/ui/StatusBadge';
import ProtocolBadge from './components/ui/ProtocolBadge';
import CodeField from './components/ui/CodeField';
import Tabs from './components/ui/Tabs';
import KashtrixDashboard from './components/KashtrixDashboard';
import RecordingLibrary from './components/RecordingLibrary';
import EventsAndAlerts from './components/EventsAndAlerts';
import UserManagementView from './components/UserManagementView';

type ActiveView = 'dashboard' | 'channels' | 'live-server' | 'monitor' | 'ingest' | 'recordings' | 'events' | 'users' | 'settings' | 'license' | 'account';
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

const inputClass = 'h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-sans text-[12px] text-[#1B1024] outline-none transition-colors focus:border-[#4A1B7A] placeholder:text-[#6F6078]';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="relative flex min-h-screen font-sans text-[#1B1024]">
      <Toaster position="top-right" />
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] items-center justify-center bg-[#2B0D3A] p-12 relative overflow-hidden">
        <div className="relative z-10 max-w-md text-white">
          <KashtrixLogo size={380} variant="full" />
          <p className="mt-8 text-lg font-medium leading-relaxed opacity-90">
            Live Streaming • Transcoding • Ingest
          </p>
          <p className="mt-4 text-sm leading-relaxed opacity-70">
            Enterprise-grade IPTV management, OTT content delivery, and media infrastructure control plane.
          </p>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 xl:w-[45%] items-center justify-center bg-[#F8F7FA] p-6">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <KashtrixLogo size={200} />
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-bold font-display text-[#1B1024]">Welcome back</h2>
            <p className="mt-1 text-xs text-[#6F6078]">Sign in to KASHTRIX StreamOps operations console</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024]">Username</label>
              <input
                className={inputClass}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024]">Password</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#6F6078] hover:text-[#351147]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-9 w-full items-center justify-center rounded-md bg-[#351147] text-xs font-semibold text-white transition-colors hover:bg-[#2B0D3A]"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   SETTINGS VIEW
   ═══════════════════════════════════════════ */
const SettingsView: React.FC<{ settings: AppSettings; onSave: (settings: AppSettings) => Promise<any> }> = ({ settings, onSave }) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
      toast.success('Configuration saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-workspace page-stack space-y-4">
      <div className="flex items-center justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024]">System Settings</h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078]">Server ports, hardware acceleration defaults and network options</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A]"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024]">Network Ports & Protocols</h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">RTMP Ingest Port</label>
            <input
              type="number"
              className={inputClass}
              value={form.rtmpPort || 1935}
              onChange={e => setForm(p => ({ ...p, rtmpPort: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">HTTP Media Distribution Port</label>
            <input
              type="number"
              className={inputClass}
              value={form.mediaPort || 8080}
              onChange={e => setForm(p => ({ ...p, mediaPort: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024]">Transcoder Hardware Defaults</h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Default Video Preset</label>
            <input
              className={inputClass}
              value={form.defaultPreset || 'medium'}
              onChange={e => setForm(p => ({ ...p, defaultPreset: e.target.value }))}
            />
          </div>
        </div>
      </div>
    </div>
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
      toast.success('Account updated');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-workspace page-stack space-y-4 max-w-4xl">
      <div className="border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
        <h1 className="font-display text-[18px] font-bold text-[#1B1024]">Account Settings</h1>
        <p className="mt-0.5 text-[12px] text-[#6F6078]">Administrator profile and authentication credentials</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F4EEFF] font-display font-bold text-[#4A1B7A]">
              {username.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-[#1B1024]">{username}</p>
              <p className="text-[10px] text-[#6F6078] uppercase font-bold">StreamOps Administrator</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs lg:col-span-2">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024]">Login Credentials</h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Username</label>
            <input className={inputClass} value={nextUsername} onChange={e => setNextUsername(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Current Password</label>
            <input className={inputClass} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">New Password</label>
            <input className={inputClass} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep unchanged" />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !currentPassword}
            className="flex h-8 items-center justify-center rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Credentials'}
          </button>
        </div>
      </div>
    </div>
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
  const [generator, setGenerator] = useState({ adminEmail: 'karnkalyan@gmail.com', adminPassword: '', customerName: '', customerEmail: '', days: 365, hardwareId: license.systemHwid || '', features: LICENSE_MODULE_OPTIONS.map(m => m.id) as string[] });
  const [loading, setLoading] = useState(false);
  const [licensesList, setLicensesList] = useState<any[]>([]);

  const canShowGenerator = username === 'karnkalyan@gmail.com';

  useEffect(() => {
    if (canShowGenerator) {
      fetchLicenses().then(setLicensesList).catch(() => {});
    }
  }, [canShowGenerator, fetchLicenses]);

  const activate = async () => {
    setLoading(true);
    try {
      await onActivate(key.trim());
      toast.success('License activated');
      setKey('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (!generator.features.length) return toast.error('Select at least one licensed module.');
    if (!generator.hardwareId.trim()) return toast.error('Enter system HWID.');
    setLoading(true);
    try {
      const result = await onGenerate(generator);
      setGenerated(result.licenseKey);
      toast.success('License generated');
      const updated = await fetchLicenses();
      setLicensesList(updated);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="license-workspace page-stack space-y-4">
      <div className="border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
        <h1 className="font-display text-[18px] font-bold text-[#1B1024]">License Administration</h1>
        <p className="mt-0.5 text-[12px] text-[#6F6078]">HWID hardware binding, JWT token status and module entitlements</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs">
          <h2 className="font-display text-[15px] font-bold text-[#1B1024]">License Status</h2>

          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 text-[12px]">
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078]">Status</span>
              <p className="font-bold text-[#1B1024]">{license.status}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078]">Customer</span>
              <p className="font-bold text-[#1B1024]">{license.customerName || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078]">Expires</span>
              <p className="font-mono text-[#6F6078]">
                {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078]">Binding</span>
              <p className="font-bold text-[#16A36A]">{license.hardwareBound ? 'HWID Bound' : 'Global'}</p>
            </div>
          </div>

          <CodeField value={license.systemHwid || ''} label="System HWID (Hardware Identifier)" />

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase text-[#6F6078]">Enabled Modules</span>
            <div className="flex flex-wrap gap-1.5">
              {LICENSE_MODULE_OPTIONS.filter(m => hasLicenseModule(license, m.id)).map(m => (
                <span key={m.id} className="rounded border border-[#D8C6E8] bg-[#F4EEFF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#4A1B7A]">
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {license.status !== 'activated' && (
            <div className="pt-2">
              <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">Activate JWT License Token</label>
              <textarea
                className={`${inputClass} h-24 resize-none font-mono text-[11px]`}
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="Paste JWT license token here..."
              />
              <button
                type="button"
                onClick={activate}
                disabled={loading || !key.trim()}
                className="mt-2 flex h-8 items-center justify-center rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A]"
              >
                {loading ? 'Activating...' : 'Activate License'}
              </button>
            </div>
          )}
        </div>

        {canShowGenerator && (
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs">
            <h2 className="font-display text-[15px] font-bold text-[#1B1024]">License Generator</h2>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <input className={inputClass} value={generator.customerName} onChange={e => setGenerator(p => ({ ...p, customerName: e.target.value }))} placeholder="Customer Name" />
              <input className={inputClass} value={generator.customerEmail} onChange={e => setGenerator(p => ({ ...p, customerEmail: e.target.value }))} placeholder="Customer Email" />
              <input className={inputClass} type="number" value={generator.days} onChange={e => setGenerator(p => ({ ...p, days: Number(e.target.value) || 365 }))} placeholder="Valid Days" />
              <input className={`${inputClass} font-mono`} value={generator.hardwareId} onChange={e => setGenerator(p => ({ ...p, hardwareId: e.target.value.toUpperCase() }))} placeholder="HWID" />
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="flex h-8 items-center justify-center rounded-lg bg-[#6D32D9] px-4 text-[12px] font-semibold text-white hover:bg-[#4A1B7A]"
            >
              Generate License
            </button>
            {generated && <CodeField value={generated} label="Generated JWT License Token" />}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   EXPIRED SCREEN
   ═══════════════════════════════════════════ */
const ExpiredScreen: React.FC<{ license: LicenseInfo; username?: string; onActivate: (key: string) => Promise<any>; onGenerate: any; onLogout: () => void }> = ({ license, onLogout }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#F8F7FA] p-4 text-[#1B1024]">
    <div className="w-full max-w-md rounded-xl border border-[#E8DFF0] bg-white p-6 shadow-lg text-center space-y-3">
      <h1 className="font-display text-[18px] font-bold text-[#DC3545]">License Expired or Invalid</h1>
      <p className="text-[12px] text-[#6F6078]">The operations console requires an active license token.</p>
      <CodeField value={license.systemHwid || ''} label="System HWID" />
      <button onClick={onLogout} className="text-[12px] font-semibold text-[#6D32D9] hover:underline">
        Sign Out
      </button>
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
  group: string;
  badge?: string;
  badgeColor?: string;
  licenseModule?: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2, group: 'Operations' },
  { id: 'channels', label: 'Channels', icon: FiTv, group: 'Operations', licenseModule: 'live-tv' },
  { id: 'ingest', label: 'Ingest Server', icon: FaBroadcastTower, group: 'Operations', badge: 'REC', badgeColor: 'bg-[#E11D72]', licenseModule: 'ingest-server' },
  { id: 'live-server', label: 'Live Server', icon: FiServer, group: 'Operations', badge: 'LIVE', badgeColor: 'bg-[#16A36A]', licenseModule: 'live-server' },
  { id: 'recordings', label: 'Recording Library', icon: FiArchive, group: 'Media', licenseModule: 'recording-library' },
  { id: 'monitor', label: 'System Monitor', icon: FiActivity, group: 'Observability', licenseModule: 'system-monitor' },
  { id: 'events', label: 'Events & Alerts', icon: FiBell, group: 'Observability' },
  { id: 'users', label: 'User Management', icon: FiUsers, group: 'System' },
  { id: 'settings', label: 'Settings', icon: FiSettings, group: 'System' },
  { id: 'license', label: 'License', icon: FiKey, group: 'System' },
  { id: 'account', label: 'Account', icon: FiUser, group: 'System' },
];

/* ═══════════════════════════════════════════
   SIDEBAR COMPONENT (REBUILT FROM SCRATCH)
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
  const visibleItems = useMemo(() => {
    return navItems.filter(item => username === 'karnkalyan@gmail.com' || hasLicenseModule(license, item.licenseModule));
  }, [license, username]);

  const groups = useMemo(() => {
    const list: { name: string; items: NavItem[] }[] = [];
    visibleItems.forEach(item => {
      let g = list.find(x => x.name === item.group);
      if (!g) {
        g = { name: item.group, items: [] };
        list.push(g);
      }
      g.items.push(item);
    });
    return list;
  }, [visibleItems]);

  return (
    <>
      {mobileOpen && <div className="drawer-overlay lg:hidden" onClick={onMobileClose} />}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-[#E8DFF0] bg-white transition-all duration-200 shadow-xs ${
          mobileOpen ? 'w-[224px] translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed && !mobileOpen ? 'lg:w-[64px]' : 'lg:w-[224px]'}`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#E8DFF0] px-3.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <KashtrixLogo size={collapsed && !mobileOpen ? 32 : 148} variant={collapsed && !mobileOpen ? 'icon' : 'wordmark'} />
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="hidden lg:grid h-7 w-7 place-items-center rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#351147]"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <FiChevronRight size={14} /> : <FiChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation Items Grouped */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3 scrollbar-hide">
          {groups.map(group => (
            <div key={group.name} className="space-y-0.5">
              {(!collapsed || mobileOpen) && (
                <div className="px-2.5 pb-1 pt-1 text-[9px] font-bold uppercase tracking-wider text-[#6F6078]">
                  {group.name}
                </div>
              )}
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveView(item.id); onMobileClose(); }}
                    className={`group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-[#F4EEFF] text-[#2B0D3A] font-semibold border-l-[3px] border-[#6D32D9]'
                        : 'text-[#6F6078] hover:bg-[#F8F7FA] hover:text-[#1B1024]'
                    } ${collapsed && !mobileOpen ? 'justify-center px-0' : ''}`}
                    title={collapsed && !mobileOpen ? item.label : undefined}
                  >
                    <Icon size={16} className={`shrink-0 transition-colors ${isActive ? 'text-[#6D32D9]' : 'text-[#6F6078] group-hover:text-[#1B1024]'}`} />
                    
                    {(!collapsed || mobileOpen) && (
                      <div className="flex flex-1 items-center justify-between overflow-hidden">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white ${item.badgeColor || 'bg-[#6D32D9]'}`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer License Status */}
        {(!collapsed || mobileOpen) ? (
          <div className="border-t border-[#E8DFF0] p-3">
            <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 text-[11px]">
              <div className="flex items-center gap-2 font-semibold text-[#1B1024]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A36A] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16A36A]" />
                </span>
                <span className="truncate">{licenseStatus === 'activated' ? 'Pro License Active' : 'License Active'}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-[#6F6078] truncate">
                {customerName || 'KASHTRIX Media Engine'}
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#E8DFF0] p-2 text-center">
            <div className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-[#F8F7FA] text-[#16A36A]" title="License Active">
              <FiShield size={16} />
            </div>
          </div>
        )}
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const viewLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    channels: 'Channels',
    monitor: 'System Monitor',
    ingest: 'Ingest Server',
    recordings: 'Recording Library',
    'live-server': 'Live Server',
    events: 'Events & Alerts',
    users: 'User Management',
    settings: 'Settings',
    license: 'License',
    account: 'Account',
  };

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center justify-between border-b border-[#E8DFF0] bg-white px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="flex h-8 w-8 items-center justify-center rounded text-[#6F6078] hover:bg-[#F8F7FA] lg:hidden"
        >
          <FiMenu size={18} />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded text-[#6F6078] hover:bg-[#F8F7FA]"
        >
          <FiMenu size={18} />
        </button>
        <div>
          <h2 className="font-display text-[15px] font-bold text-[#1B1024]">{viewLabels[activeView] || activeView}</h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <input
            type="text"
            placeholder="Search operations..."
            className="h-8 w-52 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[11px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
          />
          <FiSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
        </div>

        {/* Theme Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            const nextMode = themeMode === 'dark' ? 'light' : 'dark';
            onThemeChange(nextMode);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#4A1B7A]"
          title={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {themeMode === 'dark' ? <FiSun size={15} className="text-[#D97706]" /> : <FiMoon size={15} className="text-[#4A1B7A]" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-[#F8F7FA]"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F4EEFF] text-[12px] font-bold text-[#4A1B7A]">
              {username?.charAt(0).toUpperCase() || 'U'}
            </span>
            <span className="hidden text-[12px] font-semibold text-[#1B1024] sm:block">{username || 'Admin'}</span>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-lg border border-[#E8DFF0] bg-white p-1 shadow-lg">
                <button
                  onClick={() => { onLogout(); setUserMenuOpen(false); }}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[12px] font-semibold text-[#DC3545] hover:bg-[#FEF2F2]"
                >
                  <FiLogOut size={14} /> Sign Out
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('kashtrix-theme') as ThemeMode) || 'light');

  useEffect(() => {
    localStorage.setItem('kashtrix-theme', themeMode);
    const root = document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else if (themeMode === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
      else root.classList.remove('dark');
    }
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
    <div className="kashtrix-app flex min-h-screen bg-[#F8F7FA] font-sans text-[#1B1024]">
      <Toaster position="top-right" />

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

      <div className={`flex min-h-screen flex-1 flex-col transition-all duration-200 ${sidebarCollapsed ? 'lg:ml-[64px]' : 'lg:ml-[224px]'}`}>
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

        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          {activeView === 'dashboard' && <KashtrixDashboard onNavigate={view => setActiveView(view as ActiveView)} mediaPort={engine.state.settings.mediaPort} />}
          {activeView === 'channels' && (
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
              addChannel={engine.addChannel}
              getTsPrograms={engine.getTsPrograms}
              fetchIngestStreams={engine.fetchIngestStreams}
              settings={engine.state.settings}
              licenseStatus={engine.auth.license.status}
            />
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
          {activeView === 'events' && <EventsAndAlerts />}
          {activeView === 'users' && <UserManagementView currentUser={engine.auth.user?.username} />}
          {activeView === 'settings' && <SettingsView settings={engine.state.settings} onSave={engine.updateSettings} />}
          {activeView === 'license' && <LicenseView status={engine.auth.license.status} license={engine.auth.license} username={engine.auth.user?.username} onActivate={engine.activateLicense} onGenerate={engine.generateLicense} fetchLicenses={engine.fetchLicenses} suspendLicense={engine.suspendLicense} resumeLicense={engine.resumeLicense} resetLicense={engine.resetLicense} />}
          {activeView === 'account' && <AccountView username={engine.auth.user?.username} onSave={engine.changeAccount} />}
        </main>
      </div>
    </div>
  );
};

export default App;
