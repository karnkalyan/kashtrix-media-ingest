import React, { useEffect, useState, useMemo } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  FiActivity,
  FiKey,
  FiList,
  FiSettings,
  FiUser,
  FiUsers,
  FiCheckCircle,
  FiMonitor,
  FiLogOut,
  FiMenu,
  FiX,
  FiSearch,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiArchive,
  FiBarChart2,
  FiShield,
  FiServer,
  FiMaximize,
  FiMinimize,
  FiTv,
  FiBell,
  FiSun,
  FiMoon,
  FiLock,
  FiCpu,
  FiHardDrive,
  FiTerminal,
  FiCopy,
  FiEye,
  FiEyeOff,
  FiRadio,
  FiAward,
  FiLogIn,
  FiZap,
  FiLayers,
  FiMove,
  FiPlayCircle,
  FiRefreshCw,
} from "react-icons/fi";
import { FaBroadcastTower } from "react-icons/fa";
import ChannelDashboard from "./components/JobQueue";
import SystemMonitor from "./components/monitor";
import { IngestServerView } from "./components/IngestServerView";
import useEngine from "./hooks/useTranscoder";
import { AppSettings, LicenseInfo } from "./types";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import StatusBadge from "./components/ui/StatusBadge";
import ProtocolBadge from "./components/ui/ProtocolBadge";
import CodeField from "./components/ui/CodeField";
import Tabs from "./components/ui/Tabs";
import KashtrixDashboard from "./components/KashtrixDashboard";
import RecordingLibrary from "./components/RecordingLibrary";
import EventsAndAlerts from "./components/EventsAndAlerts";
import UserManagementView from "./components/UserManagementView";
import TranscodeStudio from "./components/TranscodeStudio";
import VodPlayoutView from "./components/VodPlayoutView";
import SystemAdminView from "./components/SystemAdminView";
import { MuxView } from "./components/MuxView";
import { sendRealtime, subscribeRealtime } from "./services/realtime";

type ActiveView =
  | "dashboard"
  | "channels"
  | "vod"
  | "mux"
  | "transcode"
  | "live-server"
  | "monitor"
  | "ingest"
  | "recordings"
  | "events"
  | "system-admin"
  | "users"
  | "settings"
  | "license"
  | "account";
type ThemeMode = "light" | "dark" | "system";

const LICENSE_MODULE_OPTIONS = [
  {
    id: "channels",
    label: "Channels",
    description: "Channel composer, transcoding profiles and playout control.",
  },
  {
    id: "live-server",
    label: "Live Server",
    description:
      "Incoming RTMP/SRT streams, history, relays and live monitoring.",
  },
  {
    id: "ingest-server",
    label: "Ingest Server",
    description: "Device/stream recording controls and professional encoding.",
  },
  {
    id: "streamops",
    label: "StreamOps",
    description: "StreamOps control-plane and operational workspace.",
  },
  {
    id: "vod-playout",
    label: "VOD Playout",
    description: "Video-on-demand library and playout operations.",
  },
  {
    id: "mux",
    label: "MPTS Multiplexer",
    description: "Multi-program transport stream multiplexer with DVB PSI/SI and CBR null stuffing.",
  },
  {
    id: "transcode-queue-items",
    label: "Transcode Queue",
    description: "Queue access controlled by the signed numeric item limit.",
  },
] as const;

const hasLicenseModule = (license: LicenseInfo, module?: string) => {
  if (!module) return true;
  if (!license || license.status !== "activated") return false;
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const modules = (license.modules || []).map(normalize);
  return modules.includes(normalize(module));
};

const inputClass =
  "h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-sans text-[12px] text-[#1B1024] outline-none transition-colors focus:border-[#4A1B7A] placeholder:text-[#6F6078]";

/* ═══════════════════════════════════════════
   OFFICIAL KASHTRIX STREAMOPS LOGO
   ═══════════════════════════════════════════ */
const KashtrixLogo: React.FC<{
  size?: number;
  variant?: "wordmark" | "full" | "icon";
}> = ({ variant = "wordmark" }) => {
  if (variant === "icon") {
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
          (e.currentTarget as HTMLImageElement).src =
            "/logo-full-with text.png";
        }}
      />
    </div>
  );
};

const SessionRestoreScreen: React.FC = () => (
  <div
    className="grid min-h-screen place-items-center bg-[#F8F7FA] px-6 dark:bg-[#100819]"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex w-full max-w-[280px] flex-col items-center rounded-2xl border border-[#E8DFF0] bg-white px-7 py-8 text-center shadow-sm dark:border-[#371F59] dark:bg-[#190E28]">
      <div className="w-44">
        <KashtrixLogo />
      </div>
      <FiRefreshCw className="mt-5 animate-spin text-[#7C3AED]" size={22} />
      <p className="mt-3 text-[12px] font-semibold text-[#351147] dark:text-[#E2D1F9]">
        Restoring your secure session…
      </p>
    </div>
  </div>
);

/* ═══════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════ */
const LoginScreen: React.FC<{
  onLogin: (username: string, password: string) => Promise<void>;
}> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onLogin(username, password);
      toast.success("Welcome back!");
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
                (e.currentTarget as HTMLImageElement).src =
                  "/logo-full-with text.png";
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
              Enterprise-grade IPTV management, OTT content delivery, master
              recording archives, and media infrastructure control plane.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FaBroadcastTower size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">
                  Ultra-Low Latency
                </span>
                <p className="text-xs font-semibold text-white mt-0.5">
                  HLS, DASH, RTMP & SRT
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FiCpu size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">
                  Hardware Acceleration
                </span>
                <p className="text-xs font-semibold text-white mt-0.5">
                  NVENC, AMF, QSV & CPU
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FiArchive size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">
                  Master Recording
                </span>
                <p className="text-xs font-semibold text-white mt-0.5">
                  Broadcast Vault & Preview
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-xs flex items-start gap-3">
              <div className="rounded-lg bg-white/10 p-2 text-[#C4B5FD] shrink-0 mt-0.5">
                <FiShield size={16} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD]">
                  High Availability
                </span>
                <p className="text-xs font-semibold text-white mt-0.5">
                  Real-time Telemetry & Health
                </p>
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
                  (e.currentTarget as HTMLImageElement).src =
                    "/logo-full-with text.png";
                }}
              />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEFF] border border-[#DDD6FE] px-3 py-0.5 text-[11px] font-semibold text-[#7C3AED] dark:bg-[#311754] dark:border-[#A78BFA]/30 dark:text-[#C4B5FD] mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" />
              <span>StreamOps Control Plane</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-[#1B1024] dark:text-white">
              Welcome back
            </h2>
            <p className="mt-1 text-xs text-[#6F6078] dark:text-[#B9A5CD]">
              Sign in to KASHTRIX StreamOps operations console
            </p>
          </div>

          {/* Desktop Heading */}
          <div className="hidden lg:block mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEFF] border border-[#DDD6FE] px-3 py-0.5 text-[11px] font-semibold text-[#7C3AED] dark:bg-[#311754] dark:border-[#A78BFA]/30 dark:text-[#C4B5FD] mb-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" />
              <span>StreamOps Control Plane</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-[#1B1024] dark:text-white">
              Welcome back
            </h2>
            <p className="mt-1 text-xs text-[#6F6078] dark:text-[#B9A5CD]">
              Sign in to KASHTRIX StreamOps operations console
            </p>
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
                  onChange={(e) => setUsername(e.target.value)}
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
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#94A3B8] hover:text-[#4A1B7A] dark:text-[#64748B] dark:hover:text-[#A78BFA] transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
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
              <FaBroadcastTower className="text-[#E11D48]" size={11} /> Live
              Ingest
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
const SettingsView: React.FC<{
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<any>;
}> = ({ settings, onSave }) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
      toast.success("Configuration saved");
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
          <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">
            System Settings
          </h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
            Server ports, hardware acceleration defaults and network options
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
            Network Ports & Protocols
          </h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              RTMP Ingest Port
            </label>
            <input
              type="number"
              className={inputClass}
              value={form.rtmpPort || 1935}
              onChange={(e) =>
                setForm((p) => ({ ...p, rtmpPort: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              HTTP Media Distribution Port
            </label>
            <input
              type="number"
              className={inputClass}
              value={form.mediaPort || 8080}
              onChange={(e) =>
                setForm((p) => ({ ...p, mediaPort: Number(e.target.value) }))
              }
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
            Transcoder Hardware Defaults
          </h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              Default Video Preset
            </label>
            <input
              className={inputClass}
              value={(form as any).defaultPreset || "medium"}
              onChange={(e) =>
                setForm((p) => ({ ...p, defaultPreset: e.target.value }) as any)
              }
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-4 shadow-xs lg:col-span-2 dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#E8DFF0]/60 pb-3 dark:border-[#311B4E]/60">
            <div>
              <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
                Harddisk Storage & Safety Thresholds
              </h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
                Configure harddisk safety limits to prevent disk exhaustion,
                filesystem write locks, and corruption
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span
                className={`text-[12px] font-semibold px-2 py-0.5 rounded ${
                  form.storageSafetyEnabled !== false
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                }`}
              >
                {form.storageSafetyEnabled !== false
                  ? "Safety Thresholds Enabled"
                  : "Safety Disabled"}
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#4A1B7A] focus:ring-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59]"
                checked={form.storageSafetyEnabled !== false}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    storageSafetyEnabled: e.target.checked,
                  }))
                }
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
                Disable New Recordings (% Used)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={50}
                  max={99}
                  className={inputClass}
                  disabled={form.storageSafetyEnabled === false}
                  value={form.storageThresholdPercent ?? 90}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      storageThresholdPercent: Math.max(
                        50,
                        Math.min(99, Number(e.target.value)),
                      ),
                    }))
                  }
                />
                <span className="absolute right-3 top-2 text-[11px] font-bold text-[#6F6078] dark:text-[#B9A5CD]">
                  %
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#8E78A6]">
                Default 90% (10% reserve). Blocks new recordings when disk
                reaches this percentage.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
                Emergency Stop Active Recordings (% Used)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={60}
                  max={99}
                  className={inputClass}
                  disabled={form.storageSafetyEnabled === false}
                  value={form.storageCriticalThresholdPercent ?? 95}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      storageCriticalThresholdPercent: Math.max(
                        60,
                        Math.min(99, Number(e.target.value)),
                      ),
                    }))
                  }
                />
                <span className="absolute right-3 top-2 text-[11px] font-bold text-[#6F6078] dark:text-[#B9A5CD]">
                  %
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#8E78A6]">
                Default 95% (5% reserve). Stops running recordings before 100%
                full crash.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
                Minimum Free Space Reserve (MB)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={100}
                  step={100}
                  className={inputClass}
                  disabled={form.storageSafetyEnabled === false}
                  value={form.storageMinFreeMb ?? 500}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      storageMinFreeMb: Math.max(100, Number(e.target.value)),
                    }))
                  }
                />
                <span className="absolute right-3 top-2 text-[11px] font-bold text-[#6F6078] dark:text-[#B9A5CD]">
                  MB
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#8E78A6]">
                Default 500 MB. Minimum absolute free space required on target
                drive.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   ACCOUNT VIEW
   ═══════════════════════════════════════════ */
