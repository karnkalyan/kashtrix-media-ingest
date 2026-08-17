import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiDisc, FiEye, FiEyeOff, FiRefreshCw, FiVideo, FiSquare } from 'react-icons/fi';
import { IngestRecordingOptions, TranscodingProfile, VideoCodec } from '../types';

type Format = IngestRecordingOptions['formats'][number];

const defaultConfig: IngestRecordingOptions = {
  autoRecord: false,
  fileName: '{channel}_{date}_{time}',
  formats: ['mp4'],
  encoder: 'copy',
  videoBitrate: 12000,
  audioBitrate: 192,
  resolution: 'source',
  framerate: 0,
  preset: 'fast',
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
  const [profileId, setProfileId] = useState('custom');
  const [previewing, setPreviewing] = useState(false);
  const [previewStarting, setPreviewStarting] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewTime, setPreviewTime] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; directories?: string[] } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  const stopPreview = useCallback(() => {
    previewGenerationRef.current += 1;
    if (devicePreviewIdRef.current) releaseDevicePreview(devicePreviewIdRef.current);
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
  }, [releaseDevicePreview]);

  useEffect(() => stopPreview, [stopPreview]);
  useEffect(() => {
    if (previewing || previewStarting) stopPreview();
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
            resolution: config.resolution,
            framerate: config.framerate,
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

  const applyProfile = (id: string) => {
    setProfileId(id);
    const profile = profiles.find(item => item.id === id);
    if (!profile) return;
    const codec = [VideoCodec.H265, VideoCodec.HEVC_NVENC, VideoCodec.HEVC_AMF, VideoCodec.HEVC_VIDEOTOOLBOX].includes(profile.videoCodec) ? 'hevc' : 'h264';
    const encoder = encoderFromProfile(profile);
    patch({
      encoder: sourceType === 'device' && encoder === 'copy' ? 'cpu' : encoder,
      videoCodec: codec,
      resolution: profile.resolution === 'N/A' ? 'source' : profile.resolution,
      framerate: profile.framerate || 0,
      rateControl: profile.videoQualityMode === 'crf' ? 'crf' : 'cbr',
      videoBitrate: profile.videoBitrate || activeConfig.videoBitrate,
      maxBitrate: profile.maxrate || profile.videoBitrate || activeConfig.maxBitrate,
      crf: profile.crf || activeConfig.crf,
      audioBitrate: profile.audioBitrate || activeConfig.audioBitrate,
      sampleRate: profile.sampleRate || activeConfig.sampleRate,
      preset: (['ultrafast', 'fast', 'medium', 'slow'].includes(profile.preset || '') ? profile.preset : 'fast') as any,
      gopSize: profile.gopSize || activeConfig.gopSize,
      pixelFormat: (['yuv420p', 'yuv422p', 'yuv444p'].includes(profile.pixelFormat || '') ? profile.pixelFormat : 'yuv420p') as any,
    });
  };

  const activeFormats = activeConfig.formats || ['mp4'];

  return <>
    <div className="mt-3 grid min-w-0 items-start gap-3 xl:grid-cols-[300px_minmax(0,680px)]">
      <section className="app-panel min-w-0 p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="panel-kicker"><FiVideo /> Source & capture</h3>{sourceType === 'device' && <button type="button" onClick={refreshDevices} className="rounded-lg border border-[#E8DFF0] p-2 text-[#7C3AED] transition hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#A78BFA] dark:hover:bg-[#2D1A45]" title="Detect devices"><FiRefreshCw className={devicesLoading ? 'animate-spin' : ''} /></button>}</div>
        <div className="mb-4 grid grid-cols-2 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-0.5 dark:bg-[#211335] dark:border-[#371F59]">
          <button type="button" onClick={() => { setSourceType('device'); patch({ sourceType: 'device', ...(activeConfig.encoder === 'copy' ? { encoder: 'cpu' as const } : {}) }); }} className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${sourceType === 'device' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'}`}>Capture device</button>
          <button type="button" onClick={() => { setSourceType('ingest'); patch({ sourceType: 'ingest' }); }} className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${sourceType === 'ingest' ? 'bg-[#7C3AED] text-white shadow-xs' : 'text-[#6F6078] hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:text-white'}`}>Live ingest</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
        {sourceType === 'device' ? <>
          <Label>Video device<select value={videoDevice} onChange={event => setVideoDevice(event.target.value)} className={selectClass}><option value="">No video</option>{videoDevices.map(device => <option key={device} value={device}>{device}</option>)}</select>{!devicesLoading && !videoDevices.length && <span className="mt-1 block text-[10px] text-amber-600">No DirectShow video device detected.</span>}</Label>
          <Label>Audio device<select value={audioDevice} onChange={event => setAudioDevice(event.target.value)} className={selectClass}><option value="">No audio</option>{audioDevices.map(device => <option key={device} value={device}>{device}</option>)}</select></Label>
        </> : <Label>Active RTMP/SRT ingest<select value={selectedStreamKey} onChange={event => setSelectedStreamKey(event.target.value)} className={selectClass}><option value="">Select active ingest</option>{Object.entries(streams).map(([key, value]: [string, any]) => <option key={key} value={key}>{value.name || key} ({value.app || 'live'})</option>)}</select>{!Object.keys(streams).length && <span className="mt-1 block text-[10px] text-amber-600">No ingest is publishing right now. Capture devices are still available in the other tab.</span>}</Label>}
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
        <button type="button" onClick={previewing ? stopPreview : startSourcePreview} disabled={startDisabled || previewStarting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40">{previewing ? <FiEyeOff size={13} /> : <FiEye size={13} />}{previewStarting ? 'Starting FFmpeg preview…' : previewing ? 'Close preview' : 'Preview source'}</button>
      </section>

      <section className="source-preview app-panel min-w-0 overflow-hidden bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.1em]">Source preview</p><p className="mt-0.5 text-[10px] text-slate-400">Server FFmpeg / HLS confidence monitor</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2 py-1 text-[9px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-pink-400" />LIVE</span>
        </div>
        <div className="relative aspect-video min-h-[180px] w-full bg-[#090d17]">
          <video ref={videoRef} playsInline muted onTimeUpdate={event => setPreviewTime(event.currentTarget.currentTime)} className={`h-full w-full object-contain ${previewing ? 'block' : 'hidden'}`} />
          {!previewing && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-violet-200/50"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]"><FiEye size={23} /></span><span className="text-xs font-medium">Select a source and start preview</span></div>}
          {previewing && <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-lg"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />LIVE PREVIEW {Math.floor(previewTime / 60).toString().padStart(2, '0')}:{Math.floor(previewTime % 60).toString().padStart(2, '0')}</div>}
          <div className="pointer-events-none absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center divide-x divide-white/15 rounded-xl border border-white/10 bg-slate-950/75 px-1 py-2 text-white backdrop-blur-md">
            <span className="px-3"><b className="block text-[11px]">{activeConfig.resolution === 'source' ? 'Source' : activeConfig.resolution}</b><small className="text-[8px] text-slate-400">Resolution</small></span>
            <span className="px-3"><b className="block text-[11px]">{activeConfig.framerate || 'Source'}{activeConfig.framerate ? ' fps' : ''}</b><small className="text-[8px] text-slate-400">Frame rate</small></span>
            <span className="px-3"><b className="block text-[11px]">{activeConfig.videoBitrate} Kbps</b><small className="text-[8px] text-slate-400">Bitrate</small></span>
          </div>
        </div>
        {previewError && <p className="border-t border-amber-400/20 bg-amber-400/10 px-4 py-2 text-[10px] text-amber-200">{previewError}</p>}
      </section>
    </div>

    <div className="recording-settings-grid mt-3 grid grid-cols-1 gap-3 xl:grid-cols-4"><section className="app-panel p-4 xl:col-span-2">
      <h3 className="panel-kicker mb-4">Video encoding</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Label>Transcoding profile<select value={profileId} onChange={event => applyProfile(event.target.value)} className={selectClass}><option value="custom">Custom recording settings</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Label>
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
        <Label>GOP / keyframe interval<input type="number" min="1" max="600" value={activeConfig.gopSize} onChange={event => patch({ gopSize: Number(event.target.value) })} className={inputClass} /></Label>
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
        <button
          type="button"
          onClick={stopRecording}
          className="h-9 rounded-md border border-rose-200 bg-rose-50 px-4 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
        >
          <FiSquare className="mr-1.5 inline fill-rose-700" /> Stop active recording
        </button>
      ) : (
        <button
          type="button"
          disabled={startDisabled}
          onClick={start}
          className="h-9 rounded-md bg-[#6D32D9] px-4 text-[11px] font-semibold text-white hover:bg-[#5B21B6] disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          <FiDisc className="mr-2 inline" /> Start recording
        </button>
      )}
    </div>
  </>;
};

export default ProfessionalRecordingControl;
