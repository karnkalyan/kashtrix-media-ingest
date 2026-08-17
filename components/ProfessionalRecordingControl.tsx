import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiDisc, FiEye, FiEyeOff, FiRefreshCw, FiVideo, FiSquare, FiMaximize, FiMinimize } from 'react-icons/fi';
import { IngestRecordingOptions, TranscodingProfile, VideoCodec } from '../types';
import DetailDrawer from './ui/DetailDrawer';

type Format = IngestRecordingOptions['formats'][number];

export interface SavedRecordingPreset {
  id: string;
  name: string;
  sourceType: 'device' | 'ingest';
  videoDevice?: string;
  audioDevice?: string;
  selectedStreamKey?: string;
  config: IngestRecordingOptions;
  createdAt: string;
}

const DEFAULT_PRESETS: SavedRecordingPreset[] = [
  {
    id: 'preset-decklink-50mbps',
    name: 'DeckLink Master 1080p50 (50 Mbps NVENC CBR)',
    sourceType: 'device',
    videoDevice: 'Intensity Pro 4K',
    audioDevice: 'Intensity Pro 4K',
    config: {
      autoRecord: false,
      fileName: '{channel}_{date}_{time}',
      formats: ['mp4'],
      encoder: 'nvidia',
      videoCodec: 'h264',
      rateControl: 'cbr',
      resolution: 'source',
      framerate: 50,
      videoBitrate: 50000,
      maxBitrate: 55000,
      preset: 'fast',
      gopSize: 60,
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      videoInput: 'hdmi',
      storageType: 'local',
      storagePath: '/media/recordings',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset-broadcast-15mbps',
    name: 'Broadcast Standard 1080p50 (15 Mbps NVENC)',
    sourceType: 'device',
    videoDevice: 'Intensity Pro 4K',
    audioDevice: 'Intensity Pro 4K',
    config: {
      autoRecord: false,
      fileName: '{channel}_{date}_{time}',
      formats: ['mp4'],
      encoder: 'nvidia',
      videoCodec: 'h264',
      rateControl: 'cbr',
      resolution: 'source',
      framerate: 50,
      videoBitrate: 15000,
      maxBitrate: 18000,
      preset: 'fast',
      gopSize: 60,
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      videoInput: 'hdmi',
      storageType: 'local',
      storagePath: '/media/recordings',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preset-ingest-copy',
    name: 'Live Ingest Direct Archive (Stream Copy)',
    sourceType: 'ingest',
    config: {
      autoRecord: false,
      fileName: '{channel}_{date}_{time}',
      formats: ['mp4'],
      encoder: 'copy',
      videoCodec: 'h264',
      rateControl: 'cbr',
      resolution: 'source',
      framerate: 50,
      videoBitrate: 50000,
      maxBitrate: 55000,
      preset: 'fast',
      gopSize: 60,
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioBitrate: 192,
      sampleRate: 48000,
      audioChannels: 2,
      continuous: true,
      storageType: 'local',
      storagePath: '/media/recordings',
    },
    createdAt: new Date().toISOString(),
  },
];

const PRESETS_STORAGE_KEY = 'kte-saved-recording-configs';

const getSavedPresets = (): SavedRecordingPreset[] => {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
};

const defaultConfig: IngestRecordingOptions = {
  autoRecord: false,
  fileName: '{channel}_{date}_{time}',
  formats: ['mp4'],
  encoder: 'nvidia',
  videoCodec: 'h264',
  rateControl: 'cbr',
  resolution: 'source',
  framerate: 50,
  videoBitrate: 50000,
  maxBitrate: 55000,
  preset: 'fast',
  gopSize: 60,
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
  audioBitrate: 192,
  sampleRate: 48000,
  audioChannels: 2,
  continuous: true,
};

interface Props {
  config?: IngestRecordingOptions;
  setConfig?: React.Dispatch<React.SetStateAction<IngestRecordingOptions>>;
  sourceType?: 'ingest' | 'device';
  setSourceType?: (value: 'ingest' | 'device') => void;
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
  stopRecording?: () => void;
  profiles?: TranscodingProfile[];
}

const selectClass = 'mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[11px] disabled:bg-slate-100';
const inputClass = 'mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[11px]';
const Label: React.FC<React.PropsWithChildren> = ({ children }) => <label className="min-w-0 text-[10px] font-medium text-slate-700">{children}</label>;
const encoderFromProfile = (profile?: TranscodingProfile): IngestRecordingOptions['encoder'] => {
  const codec = String(profile?.videoCodec || '').toLowerCase();
  if (codec.includes('nvenc')) return 'nvidia';
  if (codec.includes('qsv')) return 'intel';
  if (codec.includes('amf')) return 'amd';
  if (codec === VideoCodec.Copy || codec === 'copy') return 'copy';
  return 'cpu';
};

const ProfessionalRecordingControl: React.FC<Props> = ({
  config = defaultConfig,
  setConfig = () => {},
  sourceType = 'ingest',
  setSourceType = () => {},
  streams = {},
  selectedStreamKey = '',
  setSelectedStreamKey = () => {},
  videoDevices = [],
  audioDevices = [],
  videoDevice = '',
  audioDevice = '',
  setVideoDevice = () => {},
  setAudioDevice = () => {},
  refreshDevices = () => {},
  devicesLoading = false,
  toggleFormat = () => {},
  save = () => {},
  saving = false,
  start = () => {},
  isRecordingActive = false,
  stopRecording = () => {},
  profiles = [],
}) => {
  const [profileId, setProfileId] = useState('source-default');
  const [previewing, setPreviewing] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewTime, setPreviewTime] = useState(0);
  const [detectedResolution, setDetectedResolution] = useState('');
  const [detectedFramerate, setDetectedFramerate] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; directories?: string[] } | null>(null);
  const [recordPreviewModalOpen, setRecordPreviewModalOpen] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  useEffect(() => {
    let timer: any;
    if (isRecordingActive) {
      timer = setInterval(() => {
        setRecordingElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingElapsed(0);
    }
    return () => clearInterval(timer);
  }, [isRecordingActive]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const devicePreviewIdRef = useRef<string | null>(null);
  const previewGenerationRef = useRef(0);

  const activeConfig = config || defaultConfig;

  const handleTestStorageConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/storage/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(activeConfig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Storage connection test failed');
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'Connection failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  const patch = (values: Partial<IngestRecordingOptions>) => {
    if (typeof setConfig === 'function') {
      setConfig(previous => ({ ...(previous || defaultConfig), ...values }));
    }
  };

  const encodingDisabled = activeConfig.encoder === 'copy';
  const selectedProfile = profiles.find(item => item.id === profileId);
  const profileControlsHardware = !!selectedProfile;
  const startDisabled = sourceType === 'device' ? !videoDevice && !audioDevice : !selectedStreamKey;
  const sourceName = sourceType === 'device'
    ? (videoDevice || audioDevice || 'channel')
    : (streams[selectedStreamKey]?.name || selectedStreamKey.split('/').pop() || 'channel');
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const previewBase = (activeConfig.fileName || '{channel}_{date}_{time}')
    .replace(/\{channel\}/gi, sourceName.replace(/[^a-z0-9._-]+/gi, '-'))
    .replace(/\{date\}/gi, localDate)
    .replace(/\{time\}/gi, 'HH-MM-SS')
    .replace(/\{timestamp\}/gi, String(Date.now()));

  const releaseDevicePreview = useCallback((previewId: string) => {
    const token = localStorage.getItem('kte-auth-token');
    fetch(`/api/ingest/device-preview/${encodeURIComponent(previewId)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      keepalive: true,
    }).catch(() => {});
  }, []);

  const toggleFullscreen = () => {
    if (!previewContainerRef.current) return;
    if (!document.fullscreenElement) {
      previewContainerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const stopPreview = useCallback(async () => {
    previewGenerationRef.current += 1;
    const currentId = devicePreviewIdRef.current;
    devicePreviewIdRef.current = null;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    setPreviewStarting(false);
    setPreviewing(false);
    setPreviewTime(0);
    setDetectedResolution('');
    setDetectedFramerate('');

    if (currentId) {
      const token = localStorage.getItem('kte-auth-token');
      try {
        await fetch(`/api/ingest/device-preview/${encodeURIComponent(currentId)}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {}
    }
  }, []);

  useEffect(() => {
    return () => {
      void stopPreview();
    };
  }, [stopPreview]);

  useEffect(() => {
    if (previewing || previewStarting) {
      void stopPreview();
    }
  }, [sourceType, selectedStreamKey, videoDevice, audioDevice]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSourcePreview = async () => {
    stopPreview();
    const generation = previewGenerationRef.current;
    setPreviewError('');
    setPreviewStarting(true);

    const attachHls = async (hlsUrl: string) => {
      const Hls = (await import('hls.js')).default;
      if (generation !== previewGenerationRef.current || !videoRef.current) return;
      const video = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls({ liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 5 });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
        hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
          if (hls.levels?.[0]) {
            const lvl = hls.levels[0];
            if (lvl.width && lvl.height) {
              setDetectedResolution(`${lvl.width}x${lvl.height}`);
            }
            if (lvl.frameRate) {
              setDetectedFramerate(`${Math.round(lvl.frameRate)} fps`);
            }
          }
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || generation !== previewGenerationRef.current) return;
          stopPreview();
          setPreviewError(`Preview stream failed: ${data.details || 'HLS playback error'}`);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
      } else {
        throw new Error('HLS preview playback is not supported by this browser');
      }
      setPreviewing(true);
      await video.play().catch(() => {});
    };

    try {
      if (sourceType === 'device') {
        const token = localStorage.getItem('kte-auth-token');
        const response = await fetch('/api/ingest/device-preview/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            videoDevice,
            audioDevice,
            resolution: activeConfig.resolution,
            framerate: activeConfig.framerate,
            videoInput: activeConfig.videoInput || 'hdmi',
            formatCode: activeConfig.formatCode || '',
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'FFmpeg could not start the device preview');
        if (generation !== previewGenerationRef.current) {
          if (data.previewId) releaseDevicePreview(data.previewId);
          return;
        }
        devicePreviewIdRef.current = data.previewId;
        await attachHls(data.hlsUrl);
      } else if (selectedStreamKey) {
        const encodedStreamKey = selectedStreamKey.split('/').filter(Boolean).map(encodeURIComponent).join('/');
        await attachHls(`/hls/${encodedStreamKey}/index.m3u8`);
      }
    } catch (err: any) {
      if (generation === previewGenerationRef.current) {
        stopPreview();
        setPreviewError(`Unable to preview source: ${err.message || 'Unknown error'}`);
      }
    } finally {
      if (generation === previewGenerationRef.current) setPreviewStarting(false);
    }
  };

  const [savedPresets, setSavedPresets] = useState<SavedRecordingPreset[]>(getSavedPresets);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  const handleLoadPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = savedPresets.find(p => p.id === presetId);
    if (!preset) return;
    if (preset.sourceType) setSourceType(preset.sourceType);
    if (preset.videoDevice) setVideoDevice?.(preset.videoDevice);
    if (preset.audioDevice) setAudioDevice?.(preset.audioDevice);
    if (preset.selectedStreamKey) setSelectedStreamKey?.(preset.selectedStreamKey);
    if (preset.config) setConfig?.(preset.config);
  };

  const handleSavePreset = () => {
    const name = presetNameInput.trim() || `Config ${savedPresets.length + 1}`;
    const newPreset: SavedRecordingPreset = {
      id: `preset-${Date.now()}`,
      name,
      sourceType,
      videoDevice,
      audioDevice,
      selectedStreamKey,
      config: activeConfig,
      createdAt: new Date().toISOString(),
    };
    const updated = [newPreset, ...savedPresets.filter(p => p.name !== name)];
    setSavedPresets(updated);
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    setSelectedPresetId(newPreset.id);
    setSaveModalOpen(false);
    setPresetNameInput('');
    save?.();
  };

  const applyProfile = (id: string) => {
    setProfileId(id);
    if (id === 'source-default') {
      patch({
        encoder: sourceType === 'device' ? 'nvidia' : 'copy',
        videoCodec: 'h264',
        resolution: 'source',
        framerate: 50,
        rateControl: 'cbr',
        videoBitrate: 50000,
        maxBitrate: 55000,
        preset: 'fast',
        gopSize: 60,
        pixelFormat: 'yuv420p',
        audioCodec: 'aac',
        audioBitrate: 192,
        sampleRate: 48000,
        audioChannels: 2,
      });
      return;
    }
    if (id === 'custom') return;
    const profile = profiles.find(item => item.id === id);
    if (!profile) return;
    const codec = [VideoCodec.H265, VideoCodec.HEVC_NVENC, VideoCodec.HEVC_AMF, VideoCodec.HEVC_VIDEOTOOLBOX].includes(profile.videoCodec) ? 'hevc' : 'h264';
    const encoder = encoderFromProfile(profile);
    patch({
      encoder: sourceType === 'device' && encoder === 'copy' ? 'cpu' : encoder,
      videoCodec: codec,
      resolution: sourceType === 'device' ? 'source' : (profile.resolution === 'N/A' ? 'source' : (profile.resolution || 'source')),
      framerate: profile.framerate || (sourceType === 'device' ? 50 : 0),
      rateControl: profile.videoQualityMode === 'crf' ? 'crf' : 'cbr',
      videoBitrate: profile.videoBitrate || activeConfig.videoBitrate || 50000,
      maxBitrate: profile.maxrate || profile.videoBitrate || activeConfig.maxBitrate || 55000,
      crf: profile.crf || activeConfig.crf || 20,
      audioBitrate: profile.audioBitrate || activeConfig.audioBitrate || 192,
      sampleRate: profile.sampleRate || activeConfig.sampleRate || 48000,
      preset: (['ultrafast', 'fast', 'medium', 'slow'].includes(profile.preset || '') ? profile.preset : 'fast') as any,
      gopSize: Number(profile.gopSize) || Number(activeConfig.gopSize) || 60,
      pixelFormat: (['yuv420p', 'yuv422p', 'yuv444p'].includes(profile.pixelFormat || '') ? profile.pixelFormat : 'yuv420p') as any,
    });
  };

  const activeFormats = activeConfig.formats || ['mp4'];

  return <>
    {/* Saved Configurations & Presets Bar */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:bg-[#190E28] dark:border-[#311B4E]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-slate-700 dark:text-[#E2D1F9]">Saved Preset:</span>
        <select
          value={selectedPresetId}
          onChange={e => handleLoadPreset(e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-[#F8F7FA] px-2.5 text-[11px] font-medium text-slate-800 dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
        >
          <option value="">-- Load Saved Configuration --</option>
          {savedPresets.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sourceType === 'device' ? 'Hardware' : 'Ingest'})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPresetNameInput(`${sourceName} ${activeConfig.videoBitrate}k ${activeConfig.encoder.toUpperCase()}`);
            setSaveModalOpen(true);
          }}
          className="flex h-8 items-center gap-1.5 rounded-md border border-[#7C3AED] bg-[#7C3AED]/10 px-3 text-[11px] font-semibold text-[#7C3AED] hover:bg-[#7C3AED]/20 transition-colors"
        >
          Save Current Configuration
        </button>
      </div>
    </div>
    <div className="mt-3 grid min-w-0 items-start gap-3 xl:grid-cols-[300px_minmax(0,680px)]">
      <section className="app-panel min-w-0 p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="panel-kicker"><FiVideo /> Source & capture</h3>{sourceType === 'device' && <button type="button" onClick={refreshDevices} className="rounded-lg border border-[#E8DFF0] p-2 text-[#7C3AED] transition hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#A78BFA] dark:hover:bg-[#2D1A45]" title="Detect devices"><FiRefreshCw className={devicesLoading ? 'animate-spin' : ''} /></button>}</div>
        <div className="mb-4 grid grid-cols-2 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 dark:bg-[#211335] dark:border-[#371F59]">
          <button type="button" onClick={() => { setSourceType('device'); patch({ sourceType: 'device', ...(activeConfig.encoder === 'copy' ? { encoder: 'cpu' as const } : {}) }); }} className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${sourceType === 'device' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'}`}>Capture device</button>
          <button type="button" onClick={() => { setSourceType('ingest'); patch({ sourceType: 'ingest' }); }} className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${sourceType === 'ingest' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'}`}>Live ingest</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
        {sourceType === 'device' ? <>
          <Label>Video device<select value={videoDevice} onChange={event => setVideoDevice(event.target.value)} className={selectClass}><option value="">No video</option>{videoDevices.map(device => <option key={device} value={device}>{device}</option>)}</select>{!devicesLoading && !videoDevices.length && <span className="mt-1 block text-[10px] text-amber-600">No capture device detected.</span>}</Label>
          <Label>Audio device<select value={audioDevice} onChange={event => setAudioDevice(event.target.value)} className={selectClass}><option value="">No audio</option>{audioDevices.map(device => <option key={device} value={device}>{device}</option>)}</select></Label>
          <div className="grid grid-cols-2 gap-2">
            <Label>Video input
              <select value={activeConfig.videoInput || 'hdmi'} onChange={event => patch({ videoInput: event.target.value as any })} className={selectClass}>
                <option value="hdmi">HDMI</option>
                <option value="sdi">SDI</option>
                <option value="component">Component (YPbPr)</option>
                <option value="composite">Composite (CVBS)</option>
                <option value="s_video">S-Video</option>
                <option value="optical_sdi">Optical SDI</option>
                <option value="unset">Auto / Default</option>
              </select>
            </Label>
            <Label>Signal standard
              <select value={activeConfig.formatCode || ''} onChange={event => patch({ formatCode: event.target.value })} className={selectClass}>
                <option value="">Auto / Native</option>
                <option value="Hi50">1080i 50 fps (PAL Broadcast)</option>
                <option value="Hp50">1080p 50 fps</option>
                <option value="Hi60">1080i 60 fps</option>
                <option value="Hp60">1080p 60 fps</option>
                <option value="Hi59">1080i 59.94 fps (NTSC Broadcast)</option>
                <option value="Hp59">1080p 59.94 fps</option>
                <option value="25p ">1080p 25 fps</option>
                <option value="30p ">1080p 30 fps</option>
                <option value="24p ">1080p 24 fps</option>
                <option value="hp50">720p 50 fps</option>
                <option value="hp60">720p 60 fps</option>
                <option value="hp59">720p 59.94 fps</option>
                <option value="4k50">4K UHD 50 fps</option>
                <option value="4k60">4K UHD 60 fps</option>
                <option value="pal ">PAL 576i</option>
                <option value="ntsc">NTSC 480i</option>
              </select>
            </Label>
          </div>
        </> : <>
          <Label>Active RTMP/SRT ingest<select value={selectedStreamKey} onChange={event => setSelectedStreamKey(event.target.value)} className={selectClass}><option value="">Select active ingest</option>{Object.entries(streams).map(([key, value]: [string, any]) => <option key={key} value={key}>{value.name || key} ({value.app || 'live'})</option>)}</select>{!Object.keys(streams).length && <span className="mt-1 block text-[10px] text-amber-600">No ingest is publishing right now. Capture devices are still available in the other tab.</span>}</Label>
        </>}
        <div>
          <Label>Recording filename
            <input type="text" maxLength={180} value={activeConfig.fileName || ''} onChange={event => patch({ fileName: event.target.value })} placeholder="{channel}_{date}_{time}" className={inputClass} />
          </Label>
          <div className="mt-2 space-y-1 text-[9px] leading-relaxed text-slate-400">
            <span className="block">Placeholders: {'{channel}'} {'{date}'} {'{time}'} {'{timestamp}'}</span>
            <span className="block truncate font-mono text-violet-600">{previewBase}.{activeFormats[0] || 'mp4'}</span>
          </div>
        </div>
      </div>
        <button type="button" onClick={previewing ? stopPreview : startSourcePreview} disabled={startDisabled || previewStarting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40">{previewing ? <FiEyeOff size={13} /> : <FiEye size={13} />}{previewStarting ? 'Starting preview…' : previewing ? 'Close preview' : 'Preview source'}</button>
      </section>

      <section className="source-preview app-panel min-w-0 overflow-hidden bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.1em]">Source preview</p><p className="mt-0.5 text-[10px] text-slate-400">Live confidence monitor</p></div>
          <div className="flex items-center gap-2">
            {previewing && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-white hover:bg-white/20 transition-colors"
                title={isFullscreen ? 'Exit full screen' : 'Full screen preview'}
              >
                {isFullscreen ? <FiMinimize size={12} /> : <FiMaximize size={12} />}
                <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2 py-1 text-[9px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-pink-400" />LIVE</span>
          </div>
        </div>
        <div ref={previewContainerRef} className="relative aspect-video min-h-[180px] w-full bg-[#090d17]">
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedMetadata={event => {
              const v = event.currentTarget;
              if (v.videoWidth && v.videoHeight) {
                setDetectedResolution(`${v.videoWidth}x${v.videoHeight}`);
              }
            }}
            onTimeUpdate={event => {
              const v = event.currentTarget;
              setPreviewTime(v.currentTime);
              if (v.videoWidth && v.videoHeight && !detectedResolution) {
                setDetectedResolution(`${v.videoWidth}x${v.videoHeight}`);
              }
            }}
            className={`h-full w-full object-contain ${previewing ? 'block' : 'hidden'}`}
          />
          {!previewing && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-violet-200/50"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><FiEye size={23} /></span><span className="text-xs font-medium">Select a source and start preview</span></div>}
          {previewing && (
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-lg">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              LIVE PREVIEW {Math.floor(previewTime / 60).toString().padStart(2, '0')}:{Math.floor(previewTime % 60).toString().padStart(2, '0')}
            </div>
          )}
          {previewing && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur hover:bg-black/80 transition-colors"
              title={isFullscreen ? 'Exit full screen' : 'Full screen preview'}
            >
              {isFullscreen ? <FiMinimize size={13} /> : <FiMaximize size={13} />}
            </button>
          )}
          <div className="pointer-events-none absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center divide-x divide-white/15 rounded-xl border border-white/10 bg-slate-950/75 px-1 py-2 text-white backdrop-blur-md">
            <span className="px-3"><b className="block text-[11px]">{detectedResolution || (activeConfig.resolution !== 'source' ? activeConfig.resolution : '1920x1080')}</b><small className="text-[8px] text-slate-400">Resolution</small></span>
            <span className="px-3"><b className="block text-[11px]">{detectedFramerate || (activeConfig.framerate ? `${activeConfig.framerate} fps` : '50 fps')}</b><small className="text-[8px] text-slate-400">Frame rate</small></span>
            <span className="px-3"><b className="block text-[11px]">{activeConfig.videoBitrate} Kbps</b><small className="text-[8px] text-slate-400">Bitrate</small></span>
          </div>
        </div>
        {previewError && <p className="border-t border-amber-400/20 bg-amber-400/10 px-4 py-2 text-[10px] text-amber-200">{previewError}</p>}
      </section>
    </div>

    <div className="recording-settings-grid mt-3 grid grid-cols-1 gap-3 xl:grid-cols-4"><section className="app-panel p-4 xl:col-span-2">
      <h3 className="panel-kicker mb-4">Video encoding</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Label>Transcoding profile<select value={profileId} onChange={event => applyProfile(event.target.value)} className={selectClass}><option value="source-default">Native Source / Direct Capture (Default — No Re-encoding)</option><option value="custom">Custom recording settings</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Label>
        <Label>Video codec<select disabled={encodingDisabled} value={activeConfig.videoCodec} onChange={event => patch({ videoCodec: event.target.value as any })} className={selectClass}><option value="h264">H.264 / AVC</option><option value="hevc">H.265 / HEVC</option></select></Label>
        <Label>Rate control<select disabled={encodingDisabled} value={activeConfig.rateControl} onChange={event => patch({ rateControl: event.target.value as any })} className={selectClass}><option value="cbr">CBR broadcast</option><option value="vbr">VBR quality</option><option value="crf">Constant quality</option></select></Label>
        <Label>Resolution<select disabled={encodingDisabled} value={activeConfig.resolution} onChange={event => patch({ resolution: event.target.value })} className={selectClass}><option value="source">Source / original</option><option value="7680x4320">8K UHD</option><option value="3840x2160">4K UHD 2160p</option><option value="2560x1440">QHD 1440p</option><option value="1920x1080">Full HD 1080p</option><option value="1280x720">HD 720p</option><option value="720x576">PAL 576p</option><option value="720x480">NTSC 480p</option></select></Label>
        <Label>Frame rate<select disabled={encodingDisabled} value={activeConfig.framerate} onChange={event => patch({ framerate: Number(event.target.value) })} className={selectClass}><option value="0">Source</option><option value="23.976">23.976 fps</option><option value="24">24 fps</option><option value="25">25 fps</option><option value="29.97">29.97 fps</option><option value="30">30 fps</option><option value="50">50 fps</option><option value="59.94">59.94 fps</option><option value="60">60 fps</option><option value="120">120 fps</option></select></Label>
        {activeConfig.rateControl === 'crf' ? <Label>CRF / CQ quality<input type="number" min="0" max="51" value={activeConfig.crf} onChange={event => patch({ crf: Number(event.target.value) })} className={inputClass} /></Label> : <Label>Target bitrate (Kbps)<input type="number" min="250" max="100000" value={activeConfig.videoBitrate} onChange={event => patch({ videoBitrate: Number(event.target.value) })} className={inputClass} /></Label>}
      </div>
      <button type="button" onClick={() => setAdvancedOpen(value => !value)} className="mt-4 flex h-9 w-full items-center justify-between rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50" aria-expanded={advancedOpen}>Advanced video settings<FiChevronDown className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>
      {advancedOpen && <div className="mt-3 grid grid-cols-1 gap-4 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        <Label>Hardware encoder<select value={activeConfig.encoder} disabled={profileControlsHardware} onChange={event => patch({ encoder: event.target.value as IngestRecordingOptions['encoder'] })} className={selectClass}><option value="copy" disabled={sourceType === 'device'}>Stream copy (ingest only)</option><option value="cpu">CPU software</option><option value="nvidia">NVIDIA NVENC</option><option value="intel">Intel Quick Sync</option><option value="amd">AMD AMF</option></select></Label>
        {activeConfig.rateControl !== 'crf' && <Label>Maximum bitrate (Kbps)<input type="number" min="250" max="150000" value={activeConfig.maxBitrate} onChange={event => patch({ maxBitrate: Number(event.target.value) })} className={inputClass} /></Label>}
        <Label>GOP / keyframe interval<input type="number" min="1" max="600" value={activeConfig.gopSize || 60} onChange={event => patch({ gopSize: Number(event.target.value) || 60 })} className={inputClass} /></Label>
        <Label>Pixel format<select value={activeConfig.pixelFormat} onChange={event => patch({ pixelFormat: event.target.value as any })} className={selectClass}><option value="yuv420p">YUV 4:2:0</option><option value="yuv422p">YUV 4:2:2</option><option value="yuv444p">YUV 4:4:4</option></select></Label>
        <Label>Encoder preset<select value={activeConfig.preset} onChange={event => patch({ preset: event.target.value as any })} className={selectClass}><option value="ultrafast">Ultra fast</option><option value="fast">Fast</option><option value="medium">Medium</option><option value="slow">Slow / quality</option></select></Label>
      </div>}
    </section>

    <div className="contents">
      <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">3. Professional audio</h3><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Label>Audio codec<select value={activeConfig.audioCodec} onChange={event => patch({ audioCodec: event.target.value as any })} className={selectClass}><option value="aac">AAC</option><option value="mp3">MP3</option><option value="opus">Opus</option></select></Label><Label>Audio bitrate (Kbps)<input type="number" min="32" max="1024" value={activeConfig.audioBitrate} onChange={event => patch({ audioBitrate: Number(event.target.value) })} className={inputClass} /></Label><Label>Sample rate<select value={activeConfig.sampleRate} onChange={event => patch({ sampleRate: Number(event.target.value) })} className={selectClass}><option value="32000">32 kHz</option><option value="44100">44.1 kHz</option><option value="48000">48 kHz broadcast</option><option value="96000">96 kHz</option></select></Label><Label>Audio channels<select value={activeConfig.audioChannels} onChange={event => patch({ audioChannels: Number(event.target.value) })} className={selectClass}><option value="1">Mono</option><option value="2">Stereo</option><option value="6">5.1 surround</option><option value="8">7.1 surround</option></select></Label></div></section>
      <section className="rounded-2xl border border-slate-200 p-4">
        <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">4. Simultaneous output formats</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(['mp4', 'mkv', 'mov', 'ts', 'flv'] as const).map(format => (
            <button
              type="button"
              key={format}
              onClick={() => toggleFormat(format)}
              className={`rounded-xl border px-2 py-3 text-xs font-black uppercase transition-all ${activeFormats.includes(format) ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {format}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          MKV and TS are recommended for 24/7 television capture because interrupted files remain recoverable.
        </p>
      </section>
    </div></div>

    <section className="app-panel mt-3 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="panel-kicker">5. Storage Destination & Network Target</h3>
        <button
          type="button"
          onClick={handleTestStorageConnection}
          disabled={testingConnection}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
        >
          {testingConnection ? <FiRefreshCw className="animate-spin" /> : <FiDisc />}
          {testingConnection ? 'Testing Connection…' : 'Test Connection & Access'}
        </button>
      </div>

      {testResult && (
        <div className={`mb-3 rounded-lg border p-3 text-[11px] ${testResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          <p className="font-semibold">{testResult.message}</p>
          {testResult.directories && testResult.directories.length > 0 && (
            <div className="mt-2">
              <span className="font-bold text-[10px] uppercase">Available Remote Directories:</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {testResult.directories.map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => patch({ storagePath: dir })}
                    className="rounded bg-white border border-emerald-300 px-2 py-0.5 font-mono text-[10px] hover:bg-emerald-100 text-emerald-900"
                  >
                    Select {dir}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Label>Storage Protocol
          <select
            value={activeConfig.storageType || 'local'}
            onChange={e => patch({ storageType: e.target.value as any })}
            className={selectClass}
          >
            <option value="local">Local Disk Directory</option>
            <option value="smb">Network Share (SMB / NAS)</option>
            <option value="ftp">FTP / SFTP Server</option>
            <option value="s3">AWS S3 / Cloud Bucket</option>
          </select>
        </Label>

        {(activeConfig.storageType || 'local') === 'local' && (
          <Label>Local Path
            <input
              type="text"
              value={activeConfig.storagePath || '/media/recordings'}
              onChange={e => patch({ storagePath: e.target.value })}
              placeholder="/media/recordings or C:\Recordings"
              className={inputClass}
            />
          </Label>
        )}

        {activeConfig.storageType === 'smb' && <>
          <Label>SMB Share UNC Path
            <input type="text" value={activeConfig.smbShare || ''} onChange={e => patch({ smbShare: e.target.value })} placeholder="\\192.168.1.100\recordings" className={inputClass} />
          </Label>
          <Label>SMB Username
            <input type="text" value={activeConfig.smbUsername || ''} onChange={e => patch({ smbUsername: e.target.value })} placeholder="admin" className={inputClass} />
          </Label>
          <Label>SMB Password
            <input type="password" value={activeConfig.smbPassword || ''} onChange={e => patch({ smbPassword: e.target.value })} placeholder="••••••••" className={inputClass} />
          </Label>
        </>}

        {activeConfig.storageType === 'ftp' && <>
          <Label>FTP Host / IP
            <input type="text" value={activeConfig.ftpHost || ''} onChange={e => patch({ ftpHost: e.target.value })} placeholder="ftp.broadcast.net" className={inputClass} />
          </Label>
          <Label>FTP User
            <input type="text" value={activeConfig.ftpUsername || ''} onChange={e => patch({ ftpUsername: e.target.value })} placeholder="username" className={inputClass} />
          </Label>
          <Label>FTP Password
            <input type="password" value={activeConfig.ftpPassword || ''} onChange={e => patch({ ftpPassword: e.target.value })} placeholder="••••••••" className={inputClass} />
          </Label>
          <Label>Remote Directory
            <input type="text" value={activeConfig.ftpPath || ''} onChange={e => patch({ ftpPath: e.target.value })} placeholder="/archives/tv/" className={inputClass} />
          </Label>
        </>}

        {activeConfig.storageType === 's3' && <>
          <Label>S3 Bucket Name
            <input type="text" value={activeConfig.s3Bucket || ''} onChange={e => patch({ s3Bucket: e.target.value })} placeholder="s3://kashtrix-recordings" className={inputClass} />
          </Label>
          <Label>S3 Region
            <input type="text" value={activeConfig.s3Region || 'us-east-1'} onChange={e => patch({ s3Region: e.target.value })} placeholder="us-east-1" className={inputClass} />
          </Label>
          <Label>Access Key ID
            <input type="text" value={activeConfig.s3AccessKey || ''} onChange={e => patch({ s3AccessKey: e.target.value })} placeholder="AKIA..." className={inputClass} />
          </Label>
          <Label>Secret Access Key
            <input type="password" value={activeConfig.s3SecretKey || ''} onChange={e => patch({ s3SecretKey: e.target.value })} placeholder="••••••••" className={inputClass} />
          </Label>
        </>}
      </div>
    </section>

    <div className="sticky bottom-3 z-20 mt-4 flex flex-col gap-2 rounded-lg border border-[#E8DFF0] bg-white/95 p-3 shadow-md dark:bg-[#190E28] dark:border-[#311B4E] sm:flex-row sm:items-center sm:justify-end">
      <span className="mr-auto text-[10px] text-slate-500 dark:text-[#B9A5CD]">Save configuration before starting recording sessions.</span>
      <button type="button" onClick={save} disabled={saving} className="h-9 rounded-md border border-[#E8DFF0] bg-white px-4 text-[11px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA] hover:bg-[#F4EEFF] dark:hover:bg-[#2D1A45] disabled:opacity-50">{saving ? 'Saving…' : 'Save configuration'}</button>

      {isRecordingActive ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span>RECORDING IN PROGRESS</span>
            <span className="font-mono text-[12px] bg-rose-700/80 px-2 py-0.5 rounded tracking-wider">
              {Math.floor(recordingElapsed / 3600).toString().padStart(2, '0')}:{Math.floor((recordingElapsed % 3600) / 60).toString().padStart(2, '0')}:{Math.floor(recordingElapsed % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="h-9 rounded-md border border-rose-200 bg-rose-50 px-4 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <FiSquare className="mr-1.5 inline fill-rose-700" /> Stop recording
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={startDisabled}
            onClick={async () => {
              setRecordPreviewModalOpen(true);
              await startSourcePreview();
            }}
            className="h-9 rounded-md border border-[#6D32D9] bg-white px-3 text-[11px] font-semibold text-[#6D32D9] hover:bg-[#F4EEFF] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            title="Open live preview modal to verify video before recording"
          >
            <FiEye className="mr-1.5 inline" /> Preview & Start
          </button>

          <button
            type="button"
            disabled={startDisabled}
            onClick={async () => {
              if (previewing || previewStarting) {
                await stopPreview();
                await new Promise(r => setTimeout(r, 600));
              }
              await start();
            }}
            className="h-9 rounded-md bg-[#6D32D9] px-4 text-[11px] font-semibold text-white hover:bg-[#5B21B6] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <FiDisc className="mr-2 inline" /> Start recording
          </button>
        </div>
      )}
    </div>

    {/* Recording Pre-Flight Confidence Monitor Modal */}
    <DetailDrawer
      open={recordPreviewModalOpen}
      onClose={async () => {
        setRecordPreviewModalOpen(false);
        await stopPreview();
      }}
      title="Recording Confidence Monitor"
      subtitle="Verify live capture feed before beginning recording session"
      width="max-w-[580px]"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={async () => {
              setRecordPreviewModalOpen(false);
              await stopPreview();
            }}
            className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]"
          >
            Close
          </button>
          <button
            type="button"
            disabled={startDisabled}
            onClick={async () => {
              setRecordPreviewModalOpen(false);
              await stopPreview();
              await new Promise(r => setTimeout(r, 600));
              await start();
            }}
            className="h-9 rounded-md bg-[#6D32D9] px-5 text-[11px] font-semibold text-white hover:bg-[#5B21B6] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
          >
            <FiDisc className="mr-1.5 inline" /> Start Recording Now
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="relative aspect-video min-h-[220px] w-full overflow-hidden rounded-xl bg-black shadow-inner">
          <video
            ref={videoRef}
            playsInline
            muted
            onTimeUpdate={event => setPreviewTime(event.currentTarget.currentTime)}
            className={`h-full w-full object-contain ${previewing ? 'block' : 'hidden'}`}
          />
          {!previewing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-violet-200/60 p-4 text-center">
              {previewStarting ? (
                <>
                  <FiRefreshCw className="h-7 w-7 animate-spin text-[#7C3AED]" />
                  <p className="text-xs font-medium text-white">Opening capture source…</p>
                </>
              ) : (
                <>
                  <FiEye size={26} />
                  <p className="text-xs font-medium text-white">Live preview offline</p>
                </>
              )}
            </div>
          )}
          {previewing && (
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-rose-600 px-2 py-1 text-[9px] font-bold text-white shadow">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              LIVE {Math.floor(previewTime / 60).toString().padStart(2, '0')}:{Math.floor(previewTime % 60).toString().padStart(2, '0')}
            </div>
          )}
        </div>

        {previewError && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300">
            {previewError}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-[#311B4E] dark:bg-[#211335]/60 space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#B9A5CD]">Capture & Recording Specifications</div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-slate-400 block text-[9px]">Source Device:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{sourceName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[9px]">Video Input:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100 uppercase">{activeConfig.videoInput || 'HDMI'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[9px]">Signal Standard:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{activeConfig.formatCode || (detectedResolution ? `${detectedResolution}${detectedFramerate ? ` @ ${detectedFramerate}` : ''} (Detected)` : 'Auto Detect (Native Signal)')}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[9px]">Encoding Bitrate:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{activeConfig.videoBitrate} Kbps ({activeFormats.join(', ').toUpperCase()})</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 dark:text-[#B9A5CD] leading-relaxed">
          Verify live picture framing above. When you click <b>Start Recording Now</b>, the preview monitor will be released and the capture hardware will seamlessly begin encoding your recording archive.
        </p>
      </div>
    </DetailDrawer>

    {/* Save Preset Configuration Modal */}
    <DetailDrawer
      open={saveModalOpen}
      onClose={() => setSaveModalOpen(false)}
      title="Save Recording Configuration"
      subtitle="Save complete input device, transcoding profile, and output parameters as a reusable preset"
      width="max-w-[480px]"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setSaveModalOpen(false)}
            className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:bg-[#211335] dark:border-[#371F59] dark:text-[#F1EAFA]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSavePreset}
            className="h-9 rounded-md bg-[#6D32D9] px-5 text-[11px] font-semibold text-white hover:bg-[#5B21B6] shadow-sm"
          >
            Save Preset
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Preset Name
            <input
              type="text"
              value={presetNameInput}
              onChange={e => setPresetNameInput(e.target.value)}
              placeholder="e.g. DeckLink 1080p50 Master Record"
              className={inputClass}
            />
          </Label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-[#311B4E] dark:bg-[#211335]/60 space-y-2 text-[11px]">
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">Parameters to be saved:</div>
          <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-200">
            <div>• Source: <b>{sourceType === 'device' ? (videoDevice || 'Capture Device') : (selectedStreamKey || 'Ingest Feed')}</b></div>
            <div>• Quality: <b>{activeConfig.videoBitrate} Kbps (Max: {activeConfig.maxBitrate}k)</b></div>
            <div>• Frame Rate: <b>{activeConfig.framerate || 50} FPS</b></div>
            <div>• Encoder: <b>{activeConfig.encoder.toUpperCase()}</b></div>
            <div>• Resolution: <b>{activeConfig.resolution}</b></div>
            <div>• Audio: <b>{activeConfig.audioCodec.toUpperCase()} {activeConfig.audioBitrate}k</b></div>
          </div>
        </div>
      </div>
    </DetailDrawer>
  </>;
};

export default ProfessionalRecordingControl;
