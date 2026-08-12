import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiDisc, FiEye, FiEyeOff, FiRefreshCw } from 'react-icons/fi';
import { IngestRecordingOptions, TranscodingProfile, VideoCodec } from '../types';

type Format = IngestRecordingOptions['formats'][number];

interface Props {
  config: IngestRecordingOptions;
  setConfig: React.Dispatch<React.SetStateAction<IngestRecordingOptions>>;
  sourceType: 'ingest' | 'device';
  setSourceType: (value: 'ingest' | 'device') => void;
  streams: Record<string, any>;
  selectedStreamKey: string;
  setSelectedStreamKey: (value: string) => void;
  videoDevices: string[];
  audioDevices: string[];
  videoDevice: string;
  audioDevice: string;
  setVideoDevice: (value: string) => void;
  setAudioDevice: (value: string) => void;
  refreshDevices: () => void;
  devicesLoading: boolean;
  toggleFormat: (format: Format) => void;
  save: () => void;
  saving: boolean;
  start: () => void;
  profiles: TranscodingProfile[];
  mediaPort: number;
}

const selectClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100';
const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm';
const Label: React.FC<React.PropsWithChildren> = ({ children }) => <label className="min-w-0 text-xs font-bold text-slate-700">{children}</label>;
const encoderFromProfile = (profile?: TranscodingProfile): IngestRecordingOptions['encoder'] => {
  const codec = String(profile?.videoCodec || '').toLowerCase();
  if (codec.includes('nvenc')) return 'nvidia';
  if (codec.includes('qsv')) return 'intel';
  if (codec.includes('amf')) return 'amd';
  if (codec === VideoCodec.Copy || codec === 'copy') return 'copy';
  return 'cpu';
};

