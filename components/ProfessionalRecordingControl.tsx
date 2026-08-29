import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiChevronDown,
  FiDisc,
  FiEye,
  FiEyeOff,
  FiRefreshCw,
  FiVideo,
  FiSquare,
  FiMaximize2,
  FiMinimize2,
  FiHardDrive,
  FiPlus,
  FiTrash2,
  FiCheck,
  FiCheckCircle,
  FiStar,
  FiEdit3,
  FiCamera,
  FiMic,
  FiFolder,
  FiSliders,
  FiPlay,
  FiPause,
  FiSave,
  FiActivity,
  FiTv,
  FiLayers,
  FiDownload,
  FiUpload,
  FiCopy,
  FiAlertCircle,
  FiLock,
  FiUnlock,
  FiGlobe,
  FiShare2,
  FiExternalLink,
} from "react-icons/fi";
import {
  IngestRecordingOptions,
  RecordingEncoderCapability,
  RecordingProfileSummary,
  StorageLocation,
  TranscodingProfile,
  VideoCodec,
  DecklinkFormat,
  StorageStatusResponse,
} from "../types";
import { DEFAULT_DECKLINK_FORMATS } from "../constants";
import DetailDrawer from "./ui/DetailDrawer";
import KashtrixMediaPlayer from "./ui/KashtrixMediaPlayer";
import RecordingElapsedTimer from "./RecordingElapsedTimer";
import { toast } from "react-hot-toast";
import { subscribeRealtime } from "../services/realtime";

type Format = IngestRecordingOptions["formats"][number];
const PROJECT_RECORDINGS_PATH = "media/recordings";

export interface SavedRecordingPreset {
  id: string;
  name: string;
  sourceType: "device" | "ingest";
  videoDevice?: string;
  audioDevice?: string;
  selectedStreamKey?: string;
  defaultEditingEnabled?: boolean;
  config: Partial<IngestRecordingOptions> & { defaultEditingEnabled?: boolean };
  createdAt: string;
}

