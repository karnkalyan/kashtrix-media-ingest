import React, { useEffect, useState, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  FiActivity, FiKey, FiList, FiSettings, FiUser, FiUsers, FiCheckCircle,
  FiMonitor, FiLogOut, FiMenu, FiX, FiSearch, FiChevronDown, FiChevronLeft, FiChevronRight,
  FiArchive, FiBarChart2, FiShield, FiServer, FiMaximize, FiMinimize, FiTv, FiBell,
  FiSun, FiMoon, FiLock, FiCpu, FiHardDrive, FiTerminal, FiCopy, FiEye, FiEyeOff, FiRadio, FiAward,
  FiLogIn, FiZap, FiLayers
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
  if (!license || license.status !== 'activated') return true;
  const features = license.features || [];
  return features.includes(module) || features.includes('all-modules') || (LEGACY_LICENSE_MODULES[module] || []).some(feature => features.includes(feature));
};

const inputClass = 'h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-sans text-[12px] text-[#1B1024] outline-none transition-colors focus:border-[#4A1B7A] placeholder:text-[#6F6078]';

/* ═══════════════════════════════════════════
   OFFICIAL KASHTRIX STREAMOPS LOGO
   ═══════════════════════════════════════════ */
const KashtrixLogo: React.FC<{ size?: number; variant?: 'wordmark' | 'full' | 'icon' }> = ({ variant = 'wordmark' }) => {
  if (variant === 'icon') {
    return (
      <div className="flex items-center justify-center w-full">
        <img
          src="/logo.png"
          alt="KASHTRIX Icon"
          className="h-8 w-8 object-contain shrink-0 sidebar-logo"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center select-none py-1 w-full overflow-hidden">
      <img
        src="/sidebar-full-logo.png"
        alt="KASHTRIX StreamOps"
        className="h-9 max-w-full object-contain shrink-0 sidebar-logo"
        draggable={false}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/logo-full-with text.png';
        }}
      />
    </div>
  );
};

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
    <div className="relative flex min-h-screen font-sans text-[#1B1024] dark:bg-[#0F0817] dark:text-[#F1EAFA]">
      <Toaster position="top-right" />
      {/* Rich Promo Panel with Gradient background & Light Logo Container */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] items-center justify-center bg-gradient-to-br from-[#160822] via-[#2A0D38] to-[#451874] p-12 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-[#7C3AED]/25 blur-3xl pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-[#E11D48]/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-lg text-white space-y-6">
          <div className="inline-flex rounded-2xl bg-white p-4 shadow-2xl backdrop-blur-md border border-white/20 dark:bg-[#190E28] dark:border-[#311B4E]">
            <img
              src="/sidebar-full-logo.png"
              alt="KASHTRIX StreamOps"
              className="h-11 w-auto object-contain sidebar-logo login-logo"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/logo-full-with text.png';
              }}
            />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-semibold text-[#E2D1F9] backdrop-blur-xs mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
              <span>Enterprise Media Ingest & Playout</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white font-display">
              Live Streaming • Transcoding • Ingest
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#E2D1F9]">
              Enterprise-grade IPTV management, OTT content delivery, master recording archives, and media infrastructure control plane.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FaBroadcastTower size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">Ultra-Low Latency</span>
                <p className="text-xs font-semibold text-white mt-0.5">HLS, DASH, RTMP & SRT</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FiCpu size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">Hardware Acceleration</span>
                <p className="text-xs font-semibold text-white mt-0.5">NVENC, AMF, QSV & CPU</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FiArchive size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">Master Recording</span>
                <p className="text-xs font-semibold text-white mt-0.5">Broadcast Vault & Preview</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FiShield size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">High Availability</span>
                <p className="text-xs font-semibold text-white mt-0.5">Real-time Telemetry & Health</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Login Form Container (Responsive Centered) */}
      <div className="flex w-full lg:w-1/2 xl:w-[45%] items-center justify-center bg-[#F8F7FA] p-6 sm:p-10 dark:bg-[#0F0817]">
        <div className="w-full max-w-[420px]">
          {/* Responsive Centered Logo Header for Mobile & Tablet */}
          <div className="flex flex-col items-center justify-center text-center mb-8 lg:hidden">
            <div className="inline-flex rounded-2xl bg-white p-3.5 shadow-xl border border-slate-200 dark:bg-[#190E28] dark:border-[#311B4E] mb-4">
              <img
                src="/sidebar-full-logo.png"
                alt="KASHTRIX StreamOps"
                className="h-9 w-auto object-contain sidebar-logo login-logo"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo-full-with text.png';
                }}
              />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEFF] border border-[#DDD6FE] px-3 py-0.5 text-[11px] font-semibold text-[#7C3AED] dark:bg-[#311754] dark:border-[#A78BFA]/30 dark:text-[#C4B5FD] mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" />
              <span>StreamOps Control Plane</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-[#1B1024] dark:text-white">Welcome back</h2>
            <p className="mt-1 text-xs text-[#6F6078] dark:text-[#B9A5CD]">Sign in to KASHTRIX StreamOps operations console</p>
          </div>

          {/* Desktop Heading */}
          <div className="hidden lg:block mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEFF] border border-[#DDD6FE] px-3 py-0.5 text-[11px] font-semibold text-[#7C3AED] dark:bg-[#311754] dark:border-[#A78BFA]/30 dark:text-[#C4B5FD] mb-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" />
              <span>StreamOps Control Plane</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-[#1B1024] dark:text-white">Welcome back</h2>
            <p className="mt-1 text-xs text-[#6F6078] dark:text-[#B9A5CD]">Sign in to KASHTRIX StreamOps operations console</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Username Input with Icon */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#1B1024] dark:text-white">
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#94A3B8] dark:text-[#64748B]">
                  <FiUser size={15} />
                </div>
                <input
                  className="h-10 w-full rounded-xl border border-[#E8DFF0] bg-white pl-9 pr-3 text-xs text-[#1B1024] shadow-2xs outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15 dark:bg-[#190E28] dark:border-[#311B4E] dark:text-white dark:placeholder-[#64748B] dark:focus:border-[#A78BFA]"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password Input with Icon & Toggle */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#1B1024] dark:text-white">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#94A3B8] dark:text-[#64748B]">
                  <FiLock size={15} />
                </div>
                <input
                  className="h-10 w-full rounded-xl border border-[#E8DFF0] bg-white pl-9 pr-10 text-xs text-[#1B1024] shadow-2xs outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15 dark:bg-[#190E28] dark:border-[#311B4E] dark:text-white dark:placeholder-[#64748B] dark:focus:border-[#A78BFA]"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#94A3B8] hover:text-[#4A1B7A] dark:text-[#64748B] dark:hover:text-[#A78BFA] transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#451874] via-[#351147] to-[#2A0D38] text-xs font-semibold text-white shadow-md transition-all hover:from-[#582092] hover:to-[#38124b] hover:shadow-lg disabled:opacity-70 dark:from-[#7C3AED] dark:to-[#6D32D9] dark:hover:from-[#8B5CF6] dark:hover:to-[#7C3AED]"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <FiLogIn size={15} />
                  <span>Sign In to Console</span>
                </>
              )}
            </button>
          </form>

          {/* Responsive Badges & Security Footer */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-[#E8DFF0] pt-5 text-[11px] text-[#6F6078] dark:border-[#311B4E] dark:text-[#B9A5CD]">
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-2xs border border-[#E8EDF5] dark:bg-[#190E28] dark:border-[#311B4E]">
              <FaBroadcastTower className="text-[#E11D48]" size={11} /> Live Ingest
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-2xs border border-[#E8EDF5] dark:bg-[#190E28] dark:border-[#311B4E]">
              <FiCpu className="text-[#7C3AED]" size={11} /> GPU Transcode
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 shadow-2xs border border-[#E8EDF5] dark:bg-[#190E28] dark:border-[#311B4E]">
              <FiShield className="text-[#059669]" size={11} /> Enterprise
            </span>
          </div>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[#94A3B8] dark:text-[#64748B]">
            <FiLock size={11} />
            <span>Encrypted Operator Session</span>
          </div>
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
      <div className="flex items-center justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">System Settings</h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">Server ports, hardware acceleration defaults and network options</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">Network Ports & Protocols</h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">RTMP Ingest Port</label>
            <input
              type="number"
              className={inputClass}
              value={form.rtmpPort || 1935}
              onChange={e => setForm(p => ({ ...p, rtmpPort: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">HTTP Media Distribution Port</label>
            <input
              type="number"
              className={inputClass}
              value={form.mediaPort || 8080}
              onChange={e => setForm(p => ({ ...p, mediaPort: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">Transcoder Hardware Defaults</h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Default Video Preset</label>
            <input
              className={inputClass}
              value={(form as any).defaultPreset || 'medium'}
              onChange={e => setForm(p => ({ ...p, defaultPreset: e.target.value } as any))}
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
    if (newPassword && newPassword.length < 12) return toast.error('New password must be at least 12 characters');
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
      <div className="border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">Account Settings</h1>
        <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">Administrator profile and authentication credentials</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F4EEFF] font-display font-bold text-[#4A1B7A] dark:bg-[#371F59] dark:text-[#C4B5FD]">
              {username.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-[#1B1024] dark:text-white">{username}</p>
              <p className="text-[10px] text-[#6F6078] uppercase font-bold dark:text-[#B9A5CD]">StreamOps Administrator</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs lg:col-span-2 dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">Login Credentials</h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Username</label>
            <input className={inputClass} value={nextUsername} onChange={e => setNextUsername(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Current Password</label>
            <input className={inputClass} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">New Password</label>
            <input className={inputClass} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={12} placeholder="Leave blank to keep unchanged" />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !currentPassword}
            className="flex h-8 items-center justify-center rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] disabled:opacity-50 dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
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
  userRole?: string;
  onActivate: (key: string) => Promise<any>;
  onGenerate: (payload: { customerName: string; customerEmail?: string; expiresAt?: string; days?: number; features: string[]; hardwareId: string }) => Promise<any>;
  fetchLicenses: () => Promise<any[]>;
  suspendLicense: (id: number) => Promise<any>;
  resumeLicense: (id: number) => Promise<any>;
  resetLicense: () => Promise<any>;
}> = ({ status, license, userRole, onActivate, onGenerate, fetchLicenses, suspendLicense, resumeLicense }) => {
  const inputClass = 'w-full rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 py-1.5 text-[12px] text-[#1B1024] outline-none focus:border-[#6D32D9] dark:bg-[#211335] dark:border-[#371F59] dark:text-white';
  const [key, setKey] = useState('');
  const [generated, setGenerated] = useState('');
  const [generator, setGenerator] = useState({
    customerName: '',
    customerEmail: '',
    days: 365,
    hardwareId: license.systemHwid || '',
    features: LICENSE_MODULE_OPTIONS.map(m => m.id) as string[]
  });
  const [loading, setLoading] = useState(false);
  const [licensesList, setLicensesList] = useState<any[]>([]);

  const canShowGenerator = userRole === 'superadmin';

  useEffect(() => {
    if (canShowGenerator) {
      fetchLicenses().then(setLicensesList).catch(() => { });
    }
  }, [fetchLicenses, canShowGenerator]);

  const activate = async () => {
    setLoading(true);
    try {
      await onActivate(key.trim());
      toast.success('License activated successfully');
      setKey('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    if (!generator.customerName.trim()) return toast.error('Customer name is required');
    if (!generator.features.length) return toast.error('Select at least one licensed module');
    if (!generator.hardwareId.trim()) return toast.error('Enter target system HWID');
    setLoading(true);
    try {
      const result = await onGenerate(generator);
      setGenerated(result.licenseKey);
      toast.success('License generated successfully');
      const updated = await fetchLicenses();
      setLicensesList(updated);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSuspend = async (item: any) => {
    try {
      if (item.status === 'suspended') {
        await resumeLicense(item.id);
        toast.success('License resumed');
      } else {
        await suspendLicense(item.id);
        toast.success('License suspended');
      }
      const updated = await fetchLicenses();
      setLicensesList(updated);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update license status');
    }
  };

  return (
    <div className="license-workspace page-stack space-y-4">
      {/* Header */}
      <div className="border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">License Administration</h1>
        <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">HWID hardware binding, JWT token status and module entitlements</p>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${canShowGenerator ? 'xl:grid-cols-2' : 'max-w-3xl'}`}>
        {/* Current License Status Card */}
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">Current Server License Status</h2>

          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 text-[12px] dark:bg-[#211335] dark:border-[#371F59]">
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Status</span>
              <p className="font-bold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${license.status === 'activated' ? 'bg-[#16A36A] dark:bg-[#34D399]' : 'bg-[#DC3545]'}`} />
                {license.status}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Customer</span>
              <p className="font-bold text-[#1B1024] dark:text-white truncate">{license.customerName || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Expires</span>
              <p className="font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Binding</span>
              <p className="font-bold text-[#16A36A] dark:text-[#34D399]">{license.hardwareBound ? 'HWID Bound' : 'Global'}</p>
            </div>
          </div>

          <CodeField value={license.systemHwid || ''} label="System HWID (Hardware Identifier)" />

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Enabled Server Modules</span>
            <div className="flex flex-wrap gap-1.5">
              {LICENSE_MODULE_OPTIONS.filter(m => hasLicenseModule(license, m.id)).map(m => (
                <span key={m.id} className="rounded border border-[#D8C6E8] bg-[#F4EEFF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#4A1B7A] dark:bg-[#2D1845] dark:border-[#45266E] dark:text-[#C4B5FD]">
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">Activate JWT License Token</label>
            <textarea
              className={`${inputClass} h-20 resize-none font-mono text-[11px]`}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Paste JWT license token string here..."
            />
            <button
              type="button"
              onClick={activate}
              disabled={loading || !key.trim()}
              className="mt-2 flex h-8 items-center justify-center rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] disabled:opacity-50 dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
            >
              {loading ? 'Activating...' : 'Activate License'}
            </button>
          </div>
        </div>

        {/* License Generator Card */}
        {canShowGenerator && (
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3.5 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
            <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">License Generator & Module Entitlements</h2>

            {/* Customer Details */}
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Customer Name</label>
                <input className={inputClass} value={generator.customerName} onChange={e => setGenerator(p => ({ ...p, customerName: e.target.value }))} placeholder="Customer Name" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Customer Email</label>
                <input className={inputClass} value={generator.customerEmail} onChange={e => setGenerator(p => ({ ...p, customerEmail: e.target.value }))} placeholder="Customer Email" />
              </div>
            </div>

            {/* Validity & HWID */}
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Validity Days</label>
                <input className={inputClass} type="number" value={generator.days} onChange={e => setGenerator(p => ({ ...p, days: Number(e.target.value) || 365 }))} placeholder="Valid Days" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">Target HWID</label>
                  <button
                    type="button"
                    onClick={() => setGenerator(p => ({ ...p, hardwareId: license.systemHwid || '' }))}
                    className="text-[9px] font-bold text-[#6D32D9] hover:underline dark:text-[#A78BFA]"
                  >
                    Current HWID
                  </button>
                </div>
                <input className={`${inputClass} font-mono uppercase`} value={generator.hardwareId} onChange={e => setGenerator(p => ({ ...p, hardwareId: e.target.value.toUpperCase() }))} placeholder="KTX-XXXX-XXXX-XXXX-XXXX-XXXX" />
              </div>
            </div>

            {/* Module Entitlement Checkboxes */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[#1B1024] dark:text-white">Module Entitlements</span>
                <div className="flex gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setGenerator(p => ({ ...p, features: LICENSE_MODULE_OPTIONS.map(m => m.id) }))}
                    className="text-[#6D32D9] hover:underline font-semibold dark:text-[#A78BFA]"
                  >
                    Select All
                  </button>
                  <span className="text-[#E8DFF0] dark:text-[#311B4E]">|</span>
                  <button
                    type="button"
                    onClick={() => setGenerator(p => ({ ...p, features: [] }))}
                    className="text-[#6F6078] hover:underline font-semibold dark:text-[#B9A5CD]"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2.5 dark:bg-[#211335] dark:border-[#371F59]">
                {LICENSE_MODULE_OPTIONS.map(m => {
                  const isChecked = generator.features.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-start gap-2 cursor-pointer select-none text-[12px]">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setGenerator(p => ({ ...p, features: [...p.features, m.id] }));
                          } else {
                            setGenerator(p => ({ ...p, features: p.features.filter(id => id !== m.id) }));
                          }
                        }}
                        className="mt-0.5 rounded border-[#E8DFF0] text-[#6D32D9] focus:ring-[#6D32D9]"
                      />
                      <div>
                        <span className="font-semibold text-[#1B1024] dark:text-white">{m.label}</span>
                        <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">{m.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="flex h-9 w-full items-center justify-center rounded-lg bg-[#6D32D9] px-4 text-[12px] font-semibold text-white hover:bg-[#4A1B7A] disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Hardware-Bound License'}
            </button>

            {generated && (
              <div className="space-y-2 rounded-lg border border-[#16A36A]/30 bg-[#F0FDF4] p-3 dark:bg-[#064E3B]/60 dark:border-[#059669]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#16A36A] dark:text-[#34D399]">Generated License Key</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await onActivate(generated);
                      toast.success('License activated on this server!');
                    }}
                    className="rounded bg-[#16A36A] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#15803D]"
                  >
                    Activate Instantly
                  </button>
                </div>
                <CodeField value={generated} label="" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issued Licenses Registry Table */}
      {canShowGenerator && licensesList.length > 0 && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs space-y-3 dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">Issued License Registry</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-bold uppercase text-[#6F6078] dark:bg-[#211335] dark:border-[#311B4E] dark:text-[#B9A5CD]">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Target HWID</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {licensesList.map((lic: any) => (
                  <tr key={lic.id} className="hover:bg-[#F8F7FA] dark:hover:bg-[#2B1745]">
                    <td className="px-3 py-2 font-semibold text-[#1B1024] dark:text-white">{lic.customer_name}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">{lic.hardware_id || '—'}</td>
                    <td className="px-3 py-2 text-[#6F6078] dark:text-[#B9A5CD]">{new Date(lic.expires_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${lic.status === 'suspended' ? 'bg-[#FEE2E2] text-[#DC3545] dark:bg-[#450A0A] dark:text-[#FCA5A5]' : 'bg-[#D1FAE5] text-[#16A36A] dark:bg-[#064E3B] dark:text-[#34D399]'}`}>
                        {lic.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSuspend(lic)}
                        className="rounded border border-[#E8DFF0] bg-white px-2 py-1 text-[10px] font-semibold text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
                      >
                        {lic.status === 'suspended' ? 'Resume' : 'Suspend'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   EXPIRED SCREEN
   ═══════════════════════════════════════════ */
const ExpiredScreen: React.FC<{ license: LicenseInfo; username?: string; onActivate: (key: string) => Promise<any>; onGenerate: any; onLogout: () => void }> = ({ license, onLogout }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#F8F7FA] p-4 text-[#1B1024] dark:bg-[#0F0817] dark:text-white">
    <div className="w-full max-w-md rounded-xl border border-[#E8DFF0] bg-white p-6 shadow-lg text-center space-y-3 dark:bg-[#190E28] dark:border-[#311B4E]">
      <h1 className="font-display text-[18px] font-bold text-[#DC3545]">License Expired or Invalid</h1>
      <p className="text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">The operations console requires an active license token.</p>
      <CodeField value={license.systemHwid || ''} label="System HWID" />
      <button onClick={onLogout} className="text-[12px] font-semibold text-[#6D32D9] hover:underline dark:text-[#A78BFA]">
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
  iconColor: string;
  iconShadow: string;
  badge?: string;
  badgeColor?: string;
  licenseModule?: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2, group: 'Main', iconColor: 'text-[#7C3AED]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(124,58,237,0.45)]' },
  { id: 'channels', label: 'Channels Playout', icon: FiTv, group: 'Operations', iconColor: 'text-[#9333EA]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(147,51,234,0.45)]', licenseModule: 'live-tv' },
  { id: 'ingest', label: 'Ingest Server', icon: FaBroadcastTower, group: 'Operations', iconColor: 'text-[#E11D48]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(225,29,72,0.45)]', badge: 'REC', badgeColor: 'bg-[#E11D48]', licenseModule: 'ingest-server' },
  { id: 'live-server', label: 'Live Server', icon: FiServer, group: 'Operations', iconColor: 'text-[#059669]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(5,150,105,0.45)]', badge: 'LIVE', badgeColor: 'bg-[#059669]', licenseModule: 'live-server' },
  { id: 'recordings', label: 'Recording Library', icon: FiArchive, group: 'Media & Archive', iconColor: 'text-[#EA580C]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(234,88,12,0.45)]', licenseModule: 'recording-library' },
  { id: 'monitor', label: 'System Telemetry', icon: FiActivity, group: 'Observability', iconColor: 'text-[#0284C7]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(2,132,199,0.45)]', licenseModule: 'system-monitor' },
  { id: 'events', label: 'Events & Alerts', icon: FiBell, group: 'Observability', iconColor: 'text-[#EA580C]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(234,88,12,0.45)]' },
  { id: 'users', label: 'User Management', icon: FiUsers, group: 'System & Admin', iconColor: 'text-[#7C3AED]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(124,58,237,0.45)]' },
  { id: 'settings', label: 'Engine Settings', icon: FiSettings, group: 'System & Admin', iconColor: 'text-[#475569]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(71,85,105,0.4)]' },
  { id: 'license', label: 'License Admin', icon: FiKey, group: 'System & Admin', iconColor: 'text-[#E11D48]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(225,29,72,0.45)]' },
  { id: 'account', label: 'Account Profile', icon: FiUser, group: 'System & Admin', iconColor: 'text-[#0D9488]', iconShadow: 'drop-shadow-[0_4px_6px_rgba(13,148,136,0.45)]' },
];

/* ═══════════════════════════════════════════
   SIDEBAR COMPONENT (PREMIUM SAAS DESIGN)
   ═══════════════════════════════════════════ */
const Sidebar: React.FC<{
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  collapsed: boolean;
  onToggle: () => void;
  licenseStatus: string;
  customerName?: string;
  license: LicenseInfo;
  userRole?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}> = ({ activeView, setActiveView, collapsed, onToggle, licenseStatus, customerName, license, userRole, mobileOpen, onMobileClose }) => {
  const visibleItems = useMemo(() => {
    return navItems.filter(item => {
      if (item.id === 'users' && userRole !== 'superadmin') return false;
      return userRole === 'superadmin' || hasLicenseModule(license, item.licenseModule);
    });
  }, [license, userRole]);

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
        className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-[#E8EDF5] bg-white transition-all duration-200 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E] ${mobileOpen ? 'w-[288px] translate-x-0' : '-translate-x-full lg:translate-x-0'
          } ${collapsed && !mobileOpen ? 'lg:w-[72px]' : 'lg:w-[288px]'}`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-center border-b border-[#E8EDF5] px-3 dark:border-[#311B4E]">
          <div className="flex items-center justify-center w-full overflow-hidden">
            <KashtrixLogo variant={collapsed && !mobileOpen ? 'icon' : 'wordmark'} />
          </div>
        </div>

        {/* Navigation Items Grouped */}
        <nav className={`flex-1 overflow-y-auto py-4 space-y-4 scrollbar-hide font-sans ${collapsed && !mobileOpen ? 'px-2' : 'px-3'}`}>
          {groups.map(group => (
            <div key={group.name} className="space-y-1.5">
              {(!collapsed || mobileOpen) && (
                <div className="px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#64748B] dark:text-[#C4B5FD] select-none">
                  {group.name}
                </div>
              )}
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                const isCollapsed = collapsed && !mobileOpen;

                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveView(item.id); onMobileClose(); }}
                    className={`group relative flex h-11 w-full items-center rounded-xl text-left transition-all duration-150 ${isActive
                        ? 'bg-[#F3EEFF] text-[#1E1B4B] font-semibold border-l-4 border-[#7C3AED] dark:bg-[#311754] dark:text-white dark:border-[#A78BFA] shadow-2xs'
                        : 'hover:bg-[#F8FAFC] dark:hover:bg-[#281640]'
                      } ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'}`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3 overflow-hidden'}`}>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent shrink-0 transition-transform duration-150 group-hover:scale-110">
                        <Icon size={19} className={`${item.iconColor} filter ${item.iconShadow}`} />
                      </div>

                      {!isCollapsed && (
                        <span className={`truncate text-[14px] transition-colors ${isActive
                            ? 'text-[#1E1B4B] dark:text-white font-bold'
                            : 'text-[#334155] dark:text-white font-semibold group-hover:text-[#0F172A] group-hover:dark:text-white'
                          }`}>
                          {item.label}
                        </span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.badge ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs ${item.badgeColor || 'bg-[#7C3AED]'}`}>
                            {item.badge}
                          </span>
                        ) : (
                          <FiChevronRight size={14} className="text-[#94A3B8] group-hover:text-[#64748B] dark:text-[#8E78A6] dark:group-hover:text-white transition-transform duration-150 group-hover:translate-x-0.5" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom License Status Card */}
        {(!collapsed || mobileOpen) ? (
          <div className="border-t border-[#E8EDF5] p-3.5 dark:border-[#311B4E]">
            <div className="rounded-2xl border border-[#E8EDF5] bg-[#F8FAFC] p-3 flex items-center justify-between shadow-2xs dark:bg-[#211335] dark:border-[#371F59]">
              <div className="space-y-0.5 overflow-hidden pr-2">
                <div className="flex items-center gap-2 font-bold text-[13px] text-[#0F172A] dark:text-white">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                  </span>
                  <span className="truncate">{licenseStatus === 'activated' ? 'Pro License Active' : 'Trial Mode'}</span>
                </div>
                <div className="text-[11px] font-medium text-[#64748B] truncate dark:text-[#B9A5CD]">
                  {customerName || 'Kalyan'}
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E0F2FE] text-[#0284C7] shrink-0 dark:bg-[#371F59] dark:text-[#A78BFA]">
                <FiAward size={16} />
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#E8EDF5] p-2 text-center dark:border-[#311B4E]">
            <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-[#F8FAFC] text-[#10B981] dark:bg-[#211335]" title="License Active">
              <FiShield size={17} />
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
/* ═══════════════════════════════════════════
   GLOBAL TELEMETRY HOOK & UTILITIES
   ═══════════════════════════════════════════ */
const formatNetSpeed = (bytes: number): string => {
  if (typeof bytes !== 'number' || bytes <= 0 || isNaN(bytes)) return '0 B/s';
  const bits = bytes * 8;
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(bits) / Math.log(k));
  if (i < 0) return '0 bps';
  const exp = Math.min(i, sizes.length - 1);
  const val = bits / Math.pow(k, exp);
  return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} ${sizes[exp]}`;
};

interface GlobalTelemetryState {
  cpuLoad: number;
  memLoad: number;
  diskLoad: number;
  gpuLoad: number;
  gpuModel: string;
  vramFmt: string;
  vramPercent: number;
  lastRx: number;
  lastTx: number;
  uptimeFmt: string;
  lastUpdated: number;
}

const useGlobalTelemetry = (): GlobalTelemetryState => {
  const [telemetry, setTelemetry] = useState<GlobalTelemetryState>({
    cpuLoad: 0,
    memLoad: 0,
    diskLoad: 0,
    gpuLoad: 0,
    gpuModel: 'AMD Radeon(TM) 860M Graphics',
    vramFmt: '512 MB',
    vramPercent: 18,
    lastRx: 0,
    lastTx: 0,
    uptimeFmt: 'Active',
    lastUpdated: Date.now(),
  });

  useEffect(() => {
    let mounted = true;
    const fetchTelemetry = async () => {
      try {
        const token = localStorage.getItem('kte-auth-token');
        const res = await fetch('/api/system/stats', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data) {
          const totalRx = typeof data.lastRx === 'number'
            ? data.lastRx
            : (data.networkDetails || []).reduce((acc: number, item: any) => acc + (item.rx_sec || 0), 0);
          const totalTx = typeof data.lastTx === 'number'
            ? data.lastTx
            : (data.networkDetails || []).reduce((acc: number, item: any) => acc + (item.tx_sec || 0), 0);

          setTelemetry({
            cpuLoad: typeof data.cpuLoad === 'number' ? data.cpuLoad : 0,
            memLoad: typeof data.memLoad === 'number' ? data.memLoad : 0,
            diskLoad: typeof data.diskLoad === 'number' ? data.diskLoad : 0,
            gpuLoad: data.gpuDetails?.load !== undefined ? data.gpuDetails.load : 0,
            gpuModel: data.gpuDetails?.model || 'AMD Radeon(TM) 860M Graphics',
            vramFmt: data.gpuDetails?.vramFmt || '512 MB',
            vramPercent: data.gpuDetails?.memoryLoad !== undefined ? data.gpuDetails.memoryLoad : 0,
            lastRx: totalRx,
            lastTx: totalTx,
            uptimeFmt: data.uptimeFmt || 'Active',
            lastUpdated: Date.now(),
          });
        }
      } catch (e) {}
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return telemetry;
};

/* ═══════════════════════════════════════════
   FLOATING TELEMETRY HUD WIDGET
   ═══════════════════════════════════════════ */
const FloatingTelemetryHud: React.FC<{
  telemetry: GlobalTelemetryState;
  onNavigate: (view: ActiveView) => void;
}> = ({ telemetry, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem('kashtrix-hud-minimized') === 'true';
    } catch {
      return false;
    }
  });

  const toggleMinimized = () => {
    const next = !minimized;
    setMinimized(next);
    try {
      localStorage.setItem('kashtrix-hud-minimized', String(next));
    } catch {}
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 select-none">
      {/* Expanded Floating Card */}
      {isOpen && (
        <div className="mb-2 w-72 rounded-2xl border border-[#E8DFF0] bg-white/95 p-3.5 shadow-2xl backdrop-blur-md dark:bg-[#190E28]/95 dark:border-[#371F59] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2 dark:border-[#311B4E]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A36A] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#16A36A]"></span>
              </span>
              <span className="font-display text-[13px] font-bold text-[#1B1024] dark:text-white">Live Telemetry HUD</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white transition-colors"
            >
              <FiX size={14} />
            </button>
          </div>

          <div className="mt-2.5 space-y-2 text-[11px]">
            {/* CPU */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#B9A5CD]">
                  <FiCpu size={12} className="text-[#6D32D9] dark:text-[#A78BFA]" /> CPU Engine
                </span>
                <span className="font-mono text-[#1B1024] dark:text-white">{telemetry.cpuLoad.toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#281640]">
                <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${Math.min(100, Math.max(0, telemetry.cpuLoad))}%` }} />
              </div>
            </div>

            {/* GPU */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#B9A5CD]">
                  <FiZap size={12} className="text-amber-500" /> GPU Acceleration
                </span>
                <span className="font-mono text-amber-600 dark:text-amber-400">{telemetry.gpuLoad.toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#281640]">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.max(0, telemetry.gpuLoad))}%` }} />
              </div>
              <div className="mt-0.5 text-[9px] text-[#6F6078] dark:text-[#B9A5CD] truncate">{telemetry.gpuModel}</div>
            </div>

            {/* RAM */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#B9A5CD]">
                  <FiLayers size={12} className="text-[#2563EB]" /> System RAM
                </span>
                <span className="font-mono text-[#2563EB] dark:text-[#60A5FA]">{telemetry.memLoad.toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#281640]">
                <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.min(100, Math.max(0, telemetry.memLoad))}%` }} />
              </div>
            </div>

            {/* Network */}
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 dark:bg-[#211335] dark:border-[#371F59]">
              <div className="flex items-center justify-between text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                <span className="flex items-center gap-1 font-semibold">
                  <FiRadio size={11} className="text-[#16A36A]" /> Network I/O
                </span>
                <span className="font-mono text-[#16A36A] dark:text-[#34D399] font-bold">Active</span>
              </div>
              <div className="mt-1 flex items-center justify-between font-mono font-bold text-[11px]">
                <span className="text-[#2563EB] dark:text-[#60A5FA]">↓ {formatNetSpeed(telemetry.lastRx)}</span>
                <span className="text-[#16A36A] dark:text-[#34D399]">↑ {formatNetSpeed(telemetry.lastTx)}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#E8DFF0] pt-2 dark:border-[#311B4E]">
            <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
              Uptime: <strong className="font-mono text-[#1B1024] dark:text-white">{telemetry.uptimeFmt}</strong>
            </span>
            <button
              onClick={() => { onNavigate('monitor'); setIsOpen(false); }}
              className="flex items-center gap-1 rounded-md bg-[#7C3AED] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#6D28D9] transition-colors"
            >
              Open Telemetry <FiChevronRight size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Floating HUD Pill Button */}
      {!minimized ? (
        <div className="flex items-center shadow-xl rounded-full border border-[#E8DFF0] bg-white/95 backdrop-blur-md p-1 gap-1.5 dark:bg-[#190E28]/95 dark:border-[#371F59]">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:text-white dark:hover:bg-[#2D1A45] transition-colors"
            title="Toggle Live System Usage HUD"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A36A] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A36A]"></span>
            </span>
            <span className="flex items-center gap-1">
              <FiCpu size={11} className="text-[#6D32D9] dark:text-[#A78BFA]" />
              <span className="font-mono font-bold text-[11px]">{telemetry.cpuLoad.toFixed(0)}%</span>
            </span>
            <span className="text-[#E8DFF0] dark:text-[#311B4E]">|</span>
            <span className="flex items-center gap-1">
              <FiZap size={11} className="text-amber-500" />
              <span className="font-mono font-bold text-[11px] text-amber-600 dark:text-amber-400">{telemetry.gpuLoad.toFixed(0)}%</span>
            </span>
            <span className="text-[#E8DFF0] dark:text-[#311B4E]">|</span>
            <span className="font-mono font-bold text-[11px] text-[#16A36A] dark:text-[#34D399]">
              ↓ {formatNetSpeed(telemetry.lastRx)}
            </span>
          </button>

          <button
            onClick={toggleMinimized}
            className="p-1 text-[#6F6078] hover:text-[#1B1024] rounded-full dark:text-[#B9A5CD] dark:hover:text-white transition-colors"
            title="Minimize Floating Telemetry"
          >
            <FiMinimize size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={toggleMinimized}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E8DFF0] bg-white shadow-lg text-[#7C3AED] hover:bg-[#F4EEFF] dark:bg-[#190E28] dark:border-[#371F59] dark:text-[#A78BFA] dark:hover:bg-[#2D1A45] transition-all"
          title="Restore System Telemetry HUD"
        >
          <FiActivity size={16} className="animate-pulse" />
        </button>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   TOP HEADER
   ═══════════════════════════════════════════ */
const TopHeader: React.FC<{
  activeView: ActiveView;
  username?: string;
  customerName?: string;
  licenseStatus?: string;
  saveStatus: string;
  onLogout: () => void;
  onMobileMenuOpen: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onNavigateToLicense?: () => void;
}> = ({
  activeView,
  username,
  customerName,
  licenseStatus,
  saveStatus,
  onLogout,
  onMobileMenuOpen,
  sidebarCollapsed,
  onToggleSidebar,
  themeMode,
  onThemeChange,
  onNavigateToLicense,
}) => {
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

  const displayTitle = useMemo(() => {
    const baseLabel = viewLabels[activeView] || activeView;
    const isLicenseActive = licenseStatus === 'activated';
    if (isLicenseActive && customerName && customerName.trim()) {
      return `${baseLabel} — ${customerName.trim()}`;
    }
    return baseLabel;
  }, [activeView, customerName, licenseStatus]);

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center justify-between border-b border-[#E8DFF0] bg-white px-4 dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="flex h-8 w-8 items-center justify-center rounded text-[#6F6078] hover:bg-[#F8F7FA] dark:text-[#B9A5CD] dark:hover:bg-[#211335] lg:hidden"
        >
          <FiMenu size={18} />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded text-[#6F6078] hover:bg-[#F8F7FA] dark:text-[#94A3B8] dark:hover:bg-[#334155]"
        >
          <FiMenu size={18} />
        </button>
        <div>
          <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">{displayTitle}</h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <input
            type="text"
            placeholder="Search operations..."
            className="h-8 w-52 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[11px] text-[#1B1024] outline-none focus:border-[#7C3AED] dark:bg-[#0F172A] dark:border-[#334155] dark:text-white dark:placeholder-[#94A3B8]"
          />
          <FiSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#94A3B8]" />
        </div>

        {/* License Status Badge */}
        {licenseStatus === 'activated' ? (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-bold text-[#16A36A] hover:bg-[#DCFCE7] dark:border-[#059669]/60 dark:bg-[#064E3B]/40 dark:text-[#34D399] dark:hover:bg-[#064E3B]/70 transition-colors shadow-xs"
            title="License is Active. Click to view License."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] dark:bg-[#34D399]" />
            Licensed
          </button>
        ) : licenseStatus === 'expired' ? (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#DC3545] hover:bg-[#FEE2E2] dark:border-[#DC3545]/60 dark:bg-[#450A0A]/60 dark:text-[#FCA5A5] dark:hover:bg-[#450A0A] transition-colors shadow-xs animate-pulse"
            title="License has expired! Click to activate a license."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#DC3545]" />
            License Expired
          </button>
        ) : licenseStatus === 'trial' ? (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1 text-[11px] font-bold text-[#D97706] hover:bg-[#FEF3C7] dark:border-[#D97706]/60 dark:bg-[#451A03]/50 dark:text-[#FCD34D] dark:hover:bg-[#451A03]/80 transition-colors shadow-xs"
            title="System is running in Trial Mode. Streaming and ingest actions are restricted. Click to activate."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
            Trial Mode
          </button>
        ) : (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#DC3545] hover:bg-[#FEE2E2] dark:border-[#DC3545]/60 dark:bg-[#450A0A]/60 dark:text-[#FCA5A5] dark:hover:bg-[#450A0A] transition-colors shadow-xs"
            title="Unlicensed Version. Click to activate a license."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#DC3545]" />
            Unlicensed Version
          </button>
        )}

        {/* Theme Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            const nextMode = themeMode === 'dark' ? 'light' : 'dark';
            onThemeChange(nextMode);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#D97706] dark:hover:bg-[#2D1A45]"
          title={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {themeMode === 'dark' ? <FiSun size={15} className="text-[#D97706]" /> : <FiMoon size={15} className="text-[#4A1B7A]" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-[#F8F7FA] dark:hover:bg-[#211335]"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F4EEFF] text-[12px] font-bold text-[#4A1B7A] dark:bg-[#371F59] dark:text-[#A78BFA]">
              {username?.charAt(0).toUpperCase() || 'U'}
            </span>
            <span className="hidden text-[12px] font-semibold text-[#1B1024] dark:text-white sm:block">{username || 'Admin'}</span>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-lg border border-[#E8DFF0] bg-white p-1 shadow-lg dark:bg-[#190E28] dark:border-[#311B4E]">
                <button
                  onClick={() => { onLogout(); setUserMenuOpen(false); }}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[12px] font-semibold text-[#DC3545] hover:bg-[#FEF2F2] dark:hover:bg-[#3A1420]"
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

const getInitialActiveView = (): ActiveView => {
  try {
    const hash = window.location.hash.replace('#', '') as ActiveView;
    const validViews: ActiveView[] = ['dashboard', 'channels', 'live-server', 'monitor', 'ingest', 'recordings', 'events', 'users', 'settings', 'license', 'account'];
    if (hash && validViews.includes(hash)) return hash;
    const saved = localStorage.getItem('kashtrix-active-view') as ActiveView;
    if (saved && validViews.includes(saved)) return saved;
  } catch {}
  return 'dashboard';
};

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
const App: React.FC = () => {
  const engine = useEngine();
  const telemetry = useGlobalTelemetry();
  const [activeView, setActiveViewState] = useState<ActiveView>(getInitialActiveView);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('kashtrix-theme') as ThemeMode) || 'light');

  const setActiveView = (view: ActiveView) => {
    setActiveViewState(view);
    try {
      localStorage.setItem('kashtrix-active-view', view);
      if (window.location.hash !== `#${view}`) {
        window.location.hash = view;
      }
    } catch {}
  };

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '') as ActiveView;
      const validViews: ActiveView[] = ['dashboard', 'channels', 'live-server', 'monitor', 'ingest', 'recordings', 'events', 'users', 'settings', 'license', 'account'];
      if (hash && validViews.includes(hash)) {
        setActiveViewState(hash);
        localStorage.setItem('kashtrix-active-view', hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem('kashtrix-theme', themeMode);
    const root = document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [themeMode]);

  useEffect(() => {
    if (!engine.auth.token || !engine.auth.user) return;
    const item = navItems.find(navItem => navItem.id === activeView);
    const isSuperadmin = engine.auth.user?.role === 'superadmin';
    if (item?.licenseModule && engine.auth.license?.status === 'activated') {
      if (!isSuperadmin && !hasLicenseModule(engine.auth.license, item.licenseModule)) {
        setActiveView('dashboard');
      }
    } else if (item?.id === 'users' && !isSuperadmin) {
      setActiveView('dashboard');
    }
  }, [activeView, engine.auth.token, engine.auth.user, engine.auth.license]);

  if (!engine.auth.token) return <LoginScreen onLogin={engine.login} />;

  if (engine.auth.license.status === 'expired' || engine.auth.license.status === 'suspended' || engine.auth.license.status === 'hardware_mismatch') {
    return <ExpiredScreen license={engine.auth.license} username={engine.auth.user?.username} onActivate={engine.activateLicense} onGenerate={engine.generateLicense} onLogout={engine.logout} />;
  }

  return (
    <div className={`kashtrix-app flex min-h-screen font-sans transition-colors duration-200 ${themeMode === 'dark' ? 'dark bg-[#0F0817] text-[#F1EAFA]' : 'bg-[#F8F7FA] text-[#1B1024]'}`}>
      <Toaster position="top-right" />

      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        licenseStatus={engine.auth.license.status}
        customerName={engine.auth.license.customerName}
        license={engine.auth.license}
        userRole={engine.auth.user?.role}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className={`flex min-h-screen flex-1 flex-col transition-all duration-200 ${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[288px]'}`}>
        <TopHeader
          activeView={activeView}
          username={engine.auth.user?.username}
          customerName={engine.auth.license.customerName}
          licenseStatus={engine.auth.license.status}
          saveStatus={engine.saveStatus}
          onLogout={engine.logout}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          themeMode={themeMode}
          onThemeChange={setThemeMode}
          onNavigateToLicense={() => setActiveView('license')}
        />

        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          {activeView === 'dashboard' && <KashtrixDashboard onNavigate={view => setActiveView(view as ActiveView)} mediaPort={engine.state.settings.mediaPort} />}
          {activeView === 'channels' && (
            <ChannelDashboard
              channels={engine.state.channels}
              profiles={engine.state.profiles}
              userRole={engine.auth.user?.role}
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
              updateChannel={engine.updateChannel}
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
              licenseStatus={engine.auth.license.status}
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
              licenseStatus={engine.auth.license.status}
              mode="live"
            />
          )}
          {activeView === 'recordings' && <RecordingLibrary realtimeRecordings={engine.recordings} settings={engine.state.settings} deleteRecording={engine.deleteRecording} />}
          {activeView === 'events' && <EventsAndAlerts />}
          {activeView === 'users' && engine.auth.user?.role === 'superadmin' && <UserManagementView currentUser={engine.auth.user?.username} />}
          {activeView === 'settings' && <SettingsView settings={engine.state.settings} onSave={engine.updateSettings} />}
          {activeView === 'license' && <LicenseView status={engine.auth.license.status} license={engine.auth.license} userRole={engine.auth.user?.role} onActivate={engine.activateLicense} onGenerate={engine.generateLicense} fetchLicenses={engine.fetchLicenses} suspendLicense={engine.suspendLicense} resumeLicense={engine.resumeLicense} resetLicense={engine.resetLicense} />}
          {activeView === 'account' && <AccountView username={engine.auth.user?.username} onSave={engine.changeAccount} />}
        </main>
      </div>

      {/* Floating Real-time Telemetry HUD accessible across ALL views */}
      <FloatingTelemetryHud telemetry={telemetry} onNavigate={setActiveView} />
    </div>
  );
};

export default App;