const AccountView: React.FC<{
  username?: string;
  onSave: (payload: {
    username: string;
    currentPassword: string;
    newPassword?: string;
  }) => Promise<any>;
}> = ({ username = "", onSave }) => {
  const [nextUsername, setNextUsername] = useState(username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (newPassword && newPassword.length < 4)
      return toast.error("New password must be at least 4 characters");
    setSaving(true);
    try {
      await onSave({
        username: nextUsername,
        currentPassword,
        newPassword: newPassword || undefined,
      });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Account updated");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-workspace page-stack space-y-4 max-w-4xl">
      <div className="border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">
          Account Settings
        </h1>
        <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
          Administrator profile and authentication credentials
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F4EEFF] font-display font-bold text-[#4A1B7A] dark:bg-[#371F59] dark:text-[#C4B5FD]">
              {username.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-[#1B1024] dark:text-white">
                {username}
              </p>
              <p className="text-[10px] text-[#6F6078] uppercase font-bold dark:text-[#B9A5CD]">
                StreamOps Administrator
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-3 shadow-xs lg:col-span-2 dark:bg-[#190E28] dark:border-[#311B4E]">
          <h2 className="font-display text-[14px] font-bold text-[#1B1024] dark:text-white">
            Login Credentials
          </h2>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              Username
            </label>
            <input
              className={inputClass}
              value={nextUsername}
              onChange={(e) => setNextUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              Current Password
            </label>
            <input
              className={inputClass}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
              New Password
            </label>
            <input
              className={inputClass}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={12}
              placeholder="Leave blank to keep unchanged"
            />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !currentPassword}
            className="flex h-8 items-center justify-center rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] disabled:opacity-50 dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
          >
            {saving ? "Updating..." : "Update Credentials"}
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
  license: LicenseInfo;
  userRole?: string;
  onActivate: (key: string) => Promise<any>;
  resetLicense: () => Promise<any>;
}> = ({ license, userRole, onActivate, resetLicense }) => {
  const inputClass =
    "w-full rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-3 py-1.5 text-[12px] text-[#1B1024] outline-none focus:border-[#6D32D9] dark:bg-[#211335] dark:border-[#371F59] dark:text-white";
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  const activate = async () => {
    setLoading(true);
    try {
      await onActivate(key.trim());
      toast.success("Secure license validated and activated");
      setKey("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const deactivate = async () => {
    setLoading(true);
    try {
      await resetLicense();
      toast.success(
        "Local key removed. Waiting for secure revalidation from License Manager.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="license-workspace page-stack space-y-4">
      <div className="border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <h1 className="font-display text-[18px] font-bold text-[#1B1024] dark:text-white">
          Secure License
        </h1>
        <p className="mt-0.5 text-[12px] text-[#6F6078] dark:text-[#B9A5CD]">
          Ed25519-signed entitlements with expiry-based offline operation and
          background server updates
        </p>
      </div>

      <div className="max-w-4xl rounded-xl border border-[#E8DFF0] bg-white p-4 space-y-4 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">
              Current installation
            </h2>
            <p className="mt-0.5 text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
              {license.reason || "Online license session is healthy."}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
              license.status === "activated"
                ? "bg-[#D1FAE5] text-[#16A36A] dark:bg-[#064E3B] dark:text-[#34D399]"
                : "bg-[#FEE2E2] text-[#DC3545] dark:bg-[#450A0A] dark:text-[#FCA5A5]"
            }`}
          >
            {license.status}
            {license.status === "activated" && license.validationMode
              ? ` · ${license.validationMode}`
              : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 text-[12px] sm:grid-cols-2 dark:bg-[#211335] dark:border-[#371F59]">
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              License ID
            </span>
            <p className="truncate font-mono text-[#1B1024] dark:text-white">
              {license.licenseSerial || license.licenseId || "Not activated"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Entitlement version
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.entitlementVersion ?? "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Last validated
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.validatedAt
                ? new Date(license.validatedAt).toLocaleString()
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Recording devices
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.maxRecordingDevices ?? 0} simultaneous
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Transcode queue items
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.maxTranscodeQueueItems ?? 0} jobs
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Customer / client
            </span>
            <p className="truncate text-[#1B1024] dark:text-white">
              {license.customerName || "Not specified"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Customer email
            </span>
            <p className="truncate text-[#1B1024] dark:text-white">
              {license.customerEmail || "Not specified"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Valid from
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.validFrom
                ? new Date(license.validFrom).toLocaleString()
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Expires
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.expiresAt
                ? new Date(license.expiresAt).toLocaleString()
                : license.status === "activated"
                  ? "Never"
                  : "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Activation allowance
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.maxActivations ?? "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Client platform
            </span>
            <p className="truncate font-mono text-[#1B1024] dark:text-white">
              {license.clientPlatform || "—"}
              {license.clientAppVersion
                ? ` · v${license.clientAppVersion}`
                : ""}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
              Remote activation
            </span>
            <p className="font-mono text-[#1B1024] dark:text-white">
              {license.remoteActivationReady
                ? "Ready — secure mTLS connection"
                : license.status === "activated"
                  ? "License installed"
                  : "Connecting"}
            </p>
          </div>
        </div>

        <CodeField
          value={license.clientId || ""}
          label="Installation client ID"
        />
        <CodeField
          value={license.provisioningId || ""}
          label="License provisioning ID (paste into License Manager)"
        />
        <CodeField
          value={license.systemHwid || ""}
          label="Application-scoped HWID"
        />

        <div className="grid gap-2 sm:grid-cols-3">
          {LICENSE_MODULE_OPTIONS.map((module) => {
            const enabled = hasLicenseModule(license, module.id);
            return (
              <div
                key={module.id}
                className={`rounded-lg border p-3 ${
                  enabled
                    ? "border-[#B9E8D2] bg-[#F0FDF4] dark:border-[#166534] dark:bg-[#052E24]"
                    : "border-[#E8DFF0] bg-[#F8F7FA] opacity-60 dark:border-[#371F59] dark:bg-[#211335]"
                }`}
              >
                <p className="text-[11px] font-bold text-[#1B1024] dark:text-white">
                  {module.label}
                </p>
                <p className="mt-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                  {enabled ? "Licensed" : "Not licensed"}
                </p>
              </div>
            );
          })}
        </div>

        {license.entitlements &&
          Object.keys(license.entitlements).length > 0 && (
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 dark:border-[#371F59] dark:bg-[#211335]">
              <p className="mb-2 text-[10px] font-bold uppercase text-[#6F6078] dark:text-[#B9A5CD]">
                Signed entitlement values
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(license.entitlements).map(([code, value]) => (
                  <div
                    key={code}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="font-mono text-[#1B1024] dark:text-white">
                      {code}
                    </span>
                    <span className="font-bold text-[#6D32D9]">
                      {typeof value === "boolean"
                        ? value
                          ? "Enabled"
                          : "Disabled"
                        : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        <div className="border-t border-[#E8DFF0] pt-4 dark:border-[#311B4E]">
          <label className="mb-1 block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD]">
            Secure License Manager JWT
          </label>
          <textarea
            className={`${inputClass} h-24 resize-none font-mono text-[11px]`}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="Paste the one-time license JWT issued by Secure License Manager"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={activate}
              disabled={loading || !key.trim()}
              className="flex h-8 items-center justify-center rounded-lg bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] disabled:opacity-50 dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
            >
              {loading ? "Validating…" : "Validate & Activate"}
            </button>
            {userRole === "superadmin" && license.status === "activated" && (
              <button
                type="button"
                onClick={deactivate}
                disabled={loading}
                className="h-8 rounded-lg border border-[#F1B7BF] px-4 text-[12px] font-semibold text-[#DC3545] hover:bg-[#FEF2F2] disabled:opacity-50 dark:border-[#7F1D1D] dark:hover:bg-[#450A0A]"
              >
                Remove local activation
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
            License generation, revocation, activation bans and module updates
            are managed only in Secure License Manager.
          </p>
        </div>
      </div>
    </div>
  );
};

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
  allowedRoles?: string[];
}

const navItems: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: FiBarChart2,
    group: "Main",
    iconColor: "text-[#7C3AED]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(124,58,237,0.45)]",
    licenseModule: "streamops",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "channels",
    label: "Channels Playout",
    icon: FiTv,
    group: "Operations",
    iconColor: "text-[#9333EA]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(147,51,234,0.45)]",
    licenseModule: "channels",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "vod",
    label: "VOD Playout",
    icon: FiPlayCircle,
    group: "Operations",
    iconColor: "text-[#10B981]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(16,185,129,0.45)]",
    licenseModule: "vod-playout",
    allowedRoles: ["superadmin", "admin", "user", "operator", "archive"],
  },
  {
    id: "mux",
    label: "MPTS Multiplexer",
    icon: FiLayers,
    group: "Operations",
    iconColor: "text-[#8B5CF6]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(139,92,246,0.45)]",
    badge: "MPTS",
    badgeColor: "bg-[#8B5CF6]",
    licenseModule: "streamops",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "transcode",
    label: "Transcode Studio",
    icon: FiZap,
    group: "Operations",
    iconColor: "text-[#D946EF]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(217,70,239,0.45)]",
    badge: "GPU",
    badgeColor: "bg-[#D946EF]",
    licenseModule: "transcode-queue-items",
    allowedRoles: ["superadmin", "admin", "user", "operator", "archive"],
  },
  {
    id: "ingest",
    label: "Ingest Server",
    icon: FaBroadcastTower,
    group: "Operations",
    iconColor: "text-[#E11D48]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(225,29,72,0.45)]",
    badge: "REC",
    badgeColor: "bg-[#E11D48]",
    licenseModule: "ingest-server",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "live-server",
    label: "Live Server",
    icon: FiServer,
    group: "Operations",
    iconColor: "text-[#059669]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(5,150,105,0.45)]",
    badge: "LIVE",
    badgeColor: "bg-[#059669]",
    licenseModule: "live-server",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "recordings",
    label: "Recording Library",
    icon: FiArchive,
    group: "Media & Archive",
    iconColor: "text-[#EA580C]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(234,88,12,0.45)]",
    licenseModule: "ingest-server",
    allowedRoles: ["superadmin", "admin", "user", "operator", "archive"],
  },
  {
    id: "monitor",
    label: "System Telemetry",
    icon: FiActivity,
    group: "Observability",
    iconColor: "text-[#0284C7]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(2,132,199,0.45)]",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "events",
    label: "Events & Alerts",
    icon: FiBell,
    group: "Observability",
    iconColor: "text-[#EA580C]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(234,88,12,0.45)]",
    allowedRoles: ["superadmin", "admin", "user", "operator"],
  },
  {
    id: "system-admin",
    label: "System Admin",
    icon: FiServer,
    group: "System & Admin",
    iconColor: "text-[#0284C7]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(2,132,199,0.45)]",
    badge: "NET/SYS",
    badgeColor: "bg-[#0284C7]",
    allowedRoles: ["superadmin", "admin"],
  },
  {
    id: "users",
    label: "User Management",
    icon: FiUsers,
    group: "System & Admin",
    iconColor: "text-[#7C3AED]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(124,58,237,0.45)]",
    allowedRoles: ["superadmin", "admin"],
  },
  {
    id: "settings",
    label: "Engine Settings",
    icon: FiSettings,
    group: "System & Admin",
    iconColor: "text-[#475569]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(71,85,105,0.4)]",
    allowedRoles: ["superadmin", "admin"],
  },
  {
    id: "license",
    label: "License Admin",
    icon: FiKey,
    group: "System & Admin",
    iconColor: "text-[#E11D48]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(225,29,72,0.45)]",
    allowedRoles: ["superadmin", "admin"],
  },
  {
    id: "account",
    label: "Account Profile",
    icon: FiUser,
    group: "System & Admin",
    iconColor: "text-[#0D9488]",
    iconShadow: "drop-shadow-[0_4px_6px_rgba(13,148,136,0.45)]",
  },
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
}> = ({
  activeView,
  setActiveView,
  collapsed,
  onToggle,
  licenseStatus,
  customerName,
  license,
  userRole,
  mobileOpen,
  onMobileClose,
}) => {
  const visibleItems = useMemo(() => {
    return navItems.filter((item) => {
      // Role-based filtering: if allowedRoles is defined, user's role must be in the list
      if (
        item.allowedRoles &&
        userRole &&
        !item.allowedRoles.includes(userRole)
      )
        return false;
      // Operational entitlements apply to every role, including administrators.
      return hasLicenseModule(license, item.licenseModule);
    });
  }, [license, userRole]);

  const groups = useMemo(() => {
    const list: { name: string; items: NavItem[] }[] = [];
    visibleItems.forEach((item) => {
      let g = list.find((x) => x.name === item.group);
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
      {mobileOpen && (
        <div className="drawer-overlay lg:hidden" onClick={onMobileClose} />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-[#E8EDF5] bg-white transition-all duration-200 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E] ${
          mobileOpen
            ? "w-[288px] translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        } ${collapsed && !mobileOpen ? "lg:w-[72px]" : "lg:w-[288px]"}`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-center border-b border-[#E8EDF5] px-3 dark:border-[#311B4E]">
          <div className="flex items-center justify-center w-full overflow-hidden">
            <KashtrixLogo
              variant={collapsed && !mobileOpen ? "icon" : "wordmark"}
            />
          </div>
        </div>

        {/* Navigation Items Grouped */}
        <nav
          className={`flex-1 overflow-y-auto py-4 space-y-4 scrollbar-hide font-sans ${collapsed && !mobileOpen ? "px-2" : "px-3"}`}
        >
          {groups.map((group) => (
            <div key={group.name} className="space-y-1.5">
              {(!collapsed || mobileOpen) && (
                <div className="px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#64748B] dark:text-[#C4B5FD] select-none">
                  {group.name}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                const isCollapsed = collapsed && !mobileOpen;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveView(item.id);
                      onMobileClose();
                    }}
                    className={`group relative flex h-11 w-full items-center rounded-xl text-left transition-all duration-150 ${
                      isActive
                        ? "bg-[#F3EEFF] text-[#1E1B4B] font-semibold border-l-4 border-[#7C3AED] dark:bg-[#311754] dark:text-white dark:border-[#A78BFA] shadow-2xs"
                        : "hover:bg-[#F8FAFC] dark:hover:bg-[#281640]"
                    } ${isCollapsed ? "justify-center px-0" : "justify-between px-3"}`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div
                      className={`flex items-center ${isCollapsed ? "justify-center w-full" : "gap-3 overflow-hidden"}`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent shrink-0 transition-transform duration-150 group-hover:scale-110">
                        <Icon
                          size={19}
                          className={`${item.iconColor} filter ${item.iconShadow}`}
                        />
                      </div>

                      {!isCollapsed && (
                        <span
                          className={`truncate text-[14px] transition-colors ${
                            isActive
                              ? "text-[#1E1B4B] dark:text-white font-bold"
                              : "text-[#334155] dark:text-white font-semibold group-hover:text-[#0F172A] group-hover:dark:text-white"
                          }`}
                        >
                          {item.label}
                        </span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.badge ? (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs ${item.badgeColor || "bg-[#7C3AED]"}`}
                          >
                            {item.badge}
                          </span>
                        ) : (
                          <FiChevronRight
                            size={14}
                            className="text-[#94A3B8] group-hover:text-[#64748B] dark:text-[#8E78A6] dark:group-hover:text-white transition-transform duration-150 group-hover:translate-x-0.5"
                          />
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
        {!collapsed || mobileOpen ? (
          <div className="border-t border-[#E8EDF5] p-3.5 dark:border-[#311B4E]">
            <div className="rounded-2xl border border-[#E8EDF5] bg-[#F8FAFC] p-3 flex items-center justify-between shadow-2xs dark:bg-[#211335] dark:border-[#371F59]">
              <div className="space-y-0.5 overflow-hidden pr-2">
                <div className="flex items-center gap-2 font-bold text-[13px] text-[#0F172A] dark:text-white">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {licenseStatus === "activated" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${licenseStatus === "activated" ? "bg-[#10B981]" : "bg-[#DC3545]"}`}
                    />
                  </span>
                  <span className="truncate">
                    {licenseStatus === "activated"
                      ? "Secure License Active"
                      : "License Required"}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-[#64748B] truncate dark:text-[#B9A5CD]">
                  {licenseStatus === "activated"
                    ? customerName || "Online validation healthy"
                    : "Licensed modules disabled"}
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E0F2FE] text-[#0284C7] shrink-0 dark:bg-[#371F59] dark:text-[#A78BFA]">
                <FiAward size={16} />
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#E8EDF5] p-2 text-center dark:border-[#311B4E]">
            <div
              className={`mx-auto grid h-9 w-9 place-items-center rounded-xl bg-[#F8FAFC] dark:bg-[#211335] ${licenseStatus === "activated" ? "text-[#10B981]" : "text-[#DC3545]"}`}
              title={
                licenseStatus === "activated"
                  ? "License Active"
                  : "License Required"
              }
            >
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
  if (typeof bytes !== "number" || bytes <= 0 || isNaN(bytes)) return "0 B/s";
  const bits = bytes * 8;
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bits) / Math.log(k));
  if (i < 0) return "0 bps";
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
  storageDetails?: {
    mount: string;
    size: number;
    used: number;
    available: number;
    free?: number;
    usePercent: number;
    freePercent: number;
    isWarning: boolean;
    isFull: boolean;
    isCritical: boolean;
    canRecord: boolean;
    deadlinePercent?: number;
    sizeFmt: string;
    usedFmt: string;
    availableFmt: string;
  };
}

const useGlobalTelemetry = (): GlobalTelemetryState => {
  const [telemetry, setTelemetry] = useState<GlobalTelemetryState>({
    cpuLoad: 0,
    memLoad: 0,
    diskLoad: 0,
    gpuLoad: 0,
    gpuModel: "Auto-Detecting GPU...",
    vramFmt: "—",
    vramPercent: 0,
    lastRx: 0,
    lastTx: 0,
    uptimeFmt: "Active",
    lastUpdated: Date.now(),
  });

  useEffect(() => {
    let mounted = true;
    const applyTelemetry = (data: any) => {
      if (mounted && data) {
          const totalRx =
            typeof data.lastRx === "number"
              ? data.lastRx
              : (data.networkDetails || []).reduce(
                  (acc: number, item: any) => acc + (item.rx_sec || 0),
                  0,
                );
          const totalTx =
            typeof data.lastTx === "number"
              ? data.lastTx
              : (data.networkDetails || []).reduce(
                  (acc: number, item: any) => acc + (item.tx_sec || 0),
                  0,
                );

          setTelemetry({
            cpuLoad: typeof data.cpuLoad === "number" ? data.cpuLoad : 0,
            memLoad: typeof data.memLoad === "number" ? data.memLoad : 0,
            diskLoad:
              typeof data.diskLoad === "number"
                ? data.diskLoad
                : data.storageDetails?.usePercent || 0,
            gpuLoad:
              data.gpuDetails?.load !== undefined ? data.gpuDetails.load : 0,
            gpuModel: data.gpuDetails?.model || "Hardware Graphics Accelerator",
            vramFmt: data.gpuDetails?.vramFmt || "Dynamic",
            vramPercent:
              data.gpuDetails?.memoryLoad !== undefined
                ? data.gpuDetails.memoryLoad
                : 0,
            lastRx: totalRx,
            lastTx: totalTx,
            uptimeFmt: data.uptimeFmt || "Active",
            storageDetails: data.storageDetails || undefined,
            lastUpdated: Date.now(),
          });
      }
    };
    const unsubscribe = subscribeRealtime(
      message => {
        if (message.type === "system_stats" && message.payload) applyTelemetry(message.payload);
      },
      isConnected => {
        if (isConnected) sendRealtime({ type: "systeminfo" });
      },
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return telemetry;
};

/* ═══════════════════════════════════════════
   FLOATING TELEMETRY HUD WIDGET (DRAGGABLE)
   ═══════════════════════════════════════════ */
const FloatingTelemetryHud: React.FC<{
  telemetry: GlobalTelemetryState;
  onNavigate: (view: ActiveView) => void;
}> = ({ telemetry, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem("kashtrix-hud-minimized") === "true";
    } catch {
      return false;
    }
  });

  // Draggable position state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    () => {
      try {
        const saved = localStorage.getItem("kashtrix-hud-pos");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            return parsed;
          }
        }
      } catch {}
      return null;
    },
  );

  const hudRef = React.useRef<HTMLDivElement>(null);

  // Keep inside viewport bounds on resize
  useEffect(() => {
    const handleResize = () => {
      if (!position) return;
      const el = hudRef.current;
      const width = el?.offsetWidth || 288;
      const height = el?.offsetHeight || 60;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      const clampedX = Math.min(Math.max(8, position.x), maxX);
      const clampedY = Math.min(Math.max(8, position.y), maxY);
      if (clampedX !== position.x || clampedY !== position.y) {
        const newPos = { x: clampedX, y: clampedY };
        setPosition(newPos);
        try {
          localStorage.setItem("kashtrix-hud-pos", JSON.stringify(newPos));
        } catch {}
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position]);

  // Clean Pointer Drag Handler attached ONLY to the drag handle icon & header bar
  const startDragging = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return; // Do not drag if clicking buttons

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;

    const el = hudRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const initPosX = position ? position.x : rect.left;
    const initPosY = position ? position.y : rect.top;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      const width = el.offsetWidth || 288;
      const height = el.offsetHeight || 60;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);

      const nextX = Math.min(Math.max(8, initPosX + dx), maxX);
      const nextY = Math.min(Math.max(8, initPosY + dy), maxY);

      setPosition({ x: nextX, y: nextY });
    };

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      const dx = upEv.clientX - startX;
      const dy = upEv.clientY - startY;
      const width = el.offsetWidth || 288;
      const height = el.offsetHeight || 60;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);

      const finalX = Math.min(Math.max(8, initPosX + dx), maxX);
      const finalY = Math.min(Math.max(8, initPosY + dy), maxY);

      const newPos = { x: finalX, y: finalY };
      setPosition(newPos);
      try {
        localStorage.setItem("kashtrix-hud-pos", JSON.stringify(newPos));
      } catch {}
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const handlePillClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const toggleMinimized = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !minimized;
    setMinimized(next);
    try {
      localStorage.setItem("kashtrix-hud-minimized", String(next));
    } catch {}
  };

  const resetPosition = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition(null);
    try {
      localStorage.removeItem("kashtrix-hud-pos");
    } catch {}
  };

  const style: React.CSSProperties = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : { right: "16px", bottom: "16px" };

  const isNearTop = Boolean(position && position.y < 360);

  return (
    <div ref={hudRef} style={style} className="fixed z-50 select-none">
      {/* Expanded Floating Card (Anchored directly above the pill with 0 pill shifting) */}
      {isOpen && (
        <div
          className={`floating-hud-card animate-hud-pop absolute right-0 w-72 sm:w-80 rounded-2xl border border-[#E8DFF0] bg-white/98 p-3.5 shadow-2xl backdrop-blur-xl dark:bg-[#190E28]/98 dark:border-[#371F59] ${
            isNearTop
              ? "top-full mt-2.5 origin-top-right"
              : "bottom-full mb-2.5 origin-bottom-right"
          }`}
        >
          <div
            onPointerDown={startDragging}
            className="flex items-center justify-between border-b border-[#E8DFF0] pb-2 dark:border-[#311B4E] cursor-grab active:cursor-grabbing"
            title="Drag header to move HUD"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A36A] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#16A36A]"></span>
              </span>
              <span className="font-display text-[13px] font-bold text-[#1B1024] dark:text-white">
                Live Telemetry HUD
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {position && (
                <button
                  type="button"
                  onClick={resetPosition}
                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-[#F4EEFF] text-[#7C3AED] hover:bg-[#EDE9FE] dark:bg-[#311754] dark:text-[#C4B5FD] transition-colors"
                  title="Reset Position to Bottom Right"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white transition-colors"
                title="Close"
              >
                <FiX size={14} />
              </button>
            </div>
          </div>

          <div className="mt-2.5 space-y-2 text-[11px]">
            {/* CPU */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#E2D1F9]">
                  <FiCpu
                    size={12}
                    className="text-[#6D32D9] dark:text-[#C4B5FD]"
                  />{" "}
                  CPU Engine
                </span>
                <span className="font-mono font-bold text-[#1B1024] dark:text-white">
                  {telemetry.cpuLoad.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#311B4E]">
                <div
                  className="h-full rounded-full bg-[#7C3AED] dark:bg-[#A78BFA]"
                  style={{
                    width: `${Math.min(100, Math.max(0, telemetry.cpuLoad))}%`,
                  }}
                />
              </div>
            </div>

            {/* GPU */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#E2D1F9]">
                  <FiZap
                    size={12}
                    className="text-amber-500 dark:text-amber-400"
                  />{" "}
                  GPU Acceleration
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {telemetry.gpuLoad.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#311B4E]">
                <div
                  className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
                  style={{
                    width: `${Math.min(100, Math.max(0, telemetry.gpuLoad))}%`,
                  }}
                />
              </div>
              <div className="mt-0.5 text-[9px] text-[#6F6078] dark:text-[#D8C6E8] truncate">
                {telemetry.gpuModel}
              </div>
            </div>

            {/* RAM */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#E2D1F9]">
                  <FiLayers
                    size={12}
                    className="text-[#2563EB] dark:text-[#93C5FD]"
                  />{" "}
                  System RAM
                </span>
                <span className="font-mono font-bold text-[#2563EB] dark:text-[#93C5FD]">
                  {telemetry.memLoad.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#311B4E]">
                <div
                  className="h-full rounded-full bg-[#2563EB] dark:bg-[#60A5FA]"
                  style={{
                    width: `${Math.min(100, Math.max(0, telemetry.memLoad))}%`,
                  }}
                />
              </div>
            </div>

            {/* Storage Harddisk */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="flex items-center gap-1 text-[#6F6078] dark:text-[#E2D1F9]">
                  <FiHardDrive
                    size={12}
                    className={
                      telemetry.diskLoad >= 90
                        ? "text-rose-600 dark:text-rose-400"
                        : telemetry.diskLoad >= 85
                          ? "text-amber-500"
                          : "text-[#16A36A] dark:text-[#34D399]"
                    }
                  />
                  Storage Disk{" "}
                  {telemetry.storageDetails?.mount
                    ? `(${telemetry.storageDetails.mount})`
                    : ""}
                </span>
                <div className="flex items-center gap-1.5">
                  {telemetry.diskLoad >= 90 && (
                    <span className="rounded bg-rose-600/10 px-1 py-0.2 text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 animate-pulse">
                      Full (5-10% Deadline)
                    </span>
                  )}
                  <span
                    className={`font-mono font-bold ${telemetry.diskLoad >= 90 ? "text-rose-600 dark:text-rose-400" : telemetry.diskLoad >= 85 ? "text-amber-600" : "text-[#1B1024] dark:text-white"}`}
                  >
                    {telemetry.diskLoad.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F4EEFF] dark:bg-[#311B4E]">
                <div
                  className={`h-full rounded-full transition-all ${
                    telemetry.diskLoad >= 90
                      ? "bg-rose-600 dark:bg-rose-500"
                      : telemetry.diskLoad >= 85
                        ? "bg-amber-500 dark:bg-amber-400"
                        : "bg-[#16A36A] dark:bg-[#34D399]"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, telemetry.diskLoad))}%`,
                  }}
                />
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[9px] text-[#6F6078] dark:text-[#D8C6E8]">
                <span>
                  {telemetry.storageDetails
                    ? `${telemetry.storageDetails.usedFmt} / ${telemetry.storageDetails.sizeFmt}`
                    : `${telemetry.diskLoad.toFixed(1)}% used`}
                </span>
                <span
                  className={
                    telemetry.diskLoad >= 90
                      ? "font-bold text-rose-600 dark:text-rose-400"
                      : ""
                  }
                >
                  {telemetry.storageDetails?.availableFmt
                    ? `${telemetry.storageDetails.availableFmt} Free`
                    : "5-10% Reserve"}
                </span>
              </div>
            </div>

            {/* Network */}
            <div className="floating-hud-inner rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 dark:bg-[#211335] dark:border-[#371F59]">
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 font-semibold text-[#6F6078] dark:text-[#E2D1F9]">
                  <FiRadio
                    size={11}
                    className="text-[#16A36A] dark:text-[#6EE7B7]"
                  />{" "}
                  Network I/O
                </span>
                <span className="font-mono text-[#16A36A] dark:text-[#6EE7B7] font-bold">
                  Active
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between font-mono font-bold text-[11px]">
                <span className="text-[#2563EB] dark:text-[#93C5FD]">
                  ↓ {formatNetSpeed(telemetry.lastRx)}
                </span>
                <span className="text-[#16A36A] dark:text-[#6EE7B7]">
                  ↑ {formatNetSpeed(telemetry.lastTx)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#E8DFF0] pt-2 dark:border-[#311B4E]">
            <span className="text-[10px] text-[#6F6078] dark:text-[#D8C6E8]">
              Uptime:{" "}
              <strong className="font-mono text-[#1B1024] dark:text-white">
                {telemetry.uptimeFmt}
              </strong>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate("monitor");
                setIsOpen(false);
              }}
              className="flex items-center gap-1 rounded-md bg-[#7C3AED] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#6D28D9] transition-colors"
            >
              Open Full Monitor <FiChevronRight size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Floating HUD Pill Button with Drag Grip */}
      {!minimized ? (
        <div className="floating-hud-pill flex items-center shadow-xl rounded-full border border-[#E8DFF0] bg-white/95 backdrop-blur-md p-1 gap-1.5 dark:bg-[#190E28]/96 dark:border-[#371F59] hover:shadow-2xl transition-shadow">
          <div
            onPointerDown={startDragging}
            className="hud-drag-handle pl-2 pr-0.5 text-[#A195AD] dark:text-[#A78BFA] hover:text-[#7C3AED] cursor-grab active:cursor-grabbing"
            title="Drag to move HUD anywhere"
          >
            <FiMove size={12} />
          </div>

          <button
            type="button"
            onClick={handlePillClick}
            className="flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold text-[#1B1024] hover:bg-[#F4EEFF] dark:text-white dark:hover:bg-[#2D1A45] transition-colors cursor-pointer"
            title="Click to toggle live telemetry details"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A36A] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A36A]"></span>
            </span>
            <span className="flex items-center gap-1">
              <FiCpu size={11} className="text-[#6D32D9] dark:text-[#C4B5FD]" />
              <span className="font-mono font-bold text-[11px] text-[#1B1024] dark:text-white">
                {telemetry.cpuLoad.toFixed(0)}%
              </span>
            </span>
            <span className="text-[#E8DFF0] dark:text-[#371F59]">|</span>
            <span className="flex items-center gap-1">
              <FiZap size={11} className="text-amber-500 dark:text-amber-400" />
              <span className="font-mono font-bold text-[11px] text-amber-600 dark:text-amber-400">
                {telemetry.gpuLoad.toFixed(0)}%
              </span>
            </span>
            <span className="text-[#E8DFF0] dark:text-[#371F59]">|</span>
            <span className="flex items-center gap-1">
              <FiHardDrive
                size={11}
                className={
                  telemetry.diskLoad >= 90
                    ? "text-rose-600 dark:text-rose-400 animate-pulse"
                    : "text-[#16A36A] dark:text-[#6EE7B7]"
                }
              />
              <span
                className={`font-mono font-bold text-[11px] ${telemetry.diskLoad >= 90 ? "text-rose-600 dark:text-rose-400" : "text-[#1B1024] dark:text-white"}`}
              >
                {telemetry.diskLoad.toFixed(0)}%
              </span>
            </span>
            <span className="text-[#E8DFF0] dark:text-[#371F59]">|</span>
            <span className="font-mono font-bold text-[11px] text-[#16A36A] dark:text-[#6EE7B7]">
              ↓ {formatNetSpeed(telemetry.lastRx)}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleMinimized}
            className="p-1 text-[#6F6078] hover:text-[#1B1024] rounded-full dark:text-[#B9A5CD] dark:hover:text-white transition-colors cursor-pointer"
            title="Minimize Floating Telemetry"
          >
            <FiMinimize size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleMinimized}
          onPointerDown={startDragging}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E8DFF0] bg-white shadow-lg text-[#7C3AED] hover:bg-[#F4EEFF] dark:bg-[#190E28] dark:border-[#371F59] dark:text-[#A78BFA] dark:hover:bg-[#2D1A45] transition-all cursor-grab active:cursor-grabbing"
          title="Restore System Telemetry HUD (Drag to move)"
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
    dashboard: "Dashboard",
    channels: "Channels",
    monitor: "System Monitor",
    ingest: "Ingest Server",
    recordings: "Recording Library",
    "live-server": "Live Server",
    events: "Events & Alerts",
    "system-admin": "System Administration",
    users: "User Management",
    settings: "Settings",
    license: "License",
    account: "Account",
  };

  const displayTitle = useMemo(() => {
    const baseLabel = viewLabels[activeView] || activeView;
    const isLicenseActive = licenseStatus === "activated";
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
          <h2 className="font-display text-[15px] font-bold text-[#1B1024] dark:text-white">
            {displayTitle}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <input
            type="text"
            placeholder="Search operations..."
            className="h-8 w-52 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[11px] text-[#1B1024] outline-none focus:border-[#7C3AED] dark:bg-[#0F172A] dark:border-[#334155] dark:text-white dark:placeholder-[#94A3B8]"
          />
          <FiSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078] dark:text-[#94A3B8]"
          />
        </div>

        {/* License Status Badge */}
        {licenseStatus === "activated" ? (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-bold text-[#16A36A] hover:bg-[#DCFCE7] dark:border-[#059669]/60 dark:bg-[#064E3B]/40 dark:text-[#34D399] dark:hover:bg-[#064E3B]/70 transition-colors shadow-xs"
            title="License is Active. Click to view License."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] dark:bg-[#34D399]" />
            Licensed
          </button>
        ) : licenseStatus === "expired" ? (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#DC3545] hover:bg-[#FEE2E2] dark:border-[#DC3545]/60 dark:bg-[#450A0A]/60 dark:text-[#FCA5A5] dark:hover:bg-[#450A0A] transition-colors shadow-xs animate-pulse"
            title="License has expired! Click to activate a license."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#DC3545]" />
            License Expired
          </button>
        ) : licenseStatus === "connecting" ? (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1 text-[11px] font-bold text-[#D97706] hover:bg-[#FEF3C7] dark:border-[#D97706]/60 dark:bg-[#451A03]/50 dark:text-[#FCD34D] dark:hover:bg-[#451A03]/80 transition-colors shadow-xs"
            title="Validating the license with Secure License Manager."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
            Validating License
          </button>
        ) : (
          <button
            type="button"
            onClick={onNavigateToLicense}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#DC3545] hover:bg-[#FEE2E2] dark:border-[#DC3545]/60 dark:bg-[#450A0A]/60 dark:text-[#FCA5A5] dark:hover:bg-[#450A0A] transition-colors shadow-xs"
            title="Secure license required. Click to activate a license."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#DC3545]" />
            License Required
          </button>
        )}

        {/* Theme Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            const nextMode = themeMode === "dark" ? "light" : "dark";
            onThemeChange(nextMode);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] transition-colors hover:bg-[#F4EEFF] hover:text-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#D97706] dark:hover:bg-[#2D1A45]"
          title={`Switch to ${themeMode === "dark" ? "Light" : "Dark"} Mode`}
        >
          {themeMode === "dark" ? (
            <FiSun size={15} className="text-[#D97706]" />
          ) : (
            <FiMoon size={15} className="text-[#4A1B7A]" />
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-[#F8F7FA] dark:hover:bg-[#211335]"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F4EEFF] text-[12px] font-bold text-[#4A1B7A] dark:bg-[#371F59] dark:text-[#A78BFA]">
              {username?.charAt(0).toUpperCase() || "U"}
            </span>
            <span className="hidden text-[12px] font-semibold text-[#1B1024] dark:text-white sm:block">
              {username || "Admin"}
            </span>
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-lg border border-[#E8DFF0] bg-white p-1 shadow-lg dark:bg-[#190E28] dark:border-[#311B4E]">
                <button
                  onClick={() => {
                    onLogout();
                    setUserMenuOpen(false);
                  }}
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
    const rawHash = window.location.hash.replace("#", "");
    const hash = (rawHash === "recording-library" ? "recordings" : rawHash) as ActiveView;
    const validViews: ActiveView[] = [
      "dashboard",
      "channels",
      "vod",
      "mux",
      "transcode",
      "live-server",
      "monitor",
      "ingest",
      "recordings",
      "events",
      "system-admin",
      "users",
      "settings",
      "license",
      "account",
    ];
    if (hash && validViews.includes(hash)) return hash;
    const saved = localStorage.getItem("kashtrix-active-view") as ActiveView;
    if (saved && validViews.includes(saved)) return saved;
  } catch {}
  return "dashboard";
};

const UnlicensedInstallationGate: React.FC<{
  license: LicenseInfo;
  username?: string;
  userRole?: string;
  integrityWarning?: boolean;
  signedIn?: boolean;
  onActivate: (key: string) => Promise<any>;
  onLogout: () => void;
}> = ({
  license,
  username,
  userRole,
  integrityWarning,
  signedIn,
  onActivate,
  onLogout,
}) => {
  const [licenseKey, setLicenseKey] = useState("");
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [activating, setActivating] = useState(false);
  const canActivate = userRole === "admin" || userRole === "superadmin";
  const copy = async (value: string | undefined, label: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };
  const pasteLicenseKey = async () => {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) throw new Error("Clipboard does not contain a license key");
      setLicenseKey(value);
      toast.success("License key pasted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read clipboard",
      );
    }
  };
  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = licenseKey.trim();
    if (!canActivate || !key || activating) return;
    setActivating(true);
    try {
      await onActivate(key);
      setLicenseKey("");
      toast.success("Secure license validated and activated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "License activation failed",
      );
    } finally {
      setActivating(false);
    }
  };
  const statusLabel =
    license.status === "connecting"
      ? "Validating installation"
      : license.remoteActivationReady
        ? "Waiting for License Manager"
        : license.status.replaceAll("_", " ");

  return (
    <div
      data-license-gate="required"
      className="fixed inset-0 z-[9999] grid min-h-screen place-items-center overflow-y-auto bg-[#0D0714] p-4 text-white"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-violet-700/25 blur-3xl" />
        <div className="absolute -bottom-40 right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-fuchsia-700/15 blur-3xl" />
      </div>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="license-gate-title"
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#190E28]/95 shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-950/40">
              <FiShield size={20} />
            </span>
            <div>
              <h1
                id="license-gate-title"
                className="text-[17px] font-extrabold"
              >
                Secure license required
              </h1>
              <p className="mt-1 text-[11px] text-[#C9B7DA]">
                This installation is locked. Only provisioning information is
                available.
              </p>
            </div>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${license.remoteActivationReady ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {(integrityWarning ||
            [
              "expired",
              "suspended",
              "revoked",
              "client_banned",
              "hardware_mismatch",
            ].includes(license.status)) && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[11px] text-rose-200">
              {integrityWarning
                ? "The license gate UI was modified in the browser. It has been restored; protected operations remain blocked by the backend."
                : license.reason ||
                  "This license is not permitted to run the application."}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#A992BC]">
                Installation status
              </span>
              <p className="mt-2 text-[12px] font-bold capitalize">
                {license.status.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#B9A5CD]">
                {license.reason || "Waiting for secure online validation."}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#A992BC]">
                Signed-in administrator
              </span>
              <p className="mt-2 text-[12px] font-bold">
                {username || "Loading installation…"}
              </p>
              <p className="mt-1 text-[10px] text-[#B9A5CD]">
                Application features remain unavailable until activation.
              </p>
            </div>
          </div>

          {[
            { label: "Installation client ID", value: license.clientId },
            {
              label: "Application-scoped HWID",
              value: license.systemHwid || license.hardwareId,
            },
            { label: "License provisioning ID", value: license.provisioningId },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-white/10 bg-[#100818] p-3.5"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#A992BC]">
                  {item.label}
                </span>
                <button
                  type="button"
                  disabled={!item.value}
                  onClick={() => void copy(item.value, item.label)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[9px] font-bold text-[#D8C7E7] hover:bg-white/5 disabled:opacity-40"
                >
                  <FiCopy size={10} /> Copy
                </button>
              </div>
              <p className="break-all font-mono text-[10px] leading-relaxed text-white">
                {item.value || "Preparing secure installation identity…"}
              </p>
            </div>
          ))}

          <form
            onSubmit={activate}
            className="rounded-xl border border-violet-400/25 bg-violet-500/[0.08] p-4"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-violet-300">
                <FiKey size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="unlicensed-license-key"
                  className="block text-[10px] font-bold uppercase tracking-wider text-violet-200"
                >
                  Secure License Manager JWT
                </label>
                <p className="mt-1 text-[10px] leading-relaxed text-[#B9A5CD]">
                  Paste the generated Ed25519-signed license key for this
                  installation.
                </p>
              </div>
            </div>
            {canActivate ? (
              <>
                <div className="mt-3 flex overflow-hidden rounded-lg border border-white/15 bg-[#100818] focus-within:border-violet-400">
                  <input
                    id="unlicensed-license-key"
                    type={showLicenseKey ? "text" : "password"}
                    value={licenseKey}
                    onChange={(event) => setLicenseKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste generated license JWT"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-[10px] text-white outline-none placeholder:text-[#806D91]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLicenseKey((visible) => !visible)}
                    aria-label={
                      showLicenseKey ? "Hide license key" : "Show license key"
                    }
                    className="grid w-10 place-items-center border-l border-white/10 text-[#C9B7DA] hover:bg-white/5"
                  >
                    {showLicenseKey ? (
                      <FiEyeOff size={14} />
                    ) : (
                      <FiEye size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void pasteLicenseKey()}
                    className="border-l border-white/10 px-3 text-[10px] font-bold text-[#D8C7E7] hover:bg-white/5"
                  >
                    Paste
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={activating || !licenseKey.trim()}
                  className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white shadow-lg shadow-violet-950/30 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activating ? (
                    <FiRefreshCw className="animate-spin" size={13} />
                  ) : (
                    <FiShield size={13} />
                  )}
                  {activating ? "Validating license…" : "Validate & Activate"}
                </button>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[10px] text-amber-200">
                Sign in with an administrator or super administrator account to
                install a license key.
              </p>
            )}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="max-w-xl text-[10px] leading-relaxed text-[#B9A5CD]">
              Generate, revalidate or update this installation in Secure License
              Manager. The application unlocks automatically after authenticated
              mTLS validation.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[10px] font-bold hover:bg-white/5"
              >
                <FiRefreshCw size={11} /> Refresh
              </button>
              {signedIn && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[10px] font-bold text-[#251133] hover:bg-[#F1EAF8]"
                >
                  <FiLogOut size={11} /> Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
const App: React.FC = () => {
  const engine = useEngine();
  const telemetry = useGlobalTelemetry();
  const [activeView, setActiveViewState] =
    useState<ActiveView>(getInitialActiveView);
  const [preSelectedTranscodeFile, setPreSelectedTranscodeFile] = useState<{
    id?: string | number;
    name: string;
    path?: string;
    type: "vod" | "recording";
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    () => (localStorage.getItem("kashtrix-theme") as ThemeMode) || "light",
  );
  const [gateRevision, setGateRevision] = useState(0);
  const [licenseGateIntegrityWarning, setLicenseGateIntegrityWarning] =
    useState(false);

  const setActiveView = (view: ActiveView) => {
    setActiveViewState(view);
    try {
      localStorage.setItem("kashtrix-active-view", view);
      if (window.location.hash !== `#${view}`) {
        window.location.hash = view;
      }
    } catch {}
  };

  useEffect(() => {
    const onHashChange = () => {
      const rawHash = window.location.hash.replace("#", "");
      const hash = (rawHash === "recording-library" ? "recordings" : rawHash) as ActiveView;
      const validViews: ActiveView[] = [
        "dashboard",
        "channels",
        "vod",
        "transcode",
        "live-server",
        "monitor",
        "ingest",
        "recordings",
        "events",
        "system-admin",
        "users",
        "settings",
        "license",
        "account",
      ];
      if (hash && validViews.includes(hash)) {
        setActiveViewState(hash);
        localStorage.setItem("kashtrix-active-view", hash);
        if (rawHash !== hash) window.history.replaceState(null, "", `#${hash}`);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem("kashtrix-theme", themeMode);
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [themeMode]);

  useEffect(() => {
    if (
      !engine.auth.token ||
      !engine.auth.user ||
      engine.auth.license.status === "activated"
    ) {
      setLicenseGateIntegrityWarning(false);
      return;
    }
    let repairQueued = false;
    const observer = new MutationObserver(() => {
      if (repairQueued) return;
      repairQueued = true;
      window.setTimeout(() => {
        repairQueued = false;
        if (!document.querySelector('[data-license-gate="required"]')) {
          setLicenseGateIntegrityWarning(true);
          setGateRevision((revision) => revision + 1);
        }
      }, 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [
    engine.auth.license.status,
    engine.auth.token,
    engine.auth.user,
  ]);

  useEffect(() => {
    if (!engine.auth.token || !engine.auth.user) return;
    const role = engine.auth.user?.role;
    const item = navItems.find((navItem) => navItem.id === activeView);
    const isSuperadmin = role === "superadmin";
    const defaultView = "dashboard";

    // Role-based view guard: if the current nav item has allowedRoles and user's role is not in it, redirect
    if (item?.allowedRoles && role && !item.allowedRoles.includes(role)) {
      setActiveView(defaultView as ActiveView);
      return;
    }
    // License module check
    if (
      item?.licenseModule &&
      !hasLicenseModule(engine.auth.license, item.licenseModule)
    ) {
      setActiveView(defaultView as ActiveView);
    } else if (item?.id === "users" && !isSuperadmin) {
      setActiveView(defaultView as ActiveView);
    }
  }, [activeView, engine.auth.token, engine.auth.user, engine.auth.license]);

  if (engine.isAuthChecking) return <SessionRestoreScreen />;
  if (!engine.auth.token || !engine.auth.user)
    return <LoginScreen onLogin={engine.login} />;
  if (engine.auth.license.status !== "activated") {
    return (
      <>
        <Toaster position="top-right" />
        <UnlicensedInstallationGate
          key={gateRevision}
          license={engine.auth.license}
          username={engine.auth.user?.username}
          userRole={engine.auth.user?.role}
          integrityWarning={licenseGateIntegrityWarning}
          signedIn={Boolean(engine.auth.token)}
          onActivate={engine.activateLicense}
          onLogout={engine.logout}
        />
      </>
    );
  }
  return (
    <div
      className={`kashtrix-app flex min-h-screen font-sans transition-colors duration-200 ${themeMode === "dark" ? "dark bg-[#0F0817] text-[#F1EAFA]" : "bg-[#F8F7FA] text-[#1B1024]"}`}
    >
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

      <div
        className={`flex min-h-screen flex-1 flex-col transition-all duration-200 ${sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[288px]"}`}
      >
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
          onNavigateToLicense={() => setActiveView("license")}
        />

        {/* Harddisk Storage Capacity Alert Banner */}
        {telemetry.diskLoad >=
          (engine.state.settings.storageThresholdPercent
            ? engine.state.settings.storageThresholdPercent - 5
            : 85) && (
          <div
            className={`mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs transition-all ${
              telemetry.diskLoad >=
              (engine.state.settings.storageThresholdPercent || 90)
                ? "border-rose-300 bg-rose-50/95 text-rose-950 shadow-xs dark:border-rose-700/70 dark:bg-gradient-to-r dark:from-rose-950/90 dark:via-[#200a15] dark:to-[#17070f] dark:text-rose-100 dark:shadow-[0_0_24px_rgba(225,29,72,0.12)]"
                : "border-amber-300 bg-amber-50/95 text-amber-950 shadow-xs dark:border-amber-700/70 dark:bg-gradient-to-r dark:from-amber-950/90 dark:via-[#221204] dark:to-[#180c03] dark:text-amber-100 dark:shadow-[0_0_24px_rgba(245,158,11,0.12)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ${
                  telemetry.diskLoad >=
                  (engine.state.settings.storageThresholdPercent || 90)
                    ? "bg-rose-600 ring-rose-300/60 dark:ring-rose-500/40 animate-pulse"
                    : "bg-amber-600 ring-amber-300/60 dark:ring-amber-500/40"
                }`}
              >
                !
              </span>
              <div className="space-y-0.5">
                <p className="font-bold leading-snug">
                  {engine.state.settings.storageSafetyEnabled === false ? (
                    <span className="text-amber-700 dark:text-amber-300 font-bold">
                      STORAGE CAPACITY NOTICE (Safety Enforcement
                      Disabled):{" "}
                    </span>
                  ) : telemetry.diskLoad >=
                    (engine.state.settings.storageCriticalThresholdPercent ||
                      95) ? (
                    <span className="text-rose-700 dark:text-rose-300 font-extrabold">
                      CRITICAL STORAGE EMERGENCY (&lt;
                      {100 -
                        (engine.state.settings
                          .storageCriticalThresholdPercent || 95)}
                      % free):{" "}
                    </span>
                  ) : telemetry.diskLoad >=
                    (engine.state.settings.storageThresholdPercent || 90) ? (
                    <span className="text-rose-700 dark:text-rose-300 font-bold">
                      STORAGE LIMIT REACHED (
                      {100 -
                        (engine.state.settings.storageThresholdPercent || 90)}
                      % Reserve Enforced):{" "}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300 font-bold">
                      STORAGE CAPACITY WARNING:{" "}
                    </span>
                  )}
                  <span className="text-rose-900 dark:text-rose-100 font-normal">
                    Harddisk storage is{" "}
                    <strong className="font-bold text-rose-950 dark:text-white">
                      {telemetry.diskLoad.toFixed(1)}% full
                    </strong>
                    {telemetry.storageDetails
                      ? ` (${telemetry.storageDetails.usedFmt} / ${telemetry.storageDetails.sizeFmt}, ${telemetry.storageDetails.availableFmt} free)`
                      : ""}
                    .
                  </span>
                </p>
                <p className="text-[11px] text-rose-800/90 dark:text-rose-200/80">
                  {engine.state.settings.storageSafetyEnabled === false
                    ? "Storage safety threshold enforcement is turned off in Settings. Filesystem capacity is approaching limit."
                    : telemetry.diskLoad >=
                        (engine.state.settings.storageThresholdPercent || 90)
                      ? "Starting new recordings is blocked to protect disk integrity. Please delete old recordings or free disk space."
                      : "Please monitor free storage space and archive or clean up old recordings."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveView("recordings")}
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors shadow-xs ${
                  telemetry.diskLoad >=
                  (engine.state.settings.storageThresholdPercent || 90)
                    ? "border-rose-300 bg-white text-rose-900 hover:bg-rose-100 dark:border-rose-700/80 dark:bg-rose-900/50 dark:text-rose-100 dark:hover:bg-rose-800 dark:hover:text-white"
                    : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-700/80 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-800 dark:hover:text-white"
                }`}
              >
                Manage Recordings
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          {activeView === "dashboard" && (
            <KashtrixDashboard
              onNavigate={(view) => setActiveView(view as ActiveView)}
              mediaPort={engine.state.settings.mediaPort}
            />
          )}
          {activeView === "channels" && (
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
          {activeView === "monitor" && <SystemMonitor />}
          {activeView === "ingest" && (
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
          {activeView === "live-server" && (
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
          {activeView === "vod" && (
            <VodPlayoutView
              settings={engine.state.settings}
              profiles={engine.state.profiles}
              channels={engine.state.channels}
              addChannel={engine.addChannel}
              onNavigateToTranscode={(file) => {
                setPreSelectedTranscodeFile(file);
                setActiveView("transcode");
              }}
              onNavigateToChannels={() => setActiveView("channels")}
            />
          )}
          {activeView === "mux" && (
            <MuxView
              api={engine.api}
              channels={engine.state.channels}
              profiles={engine.state.profiles}
              settings={engine.state.settings}
              license={engine.auth.license}
              userRole={engine.auth.user?.role}
              ws={null}
            />
          )}
          {activeView === "transcode" && (
            <TranscodeStudio
              userRole={engine.auth.user?.role}
              profiles={engine.state.profiles}
              preSelectedFile={preSelectedTranscodeFile}
              onClearPreSelected={() => setPreSelectedTranscodeFile(null)}
              onNavigateToRecordings={() => setActiveView("recordings")}
              onNavigateToVod={() => setActiveView("vod")}
            />
          )}
          {activeView === "recordings" && (
            <RecordingLibrary
              realtimeRecordings={engine.recordings}
              settings={engine.state.settings}
              deleteRecording={engine.deleteRecording}
              onOpenTranscodeStudio={(file) => {
                if (file && file.name) {
                  setPreSelectedTranscodeFile(file);
                }
                setActiveView("transcode");
              }}
            />
          )}
          {activeView === "events" && <EventsAndAlerts />}
          {activeView === "system-admin" && (
            <SystemAdminView
              token={engine.auth.token}
              onNavigate={setActiveView}
            />
          )}
          {activeView === "users" &&
            (engine.auth.user?.role === "superadmin" ||
              engine.auth.user?.role === "admin") && (
              <UserManagementView currentUser={engine.auth.user?.username} />
            )}
          {activeView === "settings" && (
            <SettingsView
              settings={engine.state.settings}
              onSave={engine.updateSettings}
            />
          )}
          {activeView === "license" && (
            <LicenseView
              license={engine.auth.license}
              userRole={engine.auth.user?.role}
              onActivate={engine.activateLicense}
              resetLicense={engine.resetLicense}
            />
          )}
          {activeView === "account" && (
            <AccountView
              username={engine.auth.user?.username}
              onSave={engine.changeAccount}
            />
          )}
        </main>
      </div>

      {/* Floating Real-time Telemetry HUD accessible across views (hidden on System Monitor page) */}
      {activeView !== "monitor" && (
        <FloatingTelemetryHud
          telemetry={telemetry}
          onNavigate={setActiveView}
        />
      )}
    </div>
  );
};

export default App;