const DEFAULT_PRESETS: SavedRecordingPreset[] = [
  {
    id: "preset-decklink-50mbps",
    name: "Broadcast Master 1080p50 (50 Mbps NVENC CBR)",
    sourceType: "device",
    videoDevice: "Intensity Pro 4K",
    audioDevice: "Intensity Pro 4K",
    config: {
      autoRecord: false,
      fileName: "{channel}_{date}_{time}",
      formats: ["mp4"],
      encoder: "nvidia",
      videoCodec: "h264",
      rateControl: "cbr",
      resolution: "1920x1080",
      framerate: 50,
      videoBitrate: 50000,
      maxBitrate: 50000,
      preset: "fast",
      gopSize: 60,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      videoInput: "hdmi",
      storageType: "local",
      storagePath: PROJECT_RECORDINGS_PATH,
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "preset-broadcast-15mbps",
    name: "Broadcast HD (1080p) (15 Mbps CBR)",
    sourceType: "device",
    videoDevice: "Intensity Pro 4K",
    audioDevice: "Intensity Pro 4K",
    config: {
      autoRecord: false,
      fileName: "{channel}_{date}_{time}",
      formats: ["mp4"],
      encoder: "nvidia",
      videoCodec: "h264",
      rateControl: "cbr",
      resolution: "1920x1080",
      framerate: 50,
      videoBitrate: 15000,
      maxBitrate: 15000,
      preset: "fast",
      gopSize: 60,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      videoInput: "hdmi",
      storageType: "local",
      storagePath: PROJECT_RECORDINGS_PATH,
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "preset-4k-master",
    name: "4K UHD Master Archive (80 Mbps HEVC NVENC)",
    sourceType: "device",
    videoDevice: "Intensity Pro 4K",
    audioDevice: "Intensity Pro 4K",
    config: {
      autoRecord: false,
      fileName: "{channel}_{date}_{time}",
      formats: ["mp4", "mov"],
      encoder: "nvidia",
      videoCodec: "hevc",
      rateControl: "cbr",
      resolution: "3840x2160",
      framerate: 50,
      videoBitrate: 80000,
      maxBitrate: 80000,
      preset: "medium",
      gopSize: 60,
      pixelFormat: "yuv422p",
      audioCodec: "aac",
      audioBitrate: 320,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      videoInput: "hdmi",
      storageType: "local",
      storagePath: PROJECT_RECORDINGS_PATH,
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "preset-compact-720p",
    name: "Compact HD 720p (4 Mbps x264)",
    sourceType: "device",
    config: {
      autoRecord: false,
      fileName: "{channel}_{date}_{time}",
      formats: ["mp4"],
      encoder: "cpu",
      videoCodec: "h264",
      rateControl: "cbr",
      resolution: "1280x720",
      framerate: 30,
      videoBitrate: 4000,
      maxBitrate: 4000,
      preset: "fast",
      gopSize: 60,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      audioBitrate: 128,
      sampleRate: 44100,
      audioChannels: 2,
      continuous: true,
      storageType: "local",
      storagePath: PROJECT_RECORDINGS_PATH,
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "preset-ingest-copy",
    name: "Live Ingest Direct Archive (Stream Copy)",
    sourceType: "ingest",
    config: {
      autoRecord: false,
      fileName: "{channel}_{date}_{time}",
      formats: ["mp4"],
      encoder: "copy",
      videoCodec: "h264",
      rateControl: "cbr",
      resolution: "source",
      framerate: 50,
      videoBitrate: 20000,
      maxBitrate: 20000,
      preset: "fast",
      gopSize: 60,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      storageType: "local",
      storagePath: PROJECT_RECORDINGS_PATH,
    },
    createdAt: new Date().toISOString(),
  },
];

const normalizeClientStoragePath = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return PROJECT_RECORDINGS_PATH;
  const forward = raw.replace(/\\/g, "/");
  const projectMedia = forward.match(/^(?:[a-z]:)?\/?media(?:\/(.*))?$/i);
  if (!projectMedia) return raw;
  const suffix = String(projectMedia[1] || "").replace(/^\/+|\/+$/g, "");
  return suffix ? `media/${suffix}` : "media";
};

const defaultConfig: IngestRecordingOptions = {
  autoRecord: false,
  fileName: "{channel}_{date}_{time}",
  formats: ["mp4"],
  encoder: "auto",
  encoderSelectionVersion: 2,
  videoCodec: "h264",
  rateControl: "cbr",
  crf: 20,
  resolution: "source",
  framerate: 25,
  videoBitrate: 20000,
  maxBitrate: 20000,
  preset: "p4",
  gopSize: 50,
  pixelFormat: "yuv420p",
  audioCodec: "aac",
  audioBitrate: 256,
  sampleRate: 48000,
  audioChannels: 2,
  continuous: true,
  storageType: "local",
  storagePath: PROJECT_RECORDINGS_PATH,
  formatCode: "Hi50",
  videoInput: "sdi",
  rawFormat: "uyvy422",
  nvencInterlaceMode: "auto",
  profileOverrides: {},
};

interface Props {
  config?: IngestRecordingOptions;
  setConfig?: React.Dispatch<React.SetStateAction<IngestRecordingOptions>>;
  sourceType?: "ingest" | "device";
  setSourceType?: (value: "ingest" | "device") => void;
  streams?: Record<string, any>;
  selectedStreamKey?: string;
  setSelectedStreamKey?: (value: string) => void;
  videoDevices?: string[];
  audioDevices?: string[];
  videoDevice?: string;
  audioDevice?: string;
  setVideoDevice?: (value: string) => void;
  setAudioDevice?: (value: string) => void;
  refreshDevices?: () => void;
  devicesLoading?: boolean;
  toggleFormat?: (format: Format) => void;
  save?: () => void;
  saving?: boolean;
  start?: () => void;
  isRecordingActive?: boolean;
  isRecordingPaused?: boolean;
  pauseRecording?: () => void | Promise<any>;
  resumeRecording?: () => void | Promise<any>;
  stopRecording?: () => void | Promise<any>;
  profiles?: TranscodingProfile[];
  recordingProfiles?: RecordingProfileSummary[];
  recordingEncoders?: RecordingEncoderCapability[];
  activeRecordings?: any[];
  api?: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const selectClass =
  "mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-800 focus:border-violet-600 focus:outline-none dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA] disabled:opacity-50";
const inputClass =
  "mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-800 focus:border-violet-600 focus:outline-none dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]";
const Label: React.FC<React.PropsWithChildren> = ({ children }) => (
  <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#B9A5CD]">
    {children}
  </label>
);

const ProfessionalRecordingControl: React.FC<Props> = ({
  config = defaultConfig,
  setConfig = () => {},
  sourceType = "device",
  setSourceType = () => {},
  streams = {},
  selectedStreamKey = "",
  setSelectedStreamKey = () => {},
  videoDevices = [],
  audioDevices = [],
  videoDevice = "",
  audioDevice = "",
  setVideoDevice = () => {},
  setAudioDevice = () => {},
  refreshDevices = () => {},
  devicesLoading = false,
  toggleFormat = () => {},
  save = () => {},
  saving = false,
  start = () => {},
  isRecordingActive = false,
  isRecordingPaused = false,
  pauseRecording = () => {},
  resumeRecording = () => {},
  stopRecording = () => {},
  profiles = [],
  recordingProfiles = [],
  recordingEncoders = [],
  activeRecordings = [],
  api,
}) => {
  // Stepper state
  const [activeStep, setActiveStep] = useState<number>(1);

  // Inline setup panels, drawers & modals
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [destinationDrawerOpen, setDestinationDrawerOpen] = useState(false);
  const [saveSetupModalOpen, setSaveSetupModalOpen] = useState(false);
  const [managePresetsOpen, setManagePresetsOpen] = useState(false);
  const [setupNameInput, setSetupNameInput] = useState("");
  const [saveMode, setSaveMode] = useState<"overwrite" | "create">("create");
  const [setupDefaultEditingMode, setSetupDefaultEditingMode] = useState<boolean>(true);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState<string>("");
  const [stopping, setStopping] = useState(false);
  const [pauseActionPending, setPauseActionPending] = useState(false);

  // Network Shares & SMB / FTP Access
  const [networkShares, setNetworkShares] = useState<{
    primaryIp: string;
    customIp?: string | null;
    authMode?: 'anonymous' | 'authenticated';
    interfaces: Array<{ name: string; address: string; internal: boolean }>;
    windowsStatus?: { isWindows: boolean; isShared: boolean; setupCommand?: string };
    smb: { parentPath: string; recordingsPath: string; macUrl?: string; linuxMount?: string; runCommand?: string; instructions: string };
    ftp: { url: string; rootUrl: string; instructions: string };
    http: { url: string; parentUrl: string };
    credentials: { username: string; password: string; permissions: string };
  } | null>(null);
  const [customIpInput, setCustomIpInput] = useState("");
  const [savingCustomIp, setSavingCustomIp] = useState(false);

  // Presets & Active Selection
  const [savedPresets, setSavedPresets] =
    useState<SavedRecordingPreset[]>(DEFAULT_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    "preset-broadcast-15mbps",
  );
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [presetEditingEnabled, setPresetEditingEnabled] = useState(true);
  const [presetPreviewRequest, setPresetPreviewRequest] = useState(0);

  // Database API helper
  const callApi = useCallback(async (endpoint: string, options?: RequestInit) => {
    if (typeof api === "function") {
      return api(endpoint, options);
    }
    const token = localStorage.getItem("kte-auth-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(endpoint, {
      ...options,
      headers: { ...headers, ...((options?.headers as Record<string, string>) || {}) },
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Request failed: ${res.status}`);
    }
    return data;
  }, [api]);

  // Load Network Shares
  const loadNetworkShares = useCallback(async () => {
    try {
      const data = await callApi("/api/ingest/record/network-shares");
      if (data && data.success) {
        setNetworkShares(data);
        if (data.customIp) setCustomIpInput(data.customIp);
      }
    } catch (e) {
      console.warn("[NetworkShares] Failed to load share details:", e);
    }
  }, [callApi]);

  const handleUpdateCustomIp = async (ip: string) => {
    setSavingCustomIp(true);
    try {
      const res = await callApi("/api/ingest/record/network-shares", {
        method: "PUT",
        body: JSON.stringify({ customIp: ip.trim() || null }),
      });
      if (res && res.success) {
        setNetworkShares(res);
        toast.success(ip.trim() ? `Network share IP set to ${ip.trim()}` : "Reset to auto-detected network IP");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to update network share IP");
    } finally {
      setSavingCustomIp(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard!`);
    } else {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success(`${label} copied to clipboard!`);
    }
  };

  // Load Presets from Database on Mount
  const loadPresetsFromDb = useCallback(async () => {
    try {
      const data = await callApi("/api/ingest/record/presets");
      if (Array.isArray(data.presets) && data.presets.length > 0) {
        setSavedPresets(data.presets);
      }
    } catch (err) {
      console.warn("[Presets] Database load failed:", err);
      toast.error("Could not load recording presets from the database");
    }
    try {
      const data = await callApi("/api/recording/presets/default");
      if (data.defaultPresetId) {
        setDefaultPresetId(data.defaultPresetId);
      }
    } catch (err) {
      console.warn("[Presets] Default preset load failed:", err);
    }
  }, [callApi]);

  // Auto-load default preset and network shares on mount
  const defaultPresetLoadedRef = useRef(false);
  const handledPresetPreviewRequestRef = useRef(0);
  useEffect(() => {
    loadPresetsFromDb();
    loadNetworkShares();
  }, [loadPresetsFromDb, loadNetworkShares]);

  useEffect(() => {
    if (defaultPresetLoadedRef.current || !defaultPresetId || savedPresets.length === 0) return;
    const target = savedPresets.find((p) => p.id === defaultPresetId);
    if (target) {
      defaultPresetLoadedRef.current = true;
      setSelectedPresetId(target.id);
      setLoadedPresetId(target.id);
      const shouldEnableEditing = target.defaultEditingEnabled !== undefined
        ? target.defaultEditingEnabled
        : (target.config?.defaultEditingEnabled !== undefined ? target.config.defaultEditingEnabled : true);
      setPresetEditingEnabled(shouldEnableEditing);
      setActiveStep(2);
      setProfileDrawerOpen(false);
      setDestinationDrawerOpen(false);
      setSaveSetupModalOpen(false);
      setManagePresetsOpen(false);
      setPresetPreviewRequest((request) => request + 1);
      if (target.sourceType) setSourceType(target.sourceType);
      if (target.videoDevice !== undefined && typeof setVideoDevice === "function") setVideoDevice(target.videoDevice);
      if (target.audioDevice !== undefined && typeof setAudioDevice === "function") setAudioDevice(target.audioDevice);
      if (target.selectedStreamKey !== undefined && typeof setSelectedStreamKey === "function") setSelectedStreamKey(target.selectedStreamKey);
      if (target.config) {
        setConfig((prev: any) => ({ ...(prev || defaultConfig), ...target.config }));
      }
    }
  }, [defaultPresetId, savedPresets, setSourceType, setVideoDevice, setAudioDevice, setSelectedStreamKey, setConfig]);

  // Selected Profile
  const [profileId, setProfileId] = useState("source-default");

  // Preview & dynamic hardware telemetry state
  const [previewing, setPreviewing] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewStopping, setPreviewStopping] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [activeHlsUrl, setActiveHlsUrl] = useState("");
  const [detectedResolution, setDetectedResolution] = useState("");
  const [detectedFramerate, setDetectedFramerate] = useState("");
  const [detectedPixelFormat, setDetectedPixelFormat] = useState("");
  const [detectedAudioChannels, setDetectedAudioChannels] = useState("");
  const [detectedAudioSampleRate, setDetectedAudioSampleRate] = useState(0);
  const [signalDetected, setSignalDetected] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [deviceFormats, setDeviceFormats] = useState<
    Record<string, DecklinkFormat[]>
  >({});
  const deviceSetupRef = useRef<HTMLDivElement | null>(null);
  const workflowWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const workflowInlinePanelRef = useRef<HTMLDivElement | null>(null);
  const devicePreviewIdRef = useRef<string | null>(null);

  // Destination test connection
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingLocationId, setTestingLocationId] = useState<string | null>(
    null,
  );
  const [testResult, setTestResult] = useState<{
    success: boolean;
    allPassed?: boolean;
    total?: number;
    passed?: number;
    failed?: number;
    message: string;
    directories?: string[];
    results?: Array<{
      id?: string;
      name?: string;
      storageType: string;
      success: boolean;
      message: string;
      path?: string;
      directories?: string[];
    }>;
  } | null>(null);

  // Storage status
  const [storageStatus, setStorageStatus] =
    useState<StorageStatusResponse | null>(null);
  const [autoCreateDailyFolders, setAutoCreateDailyFolders] = useState(true);

  const activeConfig = config || defaultConfig;
  const activeFormats = activeConfig.formats || ["mp4"];
  const loadedPreset = savedPresets.find((preset) => preset.id === loadedPresetId);
  const isPresetLocked = Boolean(loadedPresetId) && !presetEditingEnabled;

  const setPresetEditorVisible = (enabled: boolean) => {
    setPresetEditingEnabled(enabled);
    if (!enabled) {
      setActiveStep(2);
      setProfileDrawerOpen(false);
      setDestinationDrawerOpen(false);
      setSaveSetupModalOpen(false);
      setManagePresetsOpen(false);
    }
  };
  const selectedOutputFormat = activeFormats[activeFormats.length - 1] || "mp4";
  const selectedRecordingProfile = recordingProfiles.find(profile => profile.extension === selectedOutputFormat);
  const standardProfileSelected = ['mov', 'mkv', 'mxf'].includes(selectedOutputFormat);
  const isLockedFormat = standardProfileSelected && !activeConfig.unlockStandardOverride;
  const flvSelected = selectedOutputFormat === 'flv';
  const profileEditorConfig: IngestRecordingOptions = isLockedFormat && selectedRecordingProfile
    ? {
        ...activeConfig,
        encoder: 'standard',
        videoCodec: selectedRecordingProfile.videoCodec,
        rateControl: 'cbr',
        resolution: `${selectedRecordingProfile.width}x${selectedRecordingProfile.height}`,
        framerate: selectedRecordingProfile.frameRate,
        videoBitrate: selectedRecordingProfile.videoBitrate,
        maxBitrate: selectedRecordingProfile.maxBitrate || selectedRecordingProfile.videoBitrate,
        preset: (selectedRecordingProfile.preset || activeConfig.preset) as IngestRecordingOptions['preset'],
        gopSize: selectedRecordingProfile.gop,
        pixelFormat: selectedRecordingProfile.pixelFormat,
        audioCodec: selectedRecordingProfile.audioCodec,
        audioBitrate: selectedRecordingProfile.audioBitrate,
        sampleRate: selectedRecordingProfile.audioSampleRate,
        audioChannels: selectedRecordingProfile.audioChannels,
      }
    : activeConfig;

  // Helper to patch config
  const patch = (values: Partial<IngestRecordingOptions>) => {
    if (typeof setConfig === "function") {
      setConfig((previous) => {
        const current = previous || defaultConfig;
        const next: IngestRecordingOptions = { ...current, ...values };
        if (activeFormats.length === 1 && activeFormats[0] !== 'ts') {
          const extension = activeFormats[0];
          const profileOverride = { ...(current.profileOverrides?.[extension] || {}) };
          if (Object.prototype.hasOwnProperty.call(values, 'videoCodec')) profileOverride.videoCodec = values.videoCodec;
          if (Object.prototype.hasOwnProperty.call(values, 'videoBitrate')) profileOverride.videoBitrate = values.videoBitrate;
          if (Object.prototype.hasOwnProperty.call(values, 'maxBitrate')) profileOverride.maxBitrate = values.maxBitrate;
          if (Object.prototype.hasOwnProperty.call(values, 'audioCodec')) profileOverride.audioCodec = values.audioCodec;
          if (Object.prototype.hasOwnProperty.call(values, 'audioBitrate')) profileOverride.audioBitrate = values.audioBitrate;
          if (Object.prototype.hasOwnProperty.call(values, 'audioChannels')) profileOverride.audioChannels = values.audioChannels;
          if (Object.prototype.hasOwnProperty.call(values, 'sampleRate')) profileOverride.audioSampleRate = values.sampleRate;
          if (Object.prototype.hasOwnProperty.call(values, 'gopSize')) profileOverride.gop = values.gopSize;
          if (Object.prototype.hasOwnProperty.call(values, 'preset')) profileOverride.preset = values.preset;
          if (Object.prototype.hasOwnProperty.call(values, 'pixelFormat')) profileOverride.pixelFormat = values.pixelFormat;
          if (Object.prototype.hasOwnProperty.call(values, 'framerate')) profileOverride.framerate = values.framerate;
          if (Object.prototype.hasOwnProperty.call(values, 'resolution')) profileOverride.resolution = values.resolution;
          next.profileOverrides = {
            ...(current.profileOverrides || {}),
            [extension]: profileOverride,
          };
        }
        return next;
      });
    }
  };

  // Fetch DeckLink / capture formats when device changes
  useEffect(() => {
    if (!videoDevice) return;
    if (deviceFormats[videoDevice]) return;
    const fetchFormats = async () => {
      try {
        const token = localStorage.getItem("kte-auth-token");
        const res = await fetch(
          `/api/ffmpeg/devices/${encodeURIComponent(videoDevice)}/formats`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.formats?.length) {
            setDeviceFormats((prev) => ({
              ...prev,
              [videoDevice]: data.formats,
            }));
            return;
          }
        }
      } catch {}
      setDeviceFormats((prev) => ({
        ...prev,
        [videoDevice]: DEFAULT_DECKLINK_FORMATS,
      }));
    };
    fetchFormats();
  }, [videoDevice, deviceFormats]);

  // Recording elapsed timer synchronized with backend startTime
  const primaryActiveRecording = useMemo(() => {
    if (!activeRecordings || activeRecordings.length === 0) return null;
    return activeRecordings.find((r: any) => r && r.is_active !== false) || activeRecordings[0];
  }, [activeRecordings]);

  const activeRecordingStartTime = useMemo(() => {
    if (!primaryActiveRecording) return 0;
    const raw = primaryActiveRecording.startTime || primaryActiveRecording.start_time || primaryActiveRecording.started_at;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw > 1e11 ? raw : raw * 1000;
    const parsed = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [primaryActiveRecording]);

  const activeRecordingTotalPausedMs = Math.max(
    0,
    Number(primaryActiveRecording?.total_paused_ms ?? primaryActiveRecording?.totalPausedMs) || 0,
  );
  const activeRecordingPauseStartedAt = (() => {
    const raw = primaryActiveRecording?.pause_started_at ?? primaryActiveRecording?.pauseStartedAt;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const parsed = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  })();

  useEffect(() => {
    if (!isRecordingActive) {
      setRecordingElapsed(0);
      return;
    }
    const updateElapsed = () => {
      if (activeRecordingStartTime > 0) {
        const now = Date.now();
        const currentPauseMs = isRecordingPaused && activeRecordingPauseStartedAt > 0
          ? Math.max(0, now - activeRecordingPauseStartedAt)
          : 0;
        setRecordingElapsed(Math.max(0, Math.floor(
          (now - activeRecordingStartTime - activeRecordingTotalPausedMs - currentPauseMs) / 1000,
        )));
      } else {
        setRecordingElapsed((prev) => isRecordingPaused ? prev : prev + 1);
      }
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 500);
    return () => clearInterval(timer);
  }, [
    isRecordingActive,
    isRecordingPaused,
    activeRecordingStartTime,
    activeRecordingPauseStartedAt,
    activeRecordingTotalPausedMs,
  ]);

  // Fetch disk storage status on mount
  const fetchStorageStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("kte-auth-token");
      const res = await fetch("/api/storage/status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setStorageStatus(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStorageStatus();
  }, [fetchStorageStatus]);

  // Check active preview status once on mount or device switch
  useEffect(() => {
    let isMounted = true;
    const checkPreviewStatus = async () => {
      if (sourceType !== "device") return;
      const token = localStorage.getItem("kte-auth-token");
      try {
        const queryParams = new URLSearchParams();
        if (videoDevice) queryParams.set("videoDevice", videoDevice);
        if (audioDevice) queryParams.set("audioDevice", audioDevice);
        const url = `/api/ingest/device-preview/status${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (isMounted && data.active && data.previewId) {
          devicePreviewIdRef.current = data.previewId;
          if (data.videoDevice && !videoDevice && typeof setVideoDevice === "function") {
            setVideoDevice(data.videoDevice);
          }
          if (data.audioDevice && !audioDevice && typeof setAudioDevice === "function") {
            setAudioDevice(data.audioDevice);
          }
          setActiveHlsUrl(
            data.hlsUrl || `/hls/device-preview/${data.previewId}/index.m3u8`,
          );
          setPreviewing(true);
          if (data.detectedResolution)
            setDetectedResolution(data.detectedResolution);
          if (data.detectedFramerate)
            setDetectedFramerate(data.detectedFramerate);
          setDetectedPixelFormat(data.detectedPixelFormat || "");
          setDetectedAudioChannels(data.detectedAudioChannels || "");
          setDetectedAudioSampleRate(
            Number(data.detectedAudioSampleRate) || 0,
          );
          setSignalDetected(data.hasSignal !== false);
        }
      } catch {}
    };
    checkPreviewStatus();
    return () => {
      isMounted = false;
    };
  }, [sourceType, videoDevice, audioDevice]);

  // Subscribe to real-time WebSocket state broadcasts for preview, storage & recording handoff
  useEffect(() => {
    const unsubscribe = subscribeRealtime((msg: any) => {
      if (msg.type === "system_stats" && msg.payload?.storageDetails) {
        setStorageStatus((prev: any) => ({ ...(prev || {}), ...msg.payload.storageDetails, success: true }));
      }
      if (msg.type === "device_preview_state" && msg.payload) {
        const p = msg.payload;
        if (sourceType === "device") {
          if (p.active) {
            const matchesVideo = !videoDevice || p.videoDevice === videoDevice || (p.videoDevice && (p.videoDevice.includes(videoDevice) || videoDevice.includes(p.videoDevice)));
            const matchesAudio = !audioDevice || p.audioDevice === audioDevice || (p.audioDevice && (p.audioDevice.includes(audioDevice) || audioDevice.includes(p.audioDevice)));
            if (matchesVideo || matchesAudio || !videoDevice) {
              devicePreviewIdRef.current = p.previewId;
              setActiveHlsUrl(p.hlsUrl || `/hls/device-preview/${p.previewId}/index.m3u8`);
              setPreviewing(true);
              setSignalDetected(p.hasSignal !== false);
              if (p.detectedResolution || p.resolution) setDetectedResolution(p.detectedResolution || p.resolution);
              if (p.detectedFramerate || p.framerate) setDetectedFramerate(p.detectedFramerate || (p.framerate ? `${p.framerate} fps` : ""));
              if (p.detectedPixelFormat) setDetectedPixelFormat(p.detectedPixelFormat);
              if (p.detectedAudioChannels) setDetectedAudioChannels(p.detectedAudioChannels);
              if (p.detectedAudioSampleRate) setDetectedAudioSampleRate(Number(p.detectedAudioSampleRate) || 0);
            }
          } else if (!p.isRecording && !isRecordingActive) {
            devicePreviewIdRef.current = null;
            setActiveHlsUrl("");
            setPreviewing(false);
          }
        }
      }

      if (msg.type === "recording_started" && msg.payload) {
        const p = msg.payload;
        if (sourceType === "device" && (p.previewId || p.hlsUrl)) {
          devicePreviewIdRef.current = p.previewId;
          setActiveHlsUrl(p.hlsUrl || `/hls/device-preview/${p.previewId}/index.m3u8`);
          setPreviewing(true);
          setSignalDetected(true);
        }
      }
    });
    return () => unsubscribe();
  }, [sourceType, videoDevice, audioDevice, isRecordingActive]);

  // Start Device Preview
  const startSourcePreview = useCallback(async () => {
    if (sourceType === "device") {
      if (!videoDevice && !audioDevice) {
        setPreviewError(
          "Select a video or audio device before starting preview.",
        );
        toast.error("Select a video or audio device before starting preview");
        return;
      }
      setPreviewStarting(true);
      setPreviewError("");
      setSignalDetected(false);
      try {
        const token = localStorage.getItem("kte-auth-token");
        const res = await fetch("/api/ingest/device-preview/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            videoDevice,
            audioDevice,
            videoInput: activeConfig.videoInput,
            formatCode: activeConfig.formatCode,
            resolution:
              activeConfig.resolution === "source"
                ? undefined
                : activeConfig.resolution,
            framerate: activeConfig.framerate,
            rawFormat: activeConfig.rawFormat,
          }),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.message || "Failed to start device preview");
        devicePreviewIdRef.current = data.previewId;
        setActiveHlsUrl(data.hlsUrl);
        setPreviewing(true);
        if (data.detectedResolution)
          setDetectedResolution(data.detectedResolution);
        if (data.detectedFramerate)
          setDetectedFramerate(data.detectedFramerate);
        setDetectedPixelFormat(data.detectedPixelFormat || "");
        setDetectedAudioChannels(data.detectedAudioChannels || "");
        setDetectedAudioSampleRate(
          Number(data.detectedAudioSampleRate) || 0,
        );
        setSignalDetected(data.hasSignal !== false);
        toast.success(`Preview started for ${videoDevice || audioDevice}`);
      } catch (err: any) {
        setPreviewError(err.message || "Device preview error");
        setSignalDetected(false);
        toast.error(err.message || "Failed to start preview");
      } finally {
        setPreviewStarting(false);
      }
    } else {
      if (!selectedStreamKey) {
        setPreviewError("Select an active stream key to preview");
        toast.error("Select an active stream key to preview");
        return;
      }
      const stream = streams[selectedStreamKey];
      const streamName = stream?.name || selectedStreamKey.split("/").pop();
      const app = stream?.app || "live";
      setActiveHlsUrl(`/hls/${app}/${streamName}/index.m3u8`);
      setPreviewing(true);
      setSignalDetected(true);
      setPreviewError("");
      toast.success(`Previewing live stream: ${streamName}`);
    }
  }, [
    sourceType,
    videoDevice,
    audioDevice,
    activeConfig.videoInput,
    activeConfig.formatCode,
    activeConfig.resolution,
    activeConfig.framerate,
    activeConfig.rawFormat,
    selectedStreamKey,
    streams,
  ]);

  // Loading a preset applies several source/config state updates together.
  // Start the existing preview/detection flow only after those values have
  // reached the rendered control, so detection uses the loaded preset source.
  useEffect(() => {
    if (!presetPreviewRequest || handledPresetPreviewRequestRef.current === presetPreviewRequest) return;
    handledPresetPreviewRequestRef.current = presetPreviewRequest;
    if (previewing || previewStarting || isRecordingActive) return;

    const previewTimer = window.setTimeout(() => {
      void startSourcePreview();
    }, 0);
    return () => window.clearTimeout(previewTimer);
  }, [presetPreviewRequest, startSourcePreview, previewing, previewStarting, isRecordingActive]);

  // Stop Device Preview
  const stopPreview = useCallback(
    async (notifyServer = true) => {
      if (previewStopping) return;
      if (isRecordingActive) {
        toast.error("Cannot stop device preview while recording is actively capturing");
        return;
      }
      setPreviewStopping(true);
      const currentId = devicePreviewIdRef.current;
      let serverError = "";
      try {
        if (notifyServer && sourceType === "device") {
          const token = localStorage.getItem("kte-auth-token");
          const response = await fetch("/api/ingest/device-preview/stop", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              previewId: currentId || "current",
              videoDevice: videoDevice || undefined,
              force: false,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(body.error || body.message || "Unable to stop preview");
        }
      } catch (error) {
        serverError =
          error instanceof Error ? error.message : "Unable to stop preview";
      } finally {
        devicePreviewIdRef.current = null;
        setActiveHlsUrl("");
        setPreviewing(false);
        setPreviewStarting(false);
        setPreviewStopping(false);
        setPreviewError("");
        setSignalDetected(false);
        setDetectedResolution("");
        setDetectedFramerate("");
        setDetectedPixelFormat("");
        setDetectedAudioChannels("");
        setDetectedAudioSampleRate(0);
      }
      if (serverError) toast.error(`Preview closed locally: ${serverError}`);
      else toast.success("Preview stopped and capture device released");
    },
    [previewStopping, sourceType, videoDevice, isRecordingActive],
  );

  // Test Storage Connection
  const handleTestStorageConnection = async (
    targetLocation?: StorageLocation,
  ) => {
    setTestingConnection(true);
    if (targetLocation?.id) setTestingLocationId(targetLocation.id);
    else setTestingLocationId(null);
    setTestResult(null);
    try {
      const token = localStorage.getItem("kte-auth-token");
      const payload = targetLocation
        ? { storageLocations: [targetLocation] }
        : activeConfig;

      const res = await fetch("/api/storage/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || "Storage connection test failed");
      setTestResult(data);
      if (data.success) {
        toast.success(data.message || "Storage connection verified!");
      } else {
        toast.error(data.message || "Storage connection check failed");
      }
    } catch (e: any) {
      const failObj = {
        success: false,
        message: e.message || "Connection failed",
      };
      setTestResult(failObj);
      toast.error(failObj.message);
    } finally {
      setTestingConnection(false);
      setTestingLocationId(null);
    }
  };

  // Preset Handlers
  const openSavePresetModal = (mode?: "overwrite" | "create") => {
    const isOverwrite = (mode === "overwrite" || (!mode && Boolean(loadedPresetId))) && Boolean(loadedPreset);
    setSaveMode(isOverwrite ? "overwrite" : "create");
    if (isOverwrite && loadedPreset) {
      setSetupNameInput(loadedPreset.name);
      setSetupDefaultEditingMode(
        loadedPreset.defaultEditingEnabled !== undefined
          ? loadedPreset.defaultEditingEnabled
          : (loadedPreset.config?.defaultEditingEnabled !== undefined ? loadedPreset.config.defaultEditingEnabled : true)
      );
    } else {
      setSetupNameInput(`${sourceName} Preset`);
      setSetupDefaultEditingMode(true);
    }
    setSaveSetupModalOpen(true);
  };

  const handleLoadPreset = async (
    targetPresetId: string,
    options?: { persistToDb?: boolean; notify?: boolean }
  ) => {
    const shouldPersist = options?.persistToDb ?? true;
    const shouldNotify = options?.notify ?? true;
    setSelectedPresetId(targetPresetId);
    const target = savedPresets.find((p) => p.id === targetPresetId);
    if (!target) return;

    setLoadedPresetId(target.id);
    const shouldEnableEditing = target.defaultEditingEnabled !== undefined
      ? target.defaultEditingEnabled
      : (target.config?.defaultEditingEnabled !== undefined ? target.config.defaultEditingEnabled : true);
    setPresetEditorVisible(shouldEnableEditing);
    setPresetPreviewRequest((request) => request + 1);

    if (target.sourceType) {
      setSourceType(target.sourceType);
    }
    if (
      target.videoDevice !== undefined &&
      typeof setVideoDevice === "function"
    ) {
      setVideoDevice(target.videoDevice);
    }
    if (
      target.audioDevice !== undefined &&
      typeof setAudioDevice === "function"
    ) {
      setAudioDevice(target.audioDevice);
    }
    if (
      target.selectedStreamKey !== undefined &&
      typeof setSelectedStreamKey === "function"
    ) {
      setSelectedStreamKey(target.selectedStreamKey);
    }
    if (target.config) {
      patch(target.config);

      // Persist active recording configuration directly into database
      if (shouldPersist) {
        try {
          await callApi("/api/ingest/record/config", {
            method: "PUT",
            body: JSON.stringify({
              autoRecord: !!target.config.autoRecord,
              ...target.config,
            }),
          });
          if (typeof save === "function") {
            save();
          }
        } catch (err) {
          console.warn("[Presets] Failed to store active config in DB on preset load:", err);
        }
      }
    }
    if (shouldNotify) {
      toast.success(`Loaded "${target.name}" (${shouldEnableEditing ? 'Editing Mode' : 'Locked Mode'})`);
    }
  };

  const handleSavePreset = async () => {
    const isOverwriting = saveMode === "overwrite" && Boolean(loadedPresetId);
    const targetId = isOverwriting && loadedPresetId ? loadedPresetId : `preset-${Date.now()}`;
    const defaultName = isOverwriting && loadedPreset ? loadedPreset.name : `${sourceName} Setup (${new Date().toLocaleDateString()})`;
    const name = setupNameInput.trim() || defaultName;

    const newPresetPayload: SavedRecordingPreset = {
      id: targetId,
      name,
      sourceType,
      videoDevice,
      audioDevice,
      selectedStreamKey,
      defaultEditingEnabled: setupDefaultEditingMode,
      config: {
        ...activeConfig,
        formats: activeFormats,
        defaultEditingEnabled: setupDefaultEditingMode,
      },
      createdAt: isOverwriting && loadedPreset?.createdAt ? loadedPreset.createdAt : new Date().toISOString(),
    };

    try {
      const res = await callApi("/api/ingest/record/presets/save", {
        method: "POST",
        body: JSON.stringify(newPresetPayload),
      });
      const updatedList = res.presets || [newPresetPayload, ...savedPresets];
      setSavedPresets(updatedList);
      const savedId = res.preset?.id || newPresetPayload.id;
      setSelectedPresetId(savedId);
      setLoadedPresetId(savedId);
      setSaveSetupModalOpen(false);
      setSetupNameInput("");
      toast.success(
        isOverwriting
          ? `Preset "${name}" modified & updated in database!`
          : `New preset "${name}" saved to database!`
      );
    } catch (err: any) {
      toast.error(err?.message || `Preset "${name}" could not be saved to the database`);
    }
  };

  const handleRenamePreset = async (presetId: string, newName: string) => {
    const target = savedPresets.find((p) => p.id === presetId);
    if (!target) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Preset name cannot be empty");
      return;
    }
    const updatedPreset = { ...target, name: trimmed };
    try {
      const res = await callApi("/api/ingest/record/presets/save", {
        method: "POST",
        body: JSON.stringify(updatedPreset),
      });
      const updatedList = res.presets || savedPresets.map(p => p.id === presetId ? updatedPreset : p);
      setSavedPresets(updatedList);
      setEditingPresetId(null);
      toast.success(`Preset renamed to "${trimmed}"`);
    } catch (err: any) {
      toast.error(err?.message || "Could not rename preset");
    }
  };

  const handleTogglePresetDefaultEditing = async (preset: SavedRecordingPreset) => {
    const currentMode = preset.defaultEditingEnabled !== undefined
      ? preset.defaultEditingEnabled
      : (preset.config?.defaultEditingEnabled !== undefined ? preset.config.defaultEditingEnabled : true);
    const newMode = !currentMode;
    const updatedPreset: SavedRecordingPreset = {
      ...preset,
      defaultEditingEnabled: newMode,
      config: {
        ...(preset.config || {}),
        formats: preset.config?.formats || ["mp4"],
        defaultEditingEnabled: newMode,
      },
    };
    try {
      const res = await callApi("/api/ingest/record/presets/save", {
        method: "POST",
        body: JSON.stringify(updatedPreset),
      });
      const updatedList = res.presets || savedPresets.map(p => p.id === preset.id ? updatedPreset : p);
      setSavedPresets(updatedList);
      toast.success(`"${preset.name}" default load mode set to: ${newMode ? 'Editing Mode' : 'Locked Mode'}`);
    } catch (err: any) {
      toast.error(err?.message || "Could not update preset default mode");
    }
  };

  const handleDeletePreset = async (id: string) => {
    const target = savedPresets.find((p) => p.id === id);
    const name = target?.name || id;
    try {
      const res = await callApi(`/api/ingest/record/presets/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const updated = res.presets || savedPresets.filter((p) => p.id !== id);
      setSavedPresets(updated);
      if (res.defaultPresetId !== undefined) {
        setDefaultPresetId(res.defaultPresetId);
      } else if (defaultPresetId === id) {
        setDefaultPresetId(null);
      }
      if (selectedPresetId === id && updated.length > 0) {
        setSelectedPresetId(updated[0].id);
      }
      toast.success(`Preset "${name}" deleted from database`);
    } catch (err: any) {
      toast.error(err?.message || "Preset could not be deleted from the database");
    }
  };

  const handleResetPresets = async () => {
    try {
      const res = await callApi("/api/ingest/record/presets/reset", {
        method: "POST",
      });
      const resetList = res.presets || DEFAULT_PRESETS;
      setSavedPresets(resetList);
      setSelectedPresetId(resetList[0]?.id || DEFAULT_PRESETS[0].id);
      toast.success("Presets reset to broadcast defaults in database");
    } catch (err: any) {
      toast.error(err?.message || "Presets could not be reset in the database");
    }
  };

  const handleSetDefaultPreset = async (presetId: string) => {
    const newDefaultId = defaultPresetId === presetId ? null : presetId;
    try {
      await callApi("/api/recording/presets/default", {
        method: "PUT",
        body: JSON.stringify({ presetId: newDefaultId }),
      });
      setDefaultPresetId(newDefaultId);
      const preset = savedPresets.find((p) => p.id === presetId);
      toast.success(
        newDefaultId
          ? `"${preset?.name || presetId}" set as default recording preset in database`
          : "Default recording preset cleared",
      );
    } catch (err: any) {
      toast.error(err?.message || "Could not update default preset in database");
    }
  };

  // Profile application
  const applyProfile = (targetProfileId: string) => {
    setProfileId(targetProfileId);
    if (targetProfileId === "source-default") {
      patch({
        encoder: "nvidia",
        videoCodec: "h264",
        rateControl: "cbr",
        resolution: "source",
        framerate: 50,
        videoBitrate: 20000,
        maxBitrate: 25000,
        preset: "fast",
        gopSize: 60,
      });
      return;
    }
    const prof = profiles.find((p) => p.id === targetProfileId);
    if (!prof) return;
    patch({
      encoder: prof.videoCodec?.includes("nvenc")
        ? "nvidia"
        : prof.videoCodec?.includes("qsv")
          ? "intel"
          : "cpu",
      videoCodec: prof.videoCodec?.includes("hevc") ? "hevc" : "h264",
      resolution: prof.resolution || "source",
      framerate: prof.framerate || 50,
      videoBitrate: prof.videoBitrate || 20000,
      maxBitrate:
        prof.maxrate || (prof.videoBitrate ? prof.videoBitrate + 5000 : 25000),
      rateControl: "cbr",
      audioCodec: (prof.audioCodec as any) || "aac",
      audioBitrate: prof.audioBitrate || 192,
      sampleRate: prof.sampleRate || 48000,
      audioChannels: 2,
    });
  };

  const isStorageFull = Boolean(
    storageStatus &&
    storageStatus.safetyEnabled !== false &&
    (!storageStatus.canRecord ||
      storageStatus.isFull ||
      (storageStatus.usePercent !== undefined &&
        storageStatus.usePercent >= (storageStatus.thresholdPercent || 90))),
  );

  const baseStartDisabled =
    sourceType === "device" ? !videoDevice && !audioDevice : !selectedStreamKey;
  const startDisabled = baseStartDisabled || isStorageFull;

  // Real Dynamic Telemetry Computations (NO MOCK DATA)
  const sourceName =
    sourceType === "device"
      ? videoDevice || audioDevice || "No capture device selected"
      : streams[selectedStreamKey]?.name ||
        selectedStreamKey.split("/").pop() ||
        "No ingest stream selected";

  const resolvedInputPort = (() => {
    if (sourceType === "ingest")
      return selectedStreamKey ? "Live ingest stream" : "No input selected";
    if (!videoDevice && !audioDevice) return "No input selected";
    const lower = (videoDevice || "").toLowerCase();
    if (
      lower.includes("webcam") ||
      lower.includes("uvc") ||
      lower.includes("camera")
    ) {
      return "USB Video Device (identified from device name)";
    }
    if (
      lower.includes("decklink") ||
      lower.includes("intensity") ||
      lower.includes("blackmagic")
    ) {
      return `${(activeConfig.videoInput || "HDMI").toUpperCase()} Input · configured`;
    }
    return `${(activeConfig.videoInput || "DirectShow").toUpperCase()} Input · configured`;
  })();

  const resolvedSignalStandard = (() => {
    if (sourceType === "ingest")
      return signalDetected ? "Live stream · detected" : "Not detected";
    if (detectedResolution) {
      return `${detectedResolution}${detectedFramerate ? ` · ${detectedFramerate}` : ""} · detected`;
    }
    if (activeConfig.formatCode)
      return `${activeConfig.formatCode} · configured, not detected`;
    return "Not detected";
  })();

  const resolvedResolution =
    detectedResolution ||
    (activeConfig.resolution !== "source"
      ? `${activeConfig.resolution} · configured`
      : "Not detected");
  const resolvedFramerate =
    detectedFramerate ||
    (activeConfig.framerate
      ? `${activeConfig.framerate} fps · configured`
      : "Not detected");
  const resolvedPixelFormat = detectedPixelFormat
    ? `${detectedPixelFormat} · detected`
    : activeConfig.pixelFormat
      ? `${activeConfig.pixelFormat.toUpperCase()} · configured`
      : "Not detected";
  const configuredAudioChannels =
    activeConfig.audioChannels === 1
      ? "Mono · 1 channel"
      : activeConfig.audioChannels === 6
        ? "5.1 surround · 6 channels"
        : `${activeConfig.audioChannels || 2} channels`;
  const resolvedAudioChannels = detectedAudioChannels
    ? `${detectedAudioChannels} · detected`
    : `${configuredAudioChannels} · configured`;
  const resolvedAudioSampleRate = detectedAudioSampleRate
    ? `${detectedAudioSampleRate / 1000} kHz · detected`
    : activeConfig.sampleRate
      ? `${activeConfig.sampleRate / 1000} kHz · configured`
      : "Not detected";
  const resolvedSignalStatus =
    previewing && signalDetected && !previewError
      ? "Stable"
      : previewing && !previewError
        ? "Preview active · metadata pending"
      : previewStarting
        ? "Detecting..."
        : videoDevice || selectedStreamKey
          ? "Device Ready"
          : "Standby / Idle";

  const selectedProfileObj = profiles.find((p) => p.id === profileId);

  const showWorkflowStep = (step: number) => {
    setActiveStep(step);
    setProfileDrawerOpen(step === 4);
    setDestinationDrawerOpen(step === 5);
    window.requestAnimationFrame(() => {
      workflowWorkspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const openDeviceSetup = () => {
    showWorkflowStep(1);
    if (
      !devicesLoading &&
      videoDevices.length === 0 &&
      audioDevices.length === 0
    )
      void refreshDevices();
    window.requestAnimationFrame(() => {
      deviceSetupRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  // Stepper Items
  const workflowSteps = [
    {
      number: 1,
      title: "Select Capture Device",
      desc: "Choose your video & audio source",
      completed: Boolean(videoDevice || selectedStreamKey),
      onClick: openDeviceSetup,
    },
    {
      number: 2,
      title: "Signal Detection",
      desc: "Detect & preview the incoming signal",
      completed: signalDetected,
      onClick: () => showWorkflowStep(2),
    },
    {
      number: 3,
      title: "Output Format",
      desc: "Choose one or more containers",
      completed: activeFormats.length > 0,
      onClick: () => showWorkflowStep(3),
    },
    {
      number: 4,
      title: "Encoding Profile",
      desc: "Auto preset or manual CPU/GPU encoding",
      completed: true,
      onClick: () => showWorkflowStep(4),
    },
    {
      number: 5,
      title: "Destination",
      desc: "Set storage location",
      completed: true,
      onClick: () => showWorkflowStep(5),
    },
    {
      number: 6,
      title: "Ready to Record",
      desc: "Review settings and start",
      completed: !startDisabled,
      onClick: () => showWorkflowStep(6),
    },
  ];

  // Format options
  const baseFormatOptions: Array<{
    id: Format;
    label: string;
    desc: string;
    isMaster?: boolean;
  }> = [
    { id: "mov", label: "MOV", desc: "V210 10-bit 4:2:2 / PCM 8ch", isMaster: true },
    { id: "mkv", label: "MKV", desc: "V210 10-bit 4:2:2 / PCM 8ch", isMaster: true },
    { id: "mxf", label: "MXF", desc: "MPEG-2 4:2:2 50 Mbps / PCM 8ch", isMaster: true },
    { id: "mp4", label: "MP4", desc: "H.264 / HEVC · Auto GPU or CPU · AAC" },
    { id: "flv", label: "FLV", desc: "H.264 · Auto GPU or CPU · AAC" },
  ];

  const formatOptions: Array<{
    id: Format;
    label: string;
    desc: string;
    isMaster?: boolean;
    available?: boolean;
    warning?: string;
  }> = baseFormatOptions.map(option => {
    const serverProfile = recordingProfiles.find(profile => profile.extension === option.id);
    return serverProfile
      ? {
          ...option,
          desc: serverProfile.description,
          available: serverProfile.available,
          warning: serverProfile.warning,
        }
      : option;
  });

  const previewControl = (
    <button
      type="button"
      onClick={() => {
        if (previewing) {
          void stopPreview(true);
        } else {
          void startSourcePreview();
        }
      }}
      disabled={
        previewing
          ? previewStopping
          : startDisabled || previewStarting || previewStopping
      }
      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-4 text-[12px] font-bold text-violet-700 transition-colors hover:bg-violet-50 disabled:opacity-40 dark:border-violet-700 dark:bg-[#25163C] dark:text-violet-300 dark:hover:bg-violet-950/50"
    >
      {previewStopping ? (
        <>
          <FiRefreshCw size={14} className="animate-spin" />
          <span>Stopping Previewâ€¦</span>
        </>
      ) : previewStarting ? (
        <>
          <FiRefreshCw size={14} className="animate-spin" />
          <span>Connecting Previewâ€¦</span>
        </>
      ) : previewing ? (
        <>
          <FiEyeOff size={14} />
          <span>Stop Preview</span>
        </>
      ) : (
        <>
          <FiPlay size={14} />
          <span>Start Preview</span>
        </>
      )}
    </button>
  );

  const recordingControls = isRecordingActive ? (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold text-white shadow-md ${isRecordingPaused ? "bg-amber-600" : "bg-rose-600"}`}>
        <span className={`h-2.5 w-2.5 rounded-full bg-white ${isRecordingPaused ? "" : "animate-pulse"}`} />
        <span>{isRecordingPaused ? "RECORDING PAUSED" : "RECORDING IN PROGRESS"}</span>
        <span className={`rounded px-2 py-0.5 font-mono text-[13px] tracking-wider ${isRecordingPaused ? "bg-amber-700/80" : "bg-rose-700/80"}`}>
          {Math.floor(recordingElapsed / 3600).toString().padStart(2, "0")}:
          {Math.floor((recordingElapsed % 3600) / 60).toString().padStart(2, "0")}:
          {Math.floor(recordingElapsed % 60).toString().padStart(2, "0")}
        </span>
      </div>

      <button
        type="button"
        disabled={pauseActionPending || stopping}
        onClick={async () => {
          if (pauseActionPending || stopping) return;
          setPauseActionPending(true);
          try {
            if (isRecordingPaused) {
              await resumeRecording();
            } else {
              await pauseRecording();
            }
          } finally {
            setPauseActionPending(false);
          }
        }}
        className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-[12px] font-bold transition-colors disabled:opacity-50 ${isRecordingPaused
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        }`}
      >
        {pauseActionPending ? (
          <FiRefreshCw size={14} className="animate-spin" />
        ) : isRecordingPaused ? (
          <FiPlay size={14} className="fill-current" />
        ) : (
          <FiPause size={14} className="fill-current" />
        )}
        <span>{pauseActionPending ? "Updating..." : isRecordingPaused ? "Resume Recording" : "Pause Recording"}</span>
      </button>

      <button
        type="button"
        disabled={stopping || pauseActionPending}
        onClick={async () => {
          if (stopping) return;
          setStopping(true);
          try {
            if (typeof stopRecording === "function") {
              await stopRecording();
            }
          } finally {
            setStopping(false);
          }
        }}
        className="flex h-10 items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 text-[12px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      >
        {stopping ? (
          <>
            <FiRefreshCw size={14} className="animate-spin" />
            <span>Stopping...</span>
          </>
        ) : (
          <>
            <FiSquare size={14} className="fill-current" />
            <span>Stop Recording</span>
          </>
        )}
      </button>
    </div>
  ) : (
    <button
      type="button"
      disabled={startDisabled}
      onClick={async () => {
        await start();
      }}
      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 text-[12px] font-bold text-white shadow-md transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <FiDisc size={15} />
      <span>Start Recording</span>
      <span className="ml-1 rounded bg-rose-600 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-widest text-white">
        REC
      </span>
    </button>
  );

  const formattedFilenamePreview = (activeConfig.fileName || "{channel}_{date}_{time}")
    .replace("{channel}", (sourceName || "source").replace(/[^a-zA-Z0-9_-]/g, "_"))
    .replace("{date}", new Date().toISOString().slice(0, 10))
    .replace("{time}", new Date().toTimeString().slice(0, 8).replace(/:/g, "-"))
    + `.${activeFormats[0] || "mp4"}`;

  return (
    <div className="space-y-4">
      {/* PRESETS TOOLBAR & MAIN CONTENT */}
      {isPresetLocked ? (
        <div className="space-y-4">
          {/* Locked Preset Toolbar Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                <FiLock size={15} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Preset loaded · locked mode
                </p>
                <p className="truncate text-[13px] font-extrabold text-slate-900 dark:text-white">
                  {loadedPreset?.name || "Recording preset"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative min-w-[200px] max-w-[280px]">
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleLoadPreset(e.target.value)}
                  className="h-8 w-full appearance-none rounded-lg border border-emerald-200 bg-white px-3 pr-8 text-[11px] font-bold text-slate-800 outline-none focus:border-violet-600 dark:bg-[#25163C] dark:border-emerald-900/60 dark:text-white"
                >
                  {savedPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {defaultPresetId === p.id ? `★ ${p.name} (Default)` : p.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <FiChevronDown size={14} />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 dark:border-emerald-900/60 dark:bg-[#1E1130]">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  Enable editing
                </span>
                <span className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={presetEditingEnabled}
                    onChange={(event) => setPresetEditorVisible(event.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="h-4 w-8 rounded-full bg-slate-300 transition peer-checked:bg-violet-600 dark:bg-slate-700" />
                  <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                </span>
              </label>

              <button
                type="button"
                onClick={() => openSavePresetModal()}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 text-[11px] font-bold text-white shadow-xs transition-colors"
                title="Modify loaded preset or save as new preset"
              >
                <FiSave size={12} /> Save / Modify
              </button>

              <button
                type="button"
                onClick={() => setManagePresetsOpen(true)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:bg-[#25163C] dark:border-emerald-900/60 dark:text-slate-200"
              >
                <FiFolder size={12} /> Manage
              </button>
            </div>
          </div>

          {/* 2-Column Split: Left Recording Details & Controls + Right Medium Confidence Preview */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left Column: Filename, Recording Details & Action Controls */}
            <div className="lg:col-span-5 rounded-2xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59] flex flex-col justify-between space-y-3.5">
              <div className="space-y-3">
                {/* Filename Template Input & Live Preview */}
                <div className="rounded-xl border border-slate-200 bg-[#F8F7FA] p-3 dark:bg-[#25163C] dark:border-[#371F59] space-y-1.5">
                  <Label>
                    Recording Filename Template
                    <input
                      type="text"
                      value={activeConfig.fileName || ""}
                      onChange={(event) => patch({ fileName: event.target.value })}
                      className={inputClass}
                      placeholder="{channel}_{date}_{time}"
                    />
                  </Label>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-[#B9A5CD] pt-0.5">
                    <span>Generated File:</span>
                    <span className="font-mono font-bold text-violet-600 dark:text-violet-300 truncate max-w-[220px]" title={formattedFilenamePreview}>
                      {formattedFilenamePreview}
                    </span>
                  </div>
                </div>

                {/* Device & Signal Details */}
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Capture Device</span>
                    <span className="font-bold text-slate-800 dark:text-white truncate max-w-[170px]" title={sourceName}>
                      {sourceName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Signal Port</span>
                    <span className="font-mono text-slate-700 dark:text-[#F1EAFA]">
                      {resolvedInputPort}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Signal Standard</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                      {resolvedSignalStandard}
                      {signalDetected && <FiCheck size={12} className="text-emerald-500" />}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Resolution &amp; Rate</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-white">
                      {resolvedResolution} @ {resolvedFramerate}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Profile &amp; Codec</span>
                    <span className="font-bold text-slate-800 dark:text-white">
                      {activeConfig.videoCodec?.toUpperCase()} · {activeConfig.videoBitrate ? `${Math.round(activeConfig.videoBitrate / 1000)} Mbps` : "Auto"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Container Format</span>
                    <span className="font-mono font-bold text-violet-700 dark:text-violet-300">
                      {activeFormats.join(", ").toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Destination Path</span>
                    <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 truncate max-w-[170px]" title={activeConfig.storagePath || PROJECT_RECORDINGS_PATH}>
                      {activeConfig.storagePath || PROJECT_RECORDINGS_PATH}
                    </span>
                  </div>

                  {networkShares && (
                    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-violet-50/80 border border-violet-200 dark:bg-violet-950/40 dark:border-violet-800/70 text-[10px] gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                          <FiShare2 size={11} />
                          <span>Network Share (SMB):</span>
                        </div>
                        <p className="font-mono font-bold text-slate-900 dark:text-white truncate mt-0.5" title={networkShares.smb.parentPath}>
                          {networkShares.smb.parentPath}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(networkShares.smb.parentPath, "Network Share SMB path (\\\\IP\\media)")}
                        className="flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-violet-700 shrink-0"
                        title="Copy Network Share path"
                      >
                        <FiCopy size={11} />
                        <span>Copy</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500 dark:text-[#B9A5CD]">Storage Status</span>
                    <span className={`font-bold ${storageStatus?.isFull ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {storageStatus ? `${storageStatus.availableFmt} free (${storageStatus.usePercent.toFixed(1)}%)` : "Available"}
                    </span>
                  </div>
                </div>

                {/* Real-time Recording Timer Component */}
                <RecordingElapsedTimer
                  recordings={activeRecordings}
                  title="Recording Timer & Details"
                  compact
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-200 dark:border-[#371F59] space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {previewControl}
                  <div className="flex-1 min-w-[160px]">
                    {recordingControls}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Medium-Sized Video Preview */}
            <div className="lg:col-span-7 rounded-2xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59] flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#371F59] mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      <FiTv size={13} />
                    </span>
                    <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-white">
                      Live Confidence Preview
                    </h3>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      signalDetected && !previewError
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                        : previewing
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        signalDetected && !previewError ? "bg-emerald-500 animate-pulse" : previewing ? "bg-amber-500 animate-pulse" : "bg-slate-400"
                      }`}
                    />
                    {signalDetected && !previewError
                      ? "Signal Detected"
                      : previewing
                        ? "Preview Active"
                        : previewStarting
                          ? "Detecting..."
                          : "Standby / Ready"}
                  </span>
                </div>

                {/* Video Player Box with Medium Size Constraint */}
                <div className="relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800 shadow-inner max-w-full">
                  <KashtrixMediaPlayer
                    src={
                      previewing || isRecordingActive
                        ? activeHlsUrl ||
                          (devicePreviewIdRef.current
                            ? `/hls/device-preview/${devicePreviewIdRef.current}/index.m3u8`
                            : undefined)
                        : undefined
                    }
                    title={sourceName}
                    isLive={true}
                    isRecording={isRecordingActive}
                    showAudioMeter={true}
                    hasSignal={(previewing || isRecordingActive) && signalDetected && !previewError}
                    signalLabel={
                      sourceType === "device"
                        ? "Hardware Input Feed"
                        : "Active Live Ingest"
                    }
                    resolution={resolvedResolution}
                    framerate={resolvedFramerate}
                    onResolutionDetected={(res, fps) => {
                      if (res) setDetectedResolution(res);
                      if (fps) setDetectedFramerate(fps);
                    }}
                    onRefresh={() => {
                      void startSourcePreview();
                    }}
                  />

                  {/* Status Overlay Badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
                    <span className="rounded bg-black/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      Preview
                    </span>
                    <span className="rounded bg-black/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                      {resolvedResolution}
                    </span>
                    <span className="rounded bg-black/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                      16:9
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#371F59]/50 text-[11px] text-slate-500 dark:text-[#B9A5CD]">
                <span>Live confidence monitor for <strong className="text-slate-800 dark:text-white">{sourceName}</strong></span>
                <button
                  type="button"
                  onClick={() => setPresetEditorVisible(true)}
                  className="font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400"
                >
                  Configure Settings &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* PRESETS TOOLBAR: Define, Load, Set Default, Delete, Save, Manage Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300">
                  <FiSliders size={14} />
                </span>
                <span className="text-[12px] font-extrabold uppercase tracking-wider text-slate-800 dark:text-white">
                  Recording Preset:
                </span>
              </div>

              <div className="relative min-w-[260px] max-w-[380px]">
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleLoadPreset(e.target.value)}
                  className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-[#F8F7FA] px-3 pr-8 text-[11px] font-bold text-slate-800 outline-none focus:border-violet-600 dark:bg-[#25163C] dark:border-[#371F59] dark:text-white"
                >
                  <optgroup label="Broadcast Standards & Defaults">
                    {savedPresets
                      .filter((p) => DEFAULT_PRESETS.some((dp) => dp.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {defaultPresetId === p.id ? `★ ${p.name} (Default)` : p.name}
                        </option>
                      ))}
                  </optgroup>
                  {savedPresets.filter(
                    (p) => !DEFAULT_PRESETS.some((dp) => dp.id === p.id),
                  ).length > 0 && (
                    <optgroup label="User Custom Presets">
                      {savedPresets
                        .filter(
                          (p) => !DEFAULT_PRESETS.some((dp) => dp.id === p.id),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {defaultPresetId === p.id ? `★ ${p.name} (Default)` : p.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <FiChevronDown size={14} />
                </div>
              </div>

              {/* Load Preset Button */}
              <button
                type="button"
                onClick={() => handleLoadPreset(selectedPresetId)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-[11px] font-bold text-violet-700 hover:bg-violet-100 dark:bg-violet-950/60 dark:border-violet-800 dark:text-violet-300"
                title="Load preset and store active configuration in database"
              >
                <FiUpload size={12} /> Load Preset
              </button>

              {/* Set / Toggle Default Preset Button */}
              <button
                type="button"
                onClick={() => handleSetDefaultPreset(selectedPresetId)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition ${
                  defaultPresetId === selectedPresetId
                    ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-300"
                }`}
                title={defaultPresetId === selectedPresetId ? "Default preset (Click to unset)" : "Set as default preset in database"}
              >
                <FiStar
                  size={13}
                  className={defaultPresetId === selectedPresetId ? "text-amber-500 fill-amber-500" : "text-slate-400"}
                />
                {defaultPresetId === selectedPresetId ? "Default" : "Set Default"}
              </button>

              {/* Delete / Remove Selected Preset Button */}
              <button
                type="button"
                onClick={() => {
                  const current = savedPresets.find((p) => p.id === selectedPresetId);
                  if (
                    current &&
                    window.confirm(`Are you sure you want to delete preset "${current.name}" from database?`)
                  ) {
                    handleDeletePreset(selectedPresetId);
                  }
                }}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300"
                title="Remove/delete currently selected preset from database"
              >
                <FiTrash2 size={12} /> Delete Preset
              </button>
            </div>

            <div className="flex items-center gap-2">
              {loadedPresetId && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 dark:border-violet-800 dark:bg-violet-950/40">
                  <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300">
                    Enable editing
                  </span>
                  <span className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={presetEditingEnabled}
                      onChange={(event) => setPresetEditorVisible(event.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="h-4 w-8 rounded-full bg-slate-300 transition peer-checked:bg-violet-600 dark:bg-slate-700" />
                    <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                  </span>
                </label>
              )}
              <button
                type="button"
                onClick={() => {
                  setSetupNameInput(`${sourceName} Setup`);
                  setSaveSetupModalOpen(true);
                }}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700 transition-colors"
              >
                <FiSave size={12} /> Save Preset
              </button>

              <button
                type="button"
                onClick={() => setManagePresetsOpen(true)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-200"
              >
                <FiFolder size={12} /> Manage Presets
              </button>
            </div>
          </div>

          {/* Stepper + Workspace */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left Column: Interactive Workflow Stepper */}
            <div className="lg:col-span-4 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59] space-y-2">
              {workflowSteps.map((step) => {
                const isActive = activeStep === step.number;
                return (
                  <button
                    type="button"
                    key={step.number}
                    onClick={step.onClick}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl p-3 text-left transition-all duration-150 select-none ${
                      isActive
                        ? "border-2 border-violet-600 bg-violet-50/60 shadow-xs dark:bg-violet-950/30 dark:border-violet-500"
                        : "border border-transparent hover:bg-slate-50 hover:border-slate-200 dark:hover:bg-[#25163C] dark:hover:border-[#371F59]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                          isActive
                            ? "bg-violet-600 text-white shadow-xs"
                            : step.completed
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-[#2A1744] dark:text-[#B9A5CD]"
                        }`}
                      >
                        {step.number}
                      </div>
                      <div>
                        <h4
                          className={`text-[13px] font-bold leading-tight ${isActive ? "text-violet-900 dark:text-violet-200" : "text-slate-800 dark:text-[#F1EAFA]"}`}
                        >
                          {step.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-[#B9A5CD] leading-tight mt-0.5">
                          {step.desc}
                        </p>
                      </div>
                    </div>

                    {step.completed && (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <FiCheck size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Column: Signal Detection & Workspace */}
            <div
              ref={workflowWorkspaceRef}
              className="lg:col-span-8 scroll-mt-4 rounded-2xl border border-[#E8DFF0] bg-white p-4 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59] space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#371F59]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    {activeStep}.{" "}
                    {workflowSteps.find((step) => step.number === activeStep)
                      ?.title || "Signal Detection"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      signalDetected && !previewError
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                        : previewing
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${signalDetected && !previewError ? "bg-emerald-500 animate-pulse" : previewing ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`}
                    />
                    {signalDetected && !previewError
                      ? "Signal Detected"
                      : previewing
                        ? "Preview Active · Detecting Metadata"
                      : previewStarting
                        ? "Detecting..."
                        : "Standby / Ready"}
                  </span>
                </div>
              </div>

              {/* Sub-grid: Left Details & Specs + Right Live Confidence Monitor */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* Left Details (REAL HARDWARE TELEMETRY) */}
                <div className={`${activeStep === 2 ? "md:col-span-5" : "md:col-span-7"} flex flex-col justify-between space-y-3`}>
                  <div
                    ref={workflowInlinePanelRef}
                    className={activeStep === 4 || activeStep === 5 ? "block" : "hidden"}
                  />

                  {activeStep === 1 && (
                    <section ref={deviceSetupRef} className="scroll-mt-4 rounded-xl border border-violet-300 bg-violet-50/60 p-3.5 dark:border-[#51306F] dark:bg-[#25163C]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-white">
                            <FiTv size={15} />
                          </span>
                          <div>
                            <h3 className="text-[12px] font-extrabold text-slate-900 dark:text-white">
                              Capture Device &amp; Signal Input
                            </h3>
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-[#B9A5CD]">
                              Choose the source that will feed the confidence preview.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void refreshDevices()}
                          disabled={devicesLoading}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-[10px] font-bold text-violet-700 disabled:opacity-50 dark:border-violet-800 dark:bg-[#1E1130] dark:text-violet-300"
                        >
                          <FiRefreshCw size={11} className={devicesLoading ? "animate-spin" : ""} />
                          Refresh
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-[#371F59] dark:bg-[#211335]">
                        <button
                          type="button"
                          onClick={() => {
                            setSourceType("device");
                            patch({ sourceType: "device" });
                          }}
                          className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition ${sourceType === "device" ? "bg-violet-600 text-white" : "text-slate-600 dark:text-[#B9A5CD]"}`}
                        >
                          Capture Device
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourceType("ingest");
                            patch({ sourceType: "ingest" });
                          }}
                          className={`rounded-md px-2 py-1.5 text-[10px] font-bold transition ${sourceType === "ingest" ? "bg-violet-600 text-white" : "text-slate-600 dark:text-[#B9A5CD]"}`}
                        >
                          Live Ingest Stream
                        </button>
                      </div>

                      {sourceType === "device" ? (
                        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                          <Label>
                            Video Device
                            <select value={videoDevice} onChange={(event) => setVideoDevice(event.target.value)} className={selectClass}>
                              <option value="">Select video hardware…</option>
                              {videoDevices.map((device) => <option key={device} value={device}>{device}</option>)}
                            </select>
                          </Label>
                          <Label>
                            Audio Device
                            <select value={audioDevice} onChange={(event) => setAudioDevice(event.target.value)} className={selectClass}>
                              <option value="">Select audio hardware…</option>
                              {audioDevices.map((device) => <option key={device} value={device}>{device}</option>)}
                            </select>
                          </Label>
                          <Label>
                            Video Input
                            <select value={activeConfig.videoInput || "hdmi"} onChange={(event) => patch({ videoInput: event.target.value })} className={selectClass}>
                              <option value="hdmi">HDMI Input</option>
                              <option value="sdi">SDI Input</option>
                              <option value="optical_sdi">Optical SDI</option>
                              <option value="component">Component Video</option>
                              <option value="composite">Composite Video</option>
                            </select>
                          </Label>
                          <Label>
                            Signal Standard
                            <select
                              value={activeConfig.formatCode || ""}
                              onChange={(event) => {
                                const formatCode = event.target.value;
                                const format = (deviceFormats[videoDevice] || DEFAULT_DECKLINK_FORMATS).find((item) => item.code === formatCode);
                                patch({ formatCode, ...(format ? { resolution: format.resolution, framerate: Number(format.fps) } : { resolution: "source" }) });
                              }}
                              className={selectClass}
                            >
                              <option value="">Auto Detect Format</option>
                              {(deviceFormats[videoDevice] || DEFAULT_DECKLINK_FORMATS).map((format) => (
                                <option key={format.code} value={format.code}>{format.description || format.code} · {format.resolution} @ {format.fps} fps</option>
                              ))}
                            </select>
                          </Label>
                          <Label>
                            Resolution
                            <select value={activeConfig.resolution || "source"} onChange={(event) => patch({ resolution: event.target.value })} className={selectClass}>
                              <option value="source">Follow detected signal</option>
                              <option value="3840x2160">3840×2160 UHD</option>
                              <option value="1920x1080">1920×1080 HD</option>
                              <option value="1280x720">1280×720 HD</option>
                              <option value="720x576">720×576 PAL</option>
                              <option value="720x480">720×480 NTSC</option>
                            </select>
                          </Label>
                          <Label>
                            Frame Rate
                            <select value={activeConfig.framerate || 50} onChange={(event) => patch({ framerate: Number(event.target.value) })} className={selectClass}>
                              {[23.976, 24, 25, 29.97, 30, 50, 59.94, 60].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
                            </select>
                          </Label>
                          <Label>
                            Pixel Format
                            <select value={activeConfig.pixelFormat || "yuv420p"} onChange={(event) => patch({ pixelFormat: event.target.value as IngestRecordingOptions["pixelFormat"] })} className={selectClass}>
                              <option value="yuv420p">YUV420P</option>
                              <option value="yuv422p">YUV422P</option>
                              <option value="yuv444p">YUV444P</option>
                            </select>
                          </Label>
                          <Label>
                            Audio Channels
                            <select value={activeConfig.audioChannels || 2} onChange={(event) => patch({ audioChannels: Number(event.target.value) })} className={selectClass}>
                              <option value={1}>Mono · 1 channel</option>
                              <option value={2}>Stereo · 2 channels</option>
                              <option value={6}>Surround · 6 channels</option>
                              <option value={8}>Embedded · 8 channels</option>
                            </select>
                          </Label>
                          <Label>
                            Audio Sample Rate
                            <select value={activeConfig.sampleRate || 48000} onChange={(event) => patch({ sampleRate: Number(event.target.value) })} className={selectClass}>
                              <option value={44100}>44.1 kHz</option>
                              <option value={48000}>48 kHz</option>
                              <option value={96000}>96 kHz</option>
                            </select>
                          </Label>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <Label>
                            Active Ingest Stream
                            <select value={selectedStreamKey} onChange={(event) => setSelectedStreamKey(event.target.value)} className={selectClass}>
                              <option value="">Select incoming stream key…</option>
                              {Object.entries(streams).map(([key, value]: [string, any]) => <option key={key} value={key}>{value.name || key} ({value.app || "live"})</option>)}
                            </select>
                          </Label>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-end gap-2.5 border-t border-slate-200 pt-3 dark:border-[#371F59]">
                        <div className="min-w-[220px] flex-1">
                          <Label>
                            Recording Filename Template
                            <input type="text" value={activeConfig.fileName || ""} onChange={(event) => patch({ fileName: event.target.value })} className={inputClass} />
                          </Label>
                        </div>
                        <button
                          type="button"
                          disabled={previewStarting || (sourceType === "device" ? !videoDevice && !audioDevice : !selectedStreamKey)}
                          onClick={() => {
                            setActiveStep(2);
                            void startSourcePreview();
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white disabled:opacity-40"
                        >
                          <FiActivity size={12} /> Apply &amp; Detect
                        </button>
                      </div>
                    </section>
                  )}

                  {activeStep === 3 && (
                    <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-[#371F59] dark:bg-[#25163C]/60">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-white">Output Containers</h3>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-[#B9A5CD]">Select one or more simultaneous recording outputs.</p>
                        </div>
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{activeFormats.length} selected</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {formatOptions.map((format) => {
                          const selected = activeFormats.includes(format.id);
                          return (
                            <button type="button" key={format.id} disabled={format.available === false} title={format.warning} onClick={() => toggleFormat(format.id)} className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-violet-600 bg-white ring-1 ring-violet-500 dark:bg-violet-950/30" : "border-slate-200 bg-white dark:border-[#371F59] dark:bg-[#1E1130]"}`}>
                              <span className="flex items-center justify-between gap-2"><strong className="text-[12px] text-slate-900 dark:text-white">{format.label}</strong>{selected && <FiCheckCircle className="text-violet-600" size={14} />}</span>
                              <span className="mt-1 block text-[10px] text-slate-500 dark:text-[#B9A5CD]">{format.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => showWorkflowStep(4)} disabled={!activeFormats.length} className="mt-3 h-9 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white disabled:opacity-40">Continue to Encoding</button>
                    </section>
                  )}

                  {activeStep === 6 && (
                    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white"><FiCheckCircle size={17} /></span>
                        <div>
                          <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-white">Ready to Record</h3>
                          <p className="mt-0.5 text-[10px] text-slate-600 dark:text-emerald-200/80">Review the source and output settings before recording.</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {[
                          ["Source", sourceName],
                          ["Signal", resolvedSignalStatus],
                          ["Resolution", resolvedResolution],
                          ["Profile", selectedProfileObj?.name || "Custom profile"],
                          ["Formats", activeFormats.join(", ").toUpperCase()],
                          ["Destination", activeConfig.storagePath || "Not configured"],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-emerald-200/80 bg-white p-2.5 dark:border-emerald-900/60 dark:bg-[#1E1130]">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#B9A5CD]">{label}</span>
                            <p className="mt-1 truncate text-[11px] font-bold text-slate-900 dark:text-white" title={String(value)}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {activeStep === 2 && (<>
                  {/* Device Header Card */}
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:bg-[#25163C] dark:border-[#371F59]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      <FiTv size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4
                        className="truncate text-[13px] font-bold text-slate-900 dark:text-white"
                        title={sourceName}
                      >
                        {sourceName}
                      </h4>
                      <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-300 uppercase">
                        {resolvedInputPort}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openDeviceSetup}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 dark:bg-[#1E1130] dark:border-[#371F59] dark:text-slate-200"
                    >
                      Change
                    </button>
                  </div>

                  {/* Signal Specifications List (DYNAMIC REAL DATA) */}
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Signal Standard
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                        {resolvedSignalStandard}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Resolution
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                        {resolvedResolution}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Frame Rate
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                        {resolvedFramerate}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Pixel Format
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                        {resolvedPixelFormat}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Audio Channels
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                        {resolvedAudioChannels}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-[#371F59]/50">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Audio Sample Rate
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1">
                        {resolvedAudioSampleRate}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span className="text-slate-500 dark:text-[#B9A5CD]">
                        Signal Status
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        {resolvedSignalStatus}
                        <FiCheck size={12} className="text-emerald-500" />
                      </span>
                    </div>
                  </div>

                  {/* Re-detect Button */}
                  <button
                    type="button"
                    onClick={() => {
                      refreshDevices();
                      void startSourcePreview();
                    }}
                    disabled={previewStarting || devicesLoading}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-200 transition-colors"
                  >
                    <FiRefreshCw
                      size={12}
                      className={
                        previewStarting || devicesLoading ? "animate-spin" : ""
                      }
                    />
                    Re-detect Signal
                  </button>
                  </>)}
                </div>

                {/* Right Live Confidence Monitor & VU Meters */}
                <div className={`${activeStep === 2 ? "md:col-span-7" : "md:col-span-5"} flex flex-col justify-between space-y-2`}>
                  <div className="relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800 shadow-inner">
                    {/* Confidence Player */}
                    <KashtrixMediaPlayer
                      src={
                        previewing || isRecordingActive
                          ? activeHlsUrl ||
                            (devicePreviewIdRef.current
                              ? `/hls/device-preview/${devicePreviewIdRef.current}/index.m3u8`
                              : undefined)
                          : undefined
                      }
                      title={sourceName}
                      isLive={true}
                      isRecording={isRecordingActive}
                      showAudioMeter={true}
                      hasSignal={(previewing || isRecordingActive) && signalDetected && !previewError}
                      signalLabel={
                        sourceType === "device"
                          ? "Hardware Input Feed"
                          : "Active Live Ingest"
                      }
                      resolution={resolvedResolution}
                      framerate={resolvedFramerate}
                      onResolutionDetected={(res, fps) => {
                        if (res) setDetectedResolution(res);
                        if (fps) setDetectedFramerate(fps);
                      }}
                      onRefresh={() => {
                        void startSourcePreview();
                      }}
                    />

                    {/* Status Overlay Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
                      <span className="rounded bg-black/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                        Preview
                      </span>
                      <span className="rounded bg-black/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                        {resolvedResolution}
                      </span>
                      <span className="rounded bg-black/70 backdrop-blur-xs px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                        16:9
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-[#B9A5CD] leading-snug">
                    Confidence preview monitor shows live feed from {sourceName}.
                    Ensure video and audio levels look correct before recording.
                  </p>

                  <RecordingElapsedTimer
                    recordings={activeRecordings}
                    title="Recording Timer & Details"
                    compact
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar: Preview, Save Setup, Record Triggers */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8DFF0] bg-white p-3.5 shadow-xs dark:bg-[#1E1130] dark:border-[#371F59]">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2.5">
              <div className="min-w-[260px] flex-1 sm:min-w-[340px]">
                <Label>
                  Recording Filename Template
                  <input
                    type="text"
                    value={activeConfig.fileName || ""}
                    onChange={(event) => patch({ fileName: event.target.value })}
                    className={inputClass}
                    placeholder="{channel}_{date}_{time}"
                  />
                </Label>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-[#B9A5CD]">
                  <span>Generated File:</span>
                  <span className="font-mono font-bold text-violet-600 dark:text-violet-300 truncate max-w-[260px]" title={formattedFilenamePreview}>
                    {formattedFilenamePreview}
                  </span>
                </div>
              </div>

              {/* Start / Stop Preview Button */}
              {previewControl}

              {/* Save Setup Preset Button */}
              <button
                type="button"
                onClick={() => {
                  setSetupNameInput(`${sourceName} Preset`);
                  setSaveSetupModalOpen(true);
                }}
                title="Save recording configuration and profile as preset"
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[12px] font-bold text-slate-700 hover:bg-slate-50 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-200 dark:hover:bg-[#2D1A45] transition-colors"
              >
                <FiSave size={14} />
                <span>Save Preset</span>
              </button>
            </div>

            {/* Start / Stop Recording Master Button */}
            <div>
              {recordingControls}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Legacy device drawer is disabled; configuration now renders inline.       */}
      {/* ========================================================================= */}
      <DetailDrawer
        open={false}
        onClose={() => {}}
        title="Select Capture Device & Input Source"
        subtitle="Configure video hardware or active RTMP/SRT ingest stream"
        width="max-w-[500px]"
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD]">
              Selection updates the Signal Detection workspace immediately.
            </p>
            <button
              type="button"
              disabled={
                sourceType === "device"
                  ? !videoDevice && !audioDevice
                  : !selectedStreamKey
              }
              onClick={() => {
                setActiveStep(2);
                void startSourcePreview();
              }}
              className="h-8 shrink-0 rounded-lg bg-violet-600 px-3 text-[11px] font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply &amp; Detect Signal
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Source Type Toggle */}
          <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:bg-[#211335] dark:border-[#371F59]">
            <button
              type="button"
              onClick={() => {
                setSourceType("device");
                patch({ sourceType: "device" });
              }}
              className={`rounded-lg py-1.5 text-[11px] font-bold transition ${sourceType === "device" ? "bg-violet-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-[#B9A5CD]"}`}
            >
              Capture Device (SDI / HDMI / USB)
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceType("ingest");
                patch({ sourceType: "ingest" });
              }}
              className={`rounded-lg py-1.5 text-[11px] font-bold transition ${sourceType === "ingest" ? "bg-violet-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-[#B9A5CD]"}`}
            >
              Live Ingest Stream (RTMP / SRT)
            </button>
          </div>

          {sourceType === "device" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900/70 dark:bg-violet-950/30">
                <div>
                  <p className="text-[10px] font-bold text-violet-900 dark:text-violet-200">
                    Available capture hardware
                  </p>
                  <p className="text-[9px] text-violet-700/80 dark:text-violet-300/70">
                    {videoDevices.length} video · {audioDevices.length} audio
                    devices
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshDevices()}
                  disabled={devicesLoading}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 text-[9px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:bg-[#25163C] dark:border-violet-800 dark:text-violet-300"
                >
                  <FiRefreshCw
                    size={10}
                    className={devicesLoading ? "animate-spin" : ""}
                  />{" "}
                  Refresh devices
                </button>
              </div>
              <Label>
                Video Device
                <select
                  value={videoDevice}
                  onChange={(e) => setVideoDevice(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select video hardware...</option>
                  {videoDevices.map((dev) => (
                    <option key={dev} value={dev}>
                      {dev}
                    </option>
                  ))}
                </select>
              </Label>

              <Label>
                Audio Device
                <select
                  value={audioDevice}
                  onChange={(e) => setAudioDevice(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select audio hardware...</option>
                  {audioDevices.map((dev) => (
                    <option key={dev} value={dev}>
                      {dev}
                    </option>
                  ))}
                </select>
              </Label>

              {/decklink|intensity|blackmagic|ultra\s*studio/i.test(videoDevice || '') ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Label>
                    Video Input Port
                    <select
                      value={activeConfig.videoInput || "sdi"}
                      onChange={(e) =>
                        patch({ videoInput: e.target.value as any })
                      }
                      className={selectClass}
                    >
                      <option value="sdi">SDI Input</option>
                      <option value="hdmi">HDMI Input</option>
                      <option value="optical">Optical SDI</option>
                      <option value="composite">Composite Video</option>
                      <option value="component">Component Video</option>
                      <option value="unset">Auto / Default</option>
                    </select>
                  </Label>

                  <Label>
                    Signal Standard
                    <select
                      value={activeConfig.formatCode || "auto"}
                      onChange={(e) => patch({ formatCode: e.target.value })}
                      className={selectClass}
                    >
                      <option value="auto">Auto Detect Wire Signal</option>
                      <option value="">Auto / Default</option>
                      {(
                        deviceFormats[videoDevice] || DEFAULT_DECKLINK_FORMATS
                      ).map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.code} - {f.description || f.code} ({f.resolution} @{" "}
                          {f.fps}fps)
                        </option>
                      ))}
                    </select>
                  </Label>
                </div>
              ) : videoDevice ? (
                <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-[11px] text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                  <span className="font-semibold text-[#1B1024] dark:text-white">DirectShow / UVC Capture Hardware</span>
                  <p className="mt-0.5 text-[10px]">
                    Standard webcam / DirectShow device selected. Frame rate and resolution are auto-negotiated from the camera device.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <Label>
                Select Active Ingest Stream
                <select
                  value={selectedStreamKey}
                  onChange={(e) => setSelectedStreamKey(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select incoming stream key...</option>
                  {Object.entries(streams).map(([key, val]: [string, any]) => (
                    <option key={key} value={key}>
                      {val.name || key} ({val.app || "live"})
                    </option>
                  ))}
                </select>
              </Label>
            </div>
          )}

          {/* Filename Template */}
          <div>
            <Label>
              Recording Filename Template
              <input
                type="text"
                value={activeConfig.fileName || ""}
                onChange={(e) => patch({ fileName: e.target.value })}
                placeholder="{channel}_{date}_{time}"
                className={inputClass}
              />
            </Label>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
              <span>
                Variables: {"{channel}"} {"{date}"} {"{time}"}
              </span>
              <span className="font-mono text-violet-600 font-bold">
                {(activeConfig.fileName || "{channel}_{date}_{time}")
                  .replace(
                    "{channel}",
                    sourceName.replace(/[^a-zA-Z0-9_-]/g, "_"),
                  )
                  .replace("{date}", "2026-05-19")
                  .replace("{time}", "14-35-22")}
                .{activeFormats[0] || "mp4"}
              </span>
            </div>
          </div>
        </div>
      </DetailDrawer>

      {/* ========================================================================= */}
      {/* DRAWER 2: EDIT RECORDING PROFILE (STEP 3) - COMPLETE BROADCAST OPTIONS     */}
      {/* ========================================================================= */}
      <DetailDrawer
        open={profileDrawerOpen && !isPresetLocked}
        onClose={() => showWorkflowStep(3)}
        title="Edit Recording Profile &amp; Advanced Options"
        subtitle="Fine-tune video quality, max bitrate, CRF, GOP keyframes, pixel format, and audio"
        width="max-w-[620px]"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <button
              type="button"
              onClick={() => {
                setSetupNameInput(`${selectedRecordingProfile?.label || selectedOutputFormat.toUpperCase()} Preset`);
                setSaveSetupModalOpen(true);
              }}
              className="flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-200 dark:hover:bg-[#2D1A45] transition-colors"
            >
              <FiSave size={13} />
              <span>Save as Preset</span>
            </button>
            <button
              type="button"
              onClick={() => showWorkflowStep(3)}
              className="h-8 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white hover:bg-violet-700 transition-colors"
            >
              Apply Profile Settings
            </button>
          </div>
        }
        inlineTarget={workflowInlinePanelRef.current}
      >
        <div className="space-y-4">
          {standardProfileSelected && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-[11px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <strong>{selectedRecordingProfile?.label || selectedOutputFormat.toUpperCase()} uses a locked production profile.</strong>{' '}
                  Codec, pixel format, scan type, bitrate, cadence, and audio follow this broadcast preset.
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-emerald-200/80 dark:border-emerald-900/60 flex-wrap gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-emerald-950 dark:text-emerald-100 select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(activeConfig.unlockStandardOverride)}
                    onChange={(e) => patch({ unlockStandardOverride: e.target.checked })}
                    className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                  />
                  <span>Unlock format standard parameters for custom modification</span>
                </label>
                {activeConfig.unlockStandardOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfig?.((previous) => {
                        const current = previous || defaultConfig;
                        const profileOverrides = { ...(current.profileOverrides || {}) };
                        delete profileOverrides[selectedOutputFormat];
                        return { ...current, unlockStandardOverride: false, profileOverrides };
                      });
                      toast.success('Reset to standard broadcast profile defaults');
                    }}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline dark:text-emerald-300 dark:hover:text-white"
                  >
                    Reset to Defaults
                  </button>
                )}
              </div>
            </div>
          )}

          <fieldset disabled={isLockedFormat} className="space-y-4 disabled:opacity-65">
          {/* Video Codec & Hardware Encoder */}
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Video Codec
              <select
                value={isLockedFormat ? selectedRecordingProfile?.videoCodec : (flvSelected ? 'h264' : (activeConfig.videoCodec || "h264"))}
                onChange={(e) => patch({ videoCodec: e.target.value as any })}
                disabled={flvSelected}
                className={selectClass}
              >
                <option value="h264">H.264 / AVC (Broadly Compatible)</option>
                <option value="hevc">
                  H.265 / HEVC (High Compression Efficiency)
                </option>
                <option value="v210">V210 (10-bit 4:2:2 Uncompressed)</option>
                <option value="mpeg2video">MPEG-2 Video (Broadcast 4:2:2)</option>
              </select>
            </Label>

            <Label>
              Hardware Encoder
              <select
                value={isLockedFormat ? 'standard' : (activeConfig.encoder === 'standard' ? 'auto' : (activeConfig.encoder || 'auto'))}
                onChange={(e) => patch({ encoder: e.target.value as any })}
                className={selectClass}
              >
                {isLockedFormat && <option value="standard">Format Standard (Automatic)</option>}
                {!isLockedFormat && <option value="auto">Auto (Best Available GPU, then CPU)</option>}
                {!isLockedFormat && (recordingEncoders.length
                  ? recordingEncoders.filter(encoder => encoder.id !== 'auto').map(encoder => (
                      <option key={encoder.id} value={encoder.id} disabled={!encoder.available || !encoder.codecs.includes(flvSelected ? 'h264' : (activeConfig.videoCodec === 'hevc' ? 'hevc' : 'h264'))}>
                        {encoder.label}{encoder.available ? '' : ' (Unavailable)'}
                      </option>
                    ))
                  : <>
                      <option value="nvidia">NVIDIA NVENC</option>
                      <option value="intel">Intel Quick Sync</option>
                      <option value="amd">AMD AMF</option>
                      <option value="cpu">CPU Software</option>
                    </>)}
              </select>
            </Label>
          </div>

          {activeFormats.some(format => format === 'mp4' || format === 'flv') && (
            <Label>
              Compressed Interlace Handling
              <select
                value={activeConfig.nvencInterlaceMode || 'auto'}
                onChange={(e) => patch({ nvencInterlaceMode: e.target.value as IngestRecordingOptions['nvencInterlaceMode'] })}
                className={selectClass}
              >
                <option value="auto">Auto-detect (recommended)</option>
                <option value="deinterlace">Deinterlace 1080i50 to 1080p50 (bwdif)</option>
                <option value="native">Native interlaced NVENC (supported GPUs only)</option>
              </select>
            </Label>
          )}

          {/* Rate Control, Target Bitrate, Max Bitrate, CRF */}
          <div className="grid grid-cols-3 gap-3">
            <Label>
              Bitrate Mode
              <select
                value={profileEditorConfig.rateControl || "cbr"}
                onChange={(e) => patch({ rateControl: e.target.value as any })}
                className={selectClass}
              >
                <option value="cbr">CBR (Constant Bitrate)</option>
                <option value="vbr">VBR (Variable Bitrate)</option>
                <option value="crf">CRF (Constant Quality Factor)</option>
              </select>
            </Label>

            <Label>
              Target Bitrate (Kbps)
              <input
                type="number"
                min="1000"
                max="120000"
                step="1000"
                value={profileEditorConfig.videoBitrate ?? 20000}
                onChange={(e) =>
                  patch({ videoBitrate: Number(e.target.value) })
                }
                className={inputClass}
              />
            </Label>

            <Label>
              Max Bitrate (Kbps)
              <input
                type="number"
                min="1000"
                max="150000"
                step="1000"
                value={profileEditorConfig.maxBitrate ?? 25000}
                onChange={(e) => patch({ maxBitrate: Number(e.target.value) })}
                className={inputClass}
              />
            </Label>
          </div>

          {/* CRF Option (Visible when CRF mode is selected) */}
          {profileEditorConfig.rateControl === "crf" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:bg-[#25163C] dark:border-[#371F59]">
              <div className="flex items-center justify-between">
                <Label>Constant Rate Factor (CRF Quality: 0 - 51)</Label>
                <span className="font-mono text-[12px] font-bold text-violet-700 dark:text-violet-300">
                  CRF: {profileEditorConfig.crf ?? 20} (Lower = Higher Quality)
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="35"
                value={profileEditorConfig.crf ?? 20}
                onChange={(e) => patch({ crf: Number(e.target.value) })}
                className="w-full mt-2 accent-violet-600"
              />
            </div>
          )}

          {/* Resolution, Framerate, GOP Size, Encoding Preset */}
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Resolution
              <select
                value={profileEditorConfig.resolution || "source"}
                onChange={(e) => patch({ resolution: e.target.value })}
                className={selectClass}
              >
                <option value="source">Source / Original (Native Input)</option>
                <option value="3840x2160">4K UHD (3840x2160)</option>
                <option value="1920x1080">Full HD (1920x1080)</option>
                <option value="1280x720">HD 720p (1280x720)</option>
                <option value="720x576">PAL 576i (720x576)</option>
                <option value="720x480">NTSC 480i (720x480)</option>
              </select>
            </Label>

            <Label>
              Frame Rate (FPS)
              <select
                value={profileEditorConfig.framerate ?? 50}
                onChange={(e) => patch({ framerate: Number(e.target.value) })}
                className={selectClass}
              >
                <option value={0}>Source / Native</option>
                <option value={50}>50 fps (Broadcast PAL)</option>
                <option value={59.94}>59.94 fps (Broadcast NTSC)</option>
                <option value={60}>60 fps</option>
                <option value={25}>25 fps</option>
                <option value={29.97}>29.97 fps</option>
                <option value={24}>24 fps (Cinema Master)</option>
              </select>
            </Label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Label>
              Encoding Preset
              <select
                value={profileEditorConfig.preset || "fast"}
                onChange={(e) => patch({ preset: e.target.value as any })}
                className={selectClass}
              >
                <option value="ultrafast">Ultrafast (Lowest CPU/GPU)</option>
                <option value="fast">Fast (Recommended Broadcast)</option>
                <option value="medium">Medium (Standard)</option>
                <option value="slow">Slow (High Quality Master)</option>
                <option value="p4">P4 (NVIDIA Balanced Quality)</option>
              </select>
            </Label>

            <Label>
              GOP / Keyframe (Frames)
              <input
                type="number"
                min="1"
                max="300"
                value={profileEditorConfig.gopSize || 60}
                onChange={(e) => patch({ gopSize: Number(e.target.value) })}
                className={inputClass}
              />
            </Label>

            <Label>
              Pixel Format
              <select
                value={profileEditorConfig.pixelFormat || "yuv420p"}
                onChange={(e) => patch({ pixelFormat: e.target.value as any })}
                className={selectClass}
              >
                <option value="yuv420p">yuv420p (8-bit 4:2:0 Standard)</option>
                <option value="yuv422p">
                  yuv422p (8-bit 4:2:2 Broadcast)
                </option>
                <option value="yuv422p10le">yuv422p10le (10-bit 4:2:2 V210)</option>
                <option value="yuv444p">yuv444p (4:4:4 Studio Master)</option>
              </select>
            </Label>
          </div>

          {/* Audio Configuration Section */}
          <div className="border-t border-slate-200 pt-3 dark:border-[#371F59]">
            <h5 className="text-[11px] font-bold text-slate-800 dark:text-white uppercase mb-2">
              Audio Recording Settings
            </h5>
            <div className="grid grid-cols-4 gap-3">
              <Label>
                Audio Codec
                <select
                  value={profileEditorConfig.audioCodec || "aac"}
                  onChange={(e) => patch({ audioCodec: e.target.value as any })}
                  className={selectClass}
                >
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                  <option value="opus">Opus</option>
                  <option value="pcm_s16le">PCM 16-bit (Lossless WAV)</option>
                  <option value="pcm_s24le">PCM 24-bit (Broadcast Master)</option>
                </select>
              </Label>

              <Label>
                Sample Rate
                <select
                  value={profileEditorConfig.sampleRate || 48000}
                  onChange={(e) =>
                    patch({ sampleRate: Number(e.target.value) })
                  }
                  className={selectClass}
                >
                  <option value={48000}>48 kHz Broadcast Standard</option>
                  <option value={44100}>44.1 kHz Standard</option>
                  <option value={32000}>32 kHz</option>
                  <option value={96000}>96 kHz High-Res Master</option>
                </select>
              </Label>

              <Label>
                Audio Bitrate (Kbps)
                <select
                  value={profileEditorConfig.audioBitrate ?? 192}
                  onChange={(e) =>
                    patch({ audioBitrate: Number(e.target.value) })
                  }
                  className={selectClass}
                >
                  <option value={64}>64 Kbps</option>
                  <option value={128}>128 Kbps</option>
                  <option value={192}>192 Kbps (Broadcast)</option>
                  <option value={256}>256 Kbps</option>
                  <option value={320}>320 Kbps (Studio)</option>
                  <option value={0}>Uncompressed PCM</option>
                </select>
              </Label>

              <Label>
                Audio Channels
                <select
                  value={profileEditorConfig.audioChannels || 2}
                  onChange={(e) =>
                    patch({ audioChannels: Number(e.target.value) })
                  }
                  className={selectClass}
                >
                  <option value={1}>1 Channel (Mono)</option>
                  <option value={2}>2 Channels (Stereo)</option>
                  <option value={6}>6 Channels (5.1 Surround)</option>
                  <option value={8}>8 Channels (7.1 Studio)</option>
                </select>
              </Label>
            </div>
          </div>
          </fieldset>

          {/* Operational Toggles */}
          <div className="border-t border-slate-200 pt-3 dark:border-[#371F59] grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-800 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={activeConfig.continuous !== false}
                onChange={(e) => patch({ continuous: e.target.checked })}
                className="rounded text-violet-600"
              />
              <span>Continuous Segmented Recording</span>
            </label>

            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-800 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(activeConfig.autoRecord)}
                onChange={(e) => patch({ autoRecord: e.target.checked })}
                className="rounded text-violet-600"
              />
              <span>Auto-Start Recording on Signal Lock</span>
            </label>
          </div>
        </div>
      </DetailDrawer>

      {/* ========================================================================= */}
      {/* DRAWER 3: DESTINATION & MULTI-STORAGE LOCATIONS MANAGER (STEP 5)          */}
      {/* ========================================================================= */}
      <DetailDrawer
        open={destinationDrawerOpen && !isPresetLocked}
        onClose={() => showWorkflowStep(2)}
        title="Storage Destinations Manager"
        subtitle="Configure primary storage and simultaneous remote recording targets"
        width="max-w-[640px]"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => handleTestStorageConnection()}
              disabled={testingConnection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {testingConnection && !testingLocationId ? (
                <FiRefreshCw className="animate-spin" />
              ) : (
                <FiDisc />
              )}
              {testingConnection && !testingLocationId
                ? "Testing All Destinations…"
                : "Test All Destinations & Access"}
            </button>

            <button
              type="button"
              onClick={() => showWorkflowStep(2)}
              className="h-8 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white hover:bg-violet-700"
            >
              Save &amp; Close
            </button>
          </div>
        }
        inlineTarget={workflowInlinePanelRef.current}
      >
        <div className="space-y-3">
          {/* Storage Capacity Status Banner */}
          {storageStatus && (
            <div
              className={`rounded-xl border p-3 text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                storageStatus.isFull
                  ? "border-rose-300 bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200"
                  : storageStatus.isWarning
                    ? "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <FiHardDrive size={16} />
                <span className="font-bold">
                  Target Disk ({storageStatus.mount}):
                </span>
                <span>
                  {storageStatus.usedFmt} / {storageStatus.sizeFmt} (
                  {storageStatus.usePercent.toFixed(1)}% used,{" "}
                  {storageStatus.availableFmt} free)
                </span>
                {storageStatus.path && (
                  <span className="font-mono break-all">{storageStatus.path}</span>
                )}
              </div>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${storageStatus.isFull ? "bg-rose-200 text-rose-900" : "bg-emerald-200 text-emerald-900"}`}
              >
                {storageStatus.isFull
                  ? "CRITICAL STORAGE"
                  : "STORAGE HEALTHY (<98%)"}
              </span>
            </div>
          )}

          {/* Network Media Folder Access (SMB / Universal & FTP) */}
          {networkShares && (
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-purple-50/60 p-4 dark:border-violet-800/60 dark:from-violet-950/30 dark:via-[#1E1130] dark:to-[#25163C] shadow-xs space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200/80 pb-2.5 dark:border-violet-800/50">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white shadow-xs">
                    <FiGlobe size={14} />
                  </span>
                  <div>
                    <h4 className="text-[13px] font-extrabold text-slate-900 dark:text-white">
                      Universal Network Media Share (SMB · FTP · Web)
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD]">
                      Access parent <code className="font-mono font-bold text-violet-700 dark:text-violet-300">media</code> folder directly across Windows, macOS, Linux, and FTP clients (User roles configured in System Admin)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-[#B9A5CD]">Interface IP:</span>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const rawList = [
                        ...(networkShares.interfaces || []).map((i) => ({ address: i.address, label: `${i.address} (${i.name})` })),
                        ...(typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
                          ? [{ address: window.location.hostname, label: `${window.location.hostname} (Current Host)` }]
                          : [])
                      ].filter(i => i.address && i.address !== '127.0.0.1');

                      const seen = new Set();
                      const candidateIps = rawList.filter(item => {
                        if (seen.has(item.address)) return false;
                        seen.add(item.address);
                        return true;
                      });

                      return candidateIps.length > 0 ? (
                        <select
                          value={networkShares.primaryIp}
                          onChange={(e) => handleUpdateCustomIp(e.target.value)}
                          className="h-7 text-[11px] font-mono font-bold rounded-lg border border-violet-300 bg-white px-2 dark:bg-[#25163C] dark:border-violet-700 dark:text-white outline-none"
                        >
                          {candidateIps.map((iface) => (
                            <option key={iface.address} value={iface.address}>
                              {iface.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono font-bold text-[11px] text-violet-700 dark:text-violet-300 px-2 py-0.5 bg-white dark:bg-[#25163C] rounded border border-violet-200 dark:border-violet-700">
                          {networkShares.primaryIp}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Windows Host SMB Setup Banner if bare-metal Windows */}
              {networkShares.windowsStatus?.isWindows && !networkShares.windowsStatus?.isShared && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30 text-[11px] space-y-2">
                  <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-1.5">
                      <FiAlertCircle size={14} className="text-amber-600 shrink-0" />
                      <span>Windows Host SMB Share Setup Required (\\{networkShares.primaryIp}\media)</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await callApi("/api/system/setup-windows-share", { method: "POST" });
                          if (res.success) {
                            toast.success(res.message);
                            loadNetworkShares();
                          } else {
                            toast.error(res.error || "Administrator privileges required to create Windows share");
                          }
                        } catch (e: any) {
                          toast.error(e?.message || "Failed to auto-configure Windows share");
                        }
                      }}
                      className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[10px] hover:bg-amber-700 transition-colors shrink-0 shadow-xs"
                    >
                      Auto-Configure Share
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-tight">
                    On Windows bare-metal hosts, Windows requires the folder to be shared once. Run as Administrator in CMD/PowerShell:
                  </p>
                  <div className="flex items-center justify-between bg-white dark:bg-[#1E1130] p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60">
                    <code className="font-mono text-[10px] text-slate-800 dark:text-slate-200 truncate">
                      {networkShares.windowsStatus?.setupCommand || 'net share media="C:\\Kashtrix\\media" /grant:Everyone,FULL /unlimited'}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(networkShares.windowsStatus?.setupCommand || '', "Windows Setup Command")}
                      className="ml-2 px-2 py-0.5 rounded bg-amber-600 text-white text-[9.5px] font-bold hover:bg-amber-700 transition-colors shrink-0"
                    >
                      Copy Command
                    </button>
                  </div>
                </div>
              )}

              {/* Network Share URL Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* SMB / CIFS Universal Share */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <FiShare2 size={12} />
                        <span>SMB / CIFS Share (Universal)</span>
                      </span>
                      <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.2 rounded">
                        Port 445
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center justify-between bg-white/90 dark:bg-[#1E1130] p-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/40">
                        <div className="min-w-0">
                          <span className="text-[8.5px] uppercase font-bold text-slate-400 block">Windows / UNC:</span>
                          <span className="font-mono font-bold text-[11px] text-slate-800 dark:text-white truncate block" title={networkShares.smb.parentPath}>
                            {networkShares.smb.parentPath}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(networkShares.smb.parentPath, "Parent media SMB path (\\\\IP\\media)")}
                          className="ml-2 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition-colors shrink-0"
                          title="Copy \\IP\media"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-white/90 dark:bg-[#1E1130] p-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/40">
                        <div className="min-w-0">
                          <span className="text-[8.5px] uppercase font-bold text-slate-400 block">macOS / Finder:</span>
                          <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate block" title={networkShares.smb.macUrl || `smb://${networkShares.primaryIp}/media`}>
                            {networkShares.smb.macUrl || `smb://${networkShares.primaryIp}/media`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(networkShares.smb.macUrl || `smb://${networkShares.primaryIp}/media`, "macOS SMB URL")}
                          className="ml-2 px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-800 dark:text-emerald-300 text-[9px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shrink-0"
                          title="Copy smb:// URL"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-[9.5px] text-emerald-900/90 dark:text-emerald-200/90 pt-1 leading-tight">
                    💡 Connect via File Explorer, Finder (Go &gt; Connect to Server), or Linux CIFS.
                  </p>
                </div>

                {/* FTP Network URL */}
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/60 dark:bg-violet-950/20 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                        <FiFolder size={12} />
                        <span>FTP &amp; Web Browser Access</span>
                      </span>
                      <span className="text-[9px] font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/50 px-1.5 py-0.2 rounded">
                        Port 21
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center justify-between bg-white/90 dark:bg-[#1E1130] p-1.5 rounded-lg border border-violet-200/80 dark:border-violet-900/40">
                        <div className="min-w-0">
                          <span className="text-[8.5px] uppercase font-bold text-slate-400 block">FTP URL:</span>
                          <span className="font-mono font-bold text-[11px] text-slate-800 dark:text-white truncate block" title={networkShares.ftp.url}>
                            {networkShares.ftp.url}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(networkShares.ftp.url, "FTP URL (ftp://IP/media)")}
                          className="ml-2 px-2 py-0.5 rounded bg-violet-600 text-white text-[10px] font-bold hover:bg-violet-700 transition-colors shrink-0"
                          title="Copy FTP URL"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="flex items-center justify-between bg-white/90 dark:bg-[#1E1130] p-1.5 rounded-lg border border-violet-200/80 dark:border-violet-900/40">
                        <div className="min-w-0">
                          <span className="text-[8.5px] uppercase font-bold text-slate-400 block">Direct Web URL:</span>
                          <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate block" title={networkShares.http.url}>
                            {networkShares.http.url}
                          </span>
                        </div>
                        <a
                          href={networkShares.http.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 px-1.5 py-0.5 rounded border border-violet-300 text-violet-800 dark:text-violet-300 text-[9px] font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors shrink-0 flex items-center gap-1"
                          title="Open HTTP Browser"
                        >
                          <span>Open</span>
                          <FiExternalLink size={9} />
                        </a>
                      </div>
                    </div>
                  </div>
                  <p className="text-[9.5px] text-violet-900/90 dark:text-violet-200/90 pt-1 leading-tight">
                    📁 Compatible with FileZilla, Adobe Premiere, browser download, and Playout Ingest.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Test Results Banner (Rigorously showing real accessibility status) */}
          {testResult && (
            <div
              className={`rounded-xl border p-3 text-[11px] space-y-2 ${
                testResult.success
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-200"
                  : "border-rose-200 bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200"
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-grid h-4 w-4 place-items-center rounded-full text-white text-[10px] ${testResult.success ? "bg-emerald-600" : "bg-rose-600"}`}
                  >
                    {testResult.success ? "✓" : "✗"}
                  </span>
                  <span>{testResult.message}</span>
                </div>
                {testResult.total && testResult.total > 1 ? (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-white/80 dark:bg-black/40 border border-current">
                    {testResult.passed}/{testResult.total} Verified
                  </span>
                ) : null}
              </div>

              {testResult.results && testResult.results.length > 0 && (
                <div className="space-y-1.5 pt-1.5 border-t border-current/20">
                  {testResult.results.map((r, idx) => (
                    <div
                      key={r.id || idx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] font-mono"
                    >
                      <span>
                        {r.name || `Destination #${idx + 1}`} (
                        {r.storageType.toUpperCase()}):
                      </span>
                      <span
                        className={
                          r.success
                            ? "text-emerald-700 dark:text-emerald-300 font-bold"
                            : "text-rose-700 dark:text-rose-300 font-bold"
                        }
                      >
                        {r.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Storage Locations List */}
          {(() => {
            const locations: StorageLocation[] =
              activeConfig.storageLocations &&
              activeConfig.storageLocations.length > 0
                ? activeConfig.storageLocations
                : [
                    {
                      id: "primary",
                      name: "Primary Storage",
                      storageType: activeConfig.storageType || "local",
                      storagePath:
                        activeConfig.storagePath || PROJECT_RECORDINGS_PATH,
                      smbShare: activeConfig.smbShare,
                      ftpHost: activeConfig.ftpHost,
                      s3Bucket: activeConfig.s3Bucket,
                      enabled: true,
                    },
                  ];

            const updateLocations = (newLocs: StorageLocation[]) => {
              const primary = newLocs.find((l) => l.enabled) || newLocs[0];
              patch({
                storageLocations: newLocs,
                storageType: primary?.storageType || "local",
                storagePath: primary?.storagePath || PROJECT_RECORDINGS_PATH,
                smbShare: primary?.smbShare,
                ftpHost: primary?.ftpHost,
                s3Bucket: primary?.s3Bucket,
              });
            };

            const patchLocation = (
              locId: string,
              updates: Partial<StorageLocation>,
            ) => {
              updateLocations(
                locations.map((l) =>
                  l.id === locId ? { ...l, ...updates } : l,
                ),
              );
            };

            const removeLocation = (locId: string) => {
              if (locations.length <= 1) return;
              updateLocations(locations.filter((l) => l.id !== locId));
            };

            const addLocation = () => {
              const nextLoc: StorageLocation = {
                id: `loc_${Date.now()}`,
                name: `Storage Destination ${locations.length + 1}`,
                storageType: locations.length === 1 ? "smb" : "local",
                storagePath:
                  locations.length === 1 ? "" : "media/recordings-backup",
                smbShare:
                  locations.length === 1 ? "\\\\192.168.1.100\\recordings" : "",
                enabled: true,
              };
              updateLocations([...locations, nextLoc]);
            };

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-slate-800 dark:text-white">
                    Simultaneous Storage Destinations ({locations.length})
                  </span>
                  <button
                    type="button"
                    onClick={addLocation}
                    className="flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-800 dark:text-violet-300"
                  >
                    <FiPlus size={13} /> Add Storage Location
                  </button>
                </div>

                <div className="space-y-3">
                  {locations.map((loc, locIdx) => (
                    <div
                      key={loc.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5 dark:bg-[#25163C] dark:border-[#371F59]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-violet-100 text-violet-700 px-2 py-0.5 text-[9px] font-bold uppercase dark:bg-violet-950 dark:text-violet-300">
                            {loc.storageType || "LOCAL"}
                          </span>
                          <input
                            type="text"
                            value={loc.name || `Destination #${locIdx + 1}`}
                            onChange={(e) =>
                              patchLocation(loc.id, { name: e.target.value })
                            }
                            className="h-6 rounded border border-transparent hover:border-slate-300 focus:border-violet-600 px-1 text-[11px] font-bold text-slate-800 dark:text-white bg-transparent outline-none"
                            placeholder="Storage alias..."
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={testingConnection}
                            onClick={() => handleTestStorageConnection(loc)}
                            className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-700 border border-violet-200 hover:bg-violet-50 dark:bg-[#1E1130] dark:border-violet-800 dark:text-violet-300"
                          >
                            {testingLocationId === loc.id ? (
                              <FiRefreshCw className="animate-spin" size={10} />
                            ) : (
                              <FiDisc size={10} />
                            )}
                            Test Target
                          </button>

                          <label className="flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-[#B9A5CD] cursor-pointer ml-1">
                            <input
                              type="checkbox"
                              checked={loc.enabled !== false}
                              onChange={(e) =>
                                patchLocation(loc.id, {
                                  enabled: e.target.checked,
                                })
                              }
                              className="rounded text-violet-600"
                            />
                            <span>Active</span>
                          </label>

                          {locations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLocation(loc.id)}
                              className="text-slate-400 hover:text-rose-600 p-0.5 transition-colors"
                            >
                              <FiTrash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Protocol Parameters */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <Label>
                          Storage Protocol
                          <select
                            value={loc.storageType || "local"}
                            onChange={(e) =>
                              patchLocation(loc.id, {
                                storageType: e.target.value as any,
                              })
                            }
                            className={selectClass}
                          >
                            <option value="local">Local Disk Directory</option>
                            <option value="smb">
                              Network Share (SMB / NAS)
                            </option>
                            <option value="ftp">FTP / SFTP Server</option>
                            <option value="s3">AWS S3 / Cloud Bucket</option>
                          </select>
                        </Label>

                        {(!loc.storageType || loc.storageType === "local") && (
                          <Label>
                            Local Path
                            <input
                              type="text"
                              value={loc.storagePath || PROJECT_RECORDINGS_PATH}
                              onChange={(e) =>
                                patchLocation(loc.id, {
                                  storagePath: e.target.value,
                                })
                              }
                              placeholder={PROJECT_RECORDINGS_PATH}
                              className={inputClass}
                            />
                          </Label>
                        )}

                        {loc.storageType === "smb" && (
                          <Label>
                            SMB Share UNC Path
                            <input
                              type="text"
                              value={loc.smbShare || ""}
                              onChange={(e) =>
                                patchLocation(loc.id, {
                                  smbShare: e.target.value,
                                })
                              }
                              placeholder="\\192.168.1.100\recordings"
                              className={inputClass}
                            />
                          </Label>
                        )}

                        {loc.storageType === "ftp" && (
                          <Label>
                            FTP Host / IP
                            <input
                              type="text"
                              value={loc.ftpHost || ""}
                              onChange={(e) =>
                                patchLocation(loc.id, {
                                  ftpHost: e.target.value,
                                })
                              }
                              placeholder="ftp.broadcast.tv"
                              className={inputClass}
                            />
                          </Label>
                        )}

                        {loc.storageType === "s3" && (
                          <Label>
                            S3 Bucket Name
                            <input
                              type="text"
                              value={loc.s3Bucket || ""}
                              onChange={(e) =>
                                patchLocation(loc.id, {
                                  s3Bucket: e.target.value,
                                })
                              }
                              placeholder="s3://bucket-name"
                              className={inputClass}
                            />
                          </Label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </DetailDrawer>

      {/* ========================================================================= */}
      {/* MODAL 1: SAVE SETUP AS PRESET / MODIFY PRESET                             */}
      {/* ========================================================================= */}
      <DetailDrawer
        open={saveSetupModalOpen}
        onClose={() => setSaveSetupModalOpen(false)}
        title={saveMode === "overwrite" ? "Modify & Save Preset" : "Save as New Preset"}
        subtitle="Save hardware source, broadcast profile, file template, and default load behavior"
        width="max-w-[500px]"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setSaveSetupModalOpen(false)}
              className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSavePreset}
              className="h-8 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white hover:bg-violet-700 shadow-xs flex items-center gap-1.5"
            >
              <FiSave size={13} />
              <span>{saveMode === "overwrite" ? "Update Preset in Database" : "Save as New Preset"}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Preset Destination Mode Switcher when loadedPresetId exists */}
          {loadedPresetId && loadedPreset && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 dark:bg-[#25163C] dark:border-[#371F59] grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  setSaveMode("overwrite");
                  setSetupNameInput(loadedPreset.name);
                }}
                className={`py-2 px-3 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                  saveMode === "overwrite"
                    ? "bg-violet-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-[#B9A5CD] dark:hover:text-white"
                }`}
              >
                <FiRefreshCw size={12} />
                <span>Update Loaded Preset</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaveMode("create");
                  setSetupNameInput(`${sourceName} Copy`);
                }}
                className={`py-2 px-3 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                  saveMode === "create"
                    ? "bg-violet-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-[#B9A5CD] dark:hover:text-white"
                }`}
              >
                <FiPlus size={12} />
                <span>Save as New Preset</span>
              </button>
            </div>
          )}

          {/* Preset Name */}
          <div>
            <Label>
              {saveMode === "overwrite" ? "Preset Name (Rename or Keep)" : "New Preset Name"}
              <input
                type="text"
                value={setupNameInput}
                onChange={(e) => setSetupNameInput(e.target.value)}
                placeholder="e.g. Master Studio Ingest 1080p50"
                className={inputClass}
              />
            </Label>
          </div>

          {/* Default Editing Mode on Load */}
          <div className="space-y-2">
            <Label>Default Editing Mode on Load</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSetupDefaultEditingMode(true)}
                className={`p-3 rounded-xl border text-left transition relative flex flex-col justify-between space-y-1.5 ${
                  setupDefaultEditingMode
                    ? "border-violet-600 bg-violet-50/70 dark:bg-violet-950/40 dark:border-violet-500 ring-1 ring-violet-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:bg-[#25163C] dark:border-[#371F59]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FiUnlock size={14} className={setupDefaultEditingMode ? "text-violet-600 dark:text-violet-400" : "text-slate-400"} />
                    <span className="text-[12px] font-bold text-slate-900 dark:text-white">Enable Editing</span>
                  </div>
                  {setupDefaultEditingMode && <FiCheckCircle size={14} className="text-violet-600 dark:text-violet-400" />}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD] leading-snug">
                  Opens in interactive setup mode with full workflow stepper and configuration options available.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSetupDefaultEditingMode(false)}
                className={`p-3 rounded-xl border text-left transition relative flex flex-col justify-between space-y-1.5 ${
                  !setupDefaultEditingMode
                    ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 dark:border-emerald-500 ring-1 ring-emerald-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:bg-[#25163C] dark:border-[#371F59]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FiLock size={14} className={!setupDefaultEditingMode ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"} />
                    <span className="text-[12px] font-bold text-slate-900 dark:text-white">Disable Editing (Locked)</span>
                  </div>
                  {!setupDefaultEditingMode && <FiCheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" />}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD] leading-snug">
                  Opens directly in locked broadcast view with left-side controls &amp; medium confidence monitor.
                </p>
              </button>
            </div>
          </div>

          {/* Configuration Summary Pill */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 dark:bg-[#25163C] dark:border-[#371F59] dark:text-[#B9A5CD] space-y-1">
            <p className="font-semibold text-slate-800 dark:text-white flex items-center justify-between">
              <span>Preset Configuration:</span>
              <span className="text-[10px] uppercase font-bold text-violet-600 dark:text-violet-400">
                {setupDefaultEditingMode ? "Loads in Editing Mode" : "Loads in Locked Mode"}
              </span>
            </p>
            <p>• Source: {sourceName} ({resolvedInputPort})</p>
            <p>• Profile: {activeConfig.videoCodec?.toUpperCase()} @ {activeConfig.videoBitrate}k (Max: {activeConfig.maxBitrate}k)</p>
            <p>• Containers: {activeFormats.join(", ").toUpperCase()} | Filename: {activeConfig.fileName || "{channel}_{date}_{time}"}</p>
          </div>
        </div>
      </DetailDrawer>

      {/* ========================================================================= */}
      {/* MODAL 2: MANAGE RECORDING PRESETS                                         */}
      {/* ========================================================================= */}
      <DetailDrawer
        open={managePresetsOpen}
        onClose={() => {
          setEditingPresetId(null);
          setManagePresetsOpen(false);
        }}
        title="Manage Recording Presets"
        subtitle="View, rename, load, delete, or toggle default load mode for broadcast recording presets"
        width="max-w-[580px]"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={handleResetPresets}
              className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:bg-[#25163C] dark:border-[#371F59] dark:text-slate-200"
              title="Reset all presets back to system broadcast standards"
            >
              Reset to Defaults
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingPresetId(null);
                setManagePresetsOpen(false);
              }}
              className="h-8 rounded-lg bg-violet-600 px-4 text-[11px] font-bold text-white hover:bg-violet-700"
            >
              Done
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD]">
            Click <FiStar size={10} className="inline text-amber-500" /> to set auto-load default. Click the lock/unlock badge to change default editing mode on load. Click <FiEdit3 size={10} className="inline text-violet-500" /> to rename.
          </p>
          {savedPresets.map((preset) => {
            const isBuiltIn = DEFAULT_PRESETS.some((dp) => dp.id === preset.id);
            const isSelected = selectedPresetId === preset.id;
            const isUserDefault = defaultPresetId === preset.id;
            const isEditing = editingPresetId === preset.id;
            const isEditingEnabledOnLoad = preset.defaultEditingEnabled !== undefined
              ? preset.defaultEditingEnabled
              : (preset.config?.defaultEditingEnabled !== undefined ? preset.config.defaultEditingEnabled : true);

            return (
              <div
                key={preset.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3 transition ${
                  isSelected
                    ? "border-violet-600 bg-violet-50/50 dark:bg-violet-950/30 dark:border-violet-500"
                    : "border-slate-200 bg-white dark:bg-[#25163C] dark:border-[#371F59]"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingPresetName}
                        onChange={(e) => setEditingPresetName(e.target.value)}
                        className="h-7 px-2 text-[12px] font-bold rounded border border-violet-400 bg-white dark:bg-[#1E1130] dark:text-white outline-none flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenamePreset(preset.id, editingPresetName);
                          if (e.key === "Escape") setEditingPresetId(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRenamePreset(preset.id, editingPresetName)}
                        className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700"
                        title="Save name"
                      >
                        <FiCheck size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPresetId(null)}
                        className="p-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-[#371F59] dark:text-slate-300"
                        title="Cancel"
                      >
                        <FiSquare size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-bold text-[12px] text-slate-900 dark:text-white truncate max-w-[220px]">
                        {preset.name}
                      </h5>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPresetId(preset.id);
                          setEditingPresetName(preset.name);
                        }}
                        className="text-slate-400 hover:text-violet-600 dark:hover:text-violet-400"
                        title="Rename preset"
                      >
                        <FiEdit3 size={12} />
                      </button>
                      {isBuiltIn && (
                        <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.2 text-[9px] font-bold uppercase dark:bg-slate-800 dark:text-slate-300">
                          Broadcast
                        </span>
                      )}
                      {isUserDefault && (
                        <span className="rounded bg-amber-100 text-amber-700 px-1.5 py-0.2 text-[9px] font-bold uppercase dark:bg-amber-900/40 dark:text-amber-300">
                          ★ Default
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD] truncate">
                    {preset.config?.resolution || "source"} | {preset.config?.videoCodec?.toUpperCase()}{" "}
                    {preset.config?.videoBitrate}k CBR | Max{" "}
                    {preset.config?.maxBitrate}k |{" "}
                    {preset.config?.formats?.join(", ").toUpperCase()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Load mode toggle badge */}
                  <button
                    type="button"
                    onClick={() => handleTogglePresetDefaultEditing(preset)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition ${
                      isEditingEnabledOnLoad
                        ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/60 dark:border-violet-800 dark:text-violet-300"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300"
                    }`}
                    title="Click to toggle default editing mode on load (Editable vs Locked)"
                  >
                    {isEditingEnabledOnLoad ? <FiUnlock size={10} /> : <FiLock size={10} />}
                    <span>{isEditingEnabledOnLoad ? "Load: Editable" : "Load: Locked"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetDefaultPreset(preset.id)}
                    className={`p-1.5 rounded-lg border transition ${
                      isUserDefault
                        ? "border-amber-400 bg-amber-50 text-amber-600 hover:text-amber-700 dark:bg-amber-950/60 dark:border-amber-600 dark:text-amber-300"
                        : "border-slate-200 bg-slate-50 text-slate-400 hover:text-amber-500 dark:bg-[#1E1130] dark:border-[#371F59] dark:text-slate-500"
                    }`}
                    title={isUserDefault ? "Default preset (Click to remove default)" : "Set as default preset in database"}
                  >
                    <FiStar size={14} className={isUserDefault ? "fill-amber-500 text-amber-500" : ""} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleLoadPreset(preset.id);
                      setManagePresetsOpen(false);
                    }}
                    className="rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-1 text-[10px] font-bold text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:border-violet-800 dark:text-violet-300"
                    title="Load preset into active recording configuration"
                  >
                    Load
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Are you sure you want to delete preset "${preset.name}" from database?`)
                      ) {
                        handleDeletePreset(preset.id);
                      }
                    }}
                    className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300 transition"
                    title="Delete preset from database"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DetailDrawer>
    </div>
  );
};

export default ProfessionalRecordingControl;