const ProfessionalRecordingControl: React.FC<Props> = ({
  config, setConfig, sourceType, setSourceType, streams, selectedStreamKey, setSelectedStreamKey,
  videoDevices, audioDevices, videoDevice, audioDevice, setVideoDevice, setAudioDevice,
  refreshDevices, devicesLoading, toggleFormat, save, saving, start, profiles, mediaPort,
}) => {
  const [profileId, setProfileId] = useState('custom');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewTime, setPreviewTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const deviceStreamRef = useRef<MediaStream | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const patch = (values: Partial<IngestRecordingOptions>) => setConfig(previous => ({ ...previous, ...values }));
  const encodingDisabled = config.encoder === 'copy';
  const selectedProfile = profiles.find(item => item.id === profileId);
  const profileControlsHardware = !!selectedProfile;
  const startDisabled = sourceType === 'device' ? !videoDevice && !audioDevice : !selectedStreamKey;
  const sourceName = sourceType === 'device'
    ? (videoDevice || audioDevice || 'channel')
    : (streams[selectedStreamKey]?.name || selectedStreamKey.split('/').pop() || 'channel');
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const previewBase = (config.fileName || '{channel}_{date}_{time}')
    .replace(/\{channel\}/gi, sourceName.replace(/[^a-z0-9._-]+/gi, '-'))
    .replace(/\{date\}/gi, localDate)
    .replace(/\{time\}/gi, 'HH-MM-SS')
    .replace(/\{timestamp\}/gi, String(Date.now()));

  const stopPreview = useCallback(() => {
    deviceStreamRef.current?.getTracks().forEach(track => track.stop());
    deviceStreamRef.current = null;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    setPreviewing(false);
    setPreviewTime(0);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);
  useEffect(() => {
    if (previewing) stopPreview();
  }, [sourceType, selectedStreamKey, videoDevice, audioDevice]); // eslint-disable-line react-hooks/exhaustive-deps

  const startSourcePreview = async () => {
    stopPreview();
    setPreviewError('');
    setPreviewing(true);
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    const player = videoRef.current;
    if (!player) return;

    try {
      if (sourceType === 'device') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser capture preview is unavailable. Open the dashboard through localhost or HTTPS.');
        const initial = await navigator.mediaDevices.getUserMedia({ video: !!videoDevice, audio: !!audioDevice });
        const browserDevices = await navigator.mediaDevices.enumerateDevices();
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
        const findDevice = (kind: MediaDeviceKind, selected: string) => browserDevices.find(device =>
          device.kind === kind && (normalize(device.label) === normalize(selected) || normalize(device.label).includes(normalize(selected)) || normalize(selected).includes(normalize(device.label)))
        );
        const selectedVideo = videoDevice ? findDevice('videoinput', videoDevice) : undefined;
        const selectedAudio = audioDevice ? findDevice('audioinput', audioDevice) : undefined;
        let stream = initial;
        if (selectedVideo || selectedAudio) {
          initial.getTracks().forEach(track => track.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoDevice ? (selectedVideo ? { deviceId: { exact: selectedVideo.deviceId } } : true) : false,
            audio: audioDevice ? (selectedAudio ? { deviceId: { exact: selectedAudio.deviceId } } : true) : false,
          });
        }
        deviceStreamRef.current = stream;
        player.srcObject = stream;
        player.muted = true;
        await player.play();
      } else {
        const selected = streams[selectedStreamKey];
        if (!selected) throw new Error('Select an active ingest source first.');
        const app = selected.app || selectedStreamKey.split('/')[0] || 'live';
        const name = selected.name || selectedStreamKey.split('/').pop();
        const hlsUrl = new URL(selected.hlsUrl || `http://${window.location.hostname}:${mediaPort}/${app}/${name}/index.m3u8`);
        hlsUrl.hostname = window.location.hostname;
        player.muted = true;
        const { default: Hls } = await import('hls.js');
        if (Hls.isSupported()) {
          const hls = new Hls({ liveSyncDurationCount: 2, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setPreviewError(`Live preview unavailable: ${data.details}`);
          });
          hls.loadSource(hlsUrl.toString());
          hls.attachMedia(player);
          hls.on(Hls.Events.MANIFEST_PARSED, () => player.play().catch(() => undefined));
        } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
          player.src = hlsUrl.toString();
          await player.play();
        } else {
          throw new Error('This browser cannot play the HLS source.');
        }
      }
    } catch (error: any) {
      stopPreview();
      setPreviewError(error.message || 'Unable to open source preview.');
    }
  };

  const startRecording = () => {
    stopPreview();
    start();
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
      videoBitrate: profile.videoBitrate || config.videoBitrate,
      maxBitrate: profile.maxrate || profile.videoBitrate || config.maxBitrate,
      crf: profile.crf || config.crf,
      audioBitrate: profile.audioBitrate || config.audioBitrate,
      sampleRate: profile.sampleRate || config.sampleRate,
      preset: (['ultrafast', 'fast', 'medium', 'slow'].includes(profile.preset || '') ? profile.preset : 'fast') as any,
      gopSize: profile.gopSize || config.gopSize,
      pixelFormat: (['yuv420p', 'yuv422p', 'yuv444p'].includes(profile.pixelFormat || '') ? profile.pixelFormat : 'yuv420p') as any,
    });
  };

  return <>
    <div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
      <button type="button" onClick={() => { setSourceType('device'); patch({ sourceType: 'device', ...(config.encoder === 'copy' ? { encoder: 'cpu' as const } : {}) }); }} className={`rounded-xl px-3 py-2.5 text-xs font-black ${sourceType === 'device' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Capture device</button>
      <button type="button" onClick={() => { setSourceType('ingest'); patch({ sourceType: 'ingest' }); }} className={`rounded-xl px-3 py-2.5 text-xs font-black ${sourceType === 'ingest' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Live ingest</button>
    </div>

    <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-black uppercase tracking-wider text-slate-500">1. Recording source</h3>{sourceType === 'device' && <button type="button" onClick={refreshDevices} className="text-xs font-bold text-indigo-600"><FiRefreshCw className={devicesLoading ? 'inline animate-spin' : 'inline'} /> Detect devices</button>}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sourceType === 'device' ? <>
          <Label>Video device<select value={videoDevice} onChange={event => setVideoDevice(event.target.value)} className={selectClass}><option value="">No video</option>{videoDevices.map(device => <option key={device} value={device}>{device}</option>)}</select>{!devicesLoading && !videoDevices.length && <span className="mt-1 block text-[10px] text-amber-600">No DirectShow video device detected.</span>}</Label>
          <Label>Audio device<select value={audioDevice} onChange={event => setAudioDevice(event.target.value)} className={selectClass}><option value="">No audio</option>{audioDevices.map(device => <option key={device} value={device}>{device}</option>)}</select></Label>
        </> : <Label>Active RTMP/SRT ingest<select value={selectedStreamKey} onChange={event => setSelectedStreamKey(event.target.value)} className={selectClass}><option value="">Select active ingest</option>{Object.entries(streams).map(([key, value]: [string, any]) => <option key={key} value={key}>{value.name || key} ({value.app || 'live'})</option>)}</select>{!Object.keys(streams).length && <span className="mt-1 block text-[10px] text-amber-600">No ingest is publishing right now. Capture devices are still available in the other tab.</span>}</Label>}
        <div className="md:col-span-2">
          <Label>Recording filename
            <input type="text" maxLength={180} value={config.fileName || ''} onChange={event => patch({ fileName: event.target.value })} placeholder="{channel}_{date}_{time}" className={inputClass} />
          </Label>
          <div className="mt-2 flex flex-col gap-1 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Available placeholders: {'{channel}'} {'{date}'} {'{time}'} {'{timestamp}'}</span>
            <span className="truncate font-mono text-indigo-600">Preview: {previewBase}.{config.formats[0] || 'mp4'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-white">
          <div><p className="text-xs font-semibold">Source monitor</p><p className="text-[10px] text-slate-400">Preview the selected input before recording</p></div>
          <button type="button" onClick={previewing ? stopPreview : startSourcePreview} disabled={startDisabled} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-semibold hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">{previewing ? <FiEyeOff size={13} /> : <FiEye size={13} />}{previewing ? 'Close preview' : 'Preview source'}</button>
        </div>
        <div className="relative aspect-video max-h-[420px] w-full bg-black">
          <video ref={videoRef} playsInline muted onTimeUpdate={event => setPreviewTime(event.currentTarget.currentTime)} className={`h-full w-full object-contain ${previewing ? 'block' : 'hidden'}`} />
          {!previewing && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500"><FiEye size={24} /><span className="text-xs">Source preview is off</span></div>}
          {previewing && <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-semibold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE {Math.floor(previewTime / 60).toString().padStart(2, '0')}:{Math.floor(previewTime % 60).toString().padStart(2, '0')}</div>}
        </div>
      </div>
      {previewError && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{previewError}</p>}
    </section>

    <section className="mt-4 rounded-2xl border border-slate-200 p-4">
      <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">2. Professional video encoding</h3>
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Label>Live TV Transcoding Profile<select value={profileId} onChange={event => applyProfile(event.target.value)} className={selectClass}><option value="custom">Custom recording settings</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></Label>
          <Label>Encoding hardware of Live TV profile<select value={config.encoder} disabled={profileControlsHardware} onChange={event => patch({ encoder: event.target.value as IngestRecordingOptions['encoder'] })} className={selectClass}><option value="copy" disabled={sourceType === 'device'}>Stream copy (ingest only)</option><option value="cpu">CPU software</option><option value="nvidia">NVIDIA NVENC</option><option value="intel">Intel Quick Sync</option><option value="amd">AMD AMF</option></select></Label>
        </div>
        <p className="mt-2 text-[10px] text-indigo-600">{selectedProfile ? `${selectedProfile.name} controls the encoding hardware, codec, resolution, FPS, bitrate, audio and GOP settings.` : 'Custom mode allows manual encoding hardware and recording settings.'}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Label>Video codec<select disabled={encodingDisabled} value={config.videoCodec} onChange={event => patch({ videoCodec: event.target.value as any })} className={selectClass}><option value="h264">H.264 / AVC</option><option value="hevc">H.265 / HEVC</option></select></Label>
        <Label>Rate control<select disabled={encodingDisabled} value={config.rateControl} onChange={event => patch({ rateControl: event.target.value as any })} className={selectClass}><option value="cbr">CBR broadcast</option><option value="vbr">VBR quality</option><option value="crf">Constant quality</option></select></Label>
        <Label>Resolution<select disabled={encodingDisabled} value={config.resolution} onChange={event => patch({ resolution: event.target.value })} className={selectClass}><option value="source">Source / original</option><option value="7680x4320">8K UHD</option><option value="3840x2160">4K UHD 2160p</option><option value="2560x1440">QHD 1440p</option><option value="1920x1080">Full HD 1080p</option><option value="1280x720">HD 720p</option><option value="720x576">PAL 576p</option><option value="720x480">NTSC 480p</option></select></Label>
        <Label>Frame rate<select disabled={encodingDisabled} value={config.framerate} onChange={event => patch({ framerate: Number(event.target.value) })} className={selectClass}><option value="0">Source</option><option value="23.976">23.976 fps</option><option value="24">24 fps</option><option value="25">25 fps</option><option value="29.97">29.97 fps</option><option value="30">30 fps</option><option value="50">50 fps</option><option value="59.94">59.94 fps</option><option value="60">60 fps</option><option value="120">120 fps</option></select></Label>
        {config.rateControl === 'crf' ? <Label>CRF / CQ quality<input type="number" min="0" max="51" value={config.crf} onChange={event => patch({ crf: Number(event.target.value) })} className={inputClass} /></Label> : <><Label>Target bitrate (Kbps)<input type="number" min="250" max="100000" value={config.videoBitrate} onChange={event => patch({ videoBitrate: Number(event.target.value) })} className={inputClass} /></Label><Label>Maximum bitrate (Kbps)<input type="number" min="250" max="150000" value={config.maxBitrate} onChange={event => patch({ maxBitrate: Number(event.target.value) })} className={inputClass} /></Label></>}
        <Label>GOP / keyframe interval<input type="number" min="1" max="600" value={config.gopSize} onChange={event => patch({ gopSize: Number(event.target.value) })} className={inputClass} /></Label>
        <Label>Pixel format<select value={config.pixelFormat} onChange={event => patch({ pixelFormat: event.target.value as any })} className={selectClass}><option value="yuv420p">YUV 4:2:0</option><option value="yuv422p">YUV 4:2:2</option><option value="yuv444p">YUV 4:4:4</option></select></Label>
        <Label>Encoder preset<select value={config.preset} onChange={event => patch({ preset: event.target.value as any })} className={selectClass}><option value="ultrafast">Ultra fast</option><option value="fast">Fast</option><option value="medium">Medium</option><option value="slow">Slow / quality</option></select></Label>
      </div>
    </section>

    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">3. Professional audio</h3><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Label>Audio codec<select value={config.audioCodec} onChange={event => patch({ audioCodec: event.target.value as any })} className={selectClass}><option value="aac">AAC</option><option value="mp3">MP3</option><option value="opus">Opus</option></select></Label><Label>Audio bitrate (Kbps)<input type="number" min="32" max="1024" value={config.audioBitrate} onChange={event => patch({ audioBitrate: Number(event.target.value) })} className={inputClass} /></Label><Label>Sample rate<select value={config.sampleRate} onChange={event => patch({ sampleRate: Number(event.target.value) })} className={selectClass}><option value="32000">32 kHz</option><option value="44100">44.1 kHz</option><option value="48000">48 kHz broadcast</option><option value="96000">96 kHz</option></select></Label><Label>Audio channels<select value={config.audioChannels} onChange={event => patch({ audioChannels: Number(event.target.value) })} className={selectClass}><option value="1">Mono</option><option value="2">Stereo</option><option value="6">5.1 surround</option><option value="8">7.1 surround</option></select></Label></div></section>
      <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">4. Simultaneous output formats</h3><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{(['mp4', 'mkv', 'mov', 'ts', 'flv'] as const).map(format => <button type="button" key={format} onClick={() => toggleFormat(format)} className={`rounded-xl border px-2 py-3 text-xs font-black uppercase ${config.formats.includes(format) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{format}</button>)}</div><p className="mt-3 text-[10px] leading-relaxed text-slate-500">Each selected format records continuously to its own file. MKV and TS are recommended for 24/7 television capture because interrupted files remain recoverable.</p></section>
    </div>

    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={save} disabled={saving} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black text-slate-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save defaults'}</button><button type="button" disabled={startDisabled} onClick={startRecording} className="rounded-xl bg-rose-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-rose-200 disabled:cursor-not-allowed disabled:opacity-40"><FiDisc className="mr-2 inline" />Start professional recording</button></div>
  </>;
};

export default ProfessionalRecordingControl;
