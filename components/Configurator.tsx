import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiActivity, FiZap, FiRefreshCw, FiPlay, FiPlus, FiTrash2, FiGlobe, FiFilm, FiVideo, FiCheck, FiCopy, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { AppSettings, Channel, ChannelDestination, InputType, Protocol, TranscodingProfile } from '../types';
import { LIVE_PROTOCOL_OPTIONS, RESOLUTION_OPTIONS, FRAMERATE_OPTIONS } from '../constants';
import Button from './ui/Button';
import Select from './ui/Select';
import Card from './ui/Card';
import StatusBadge from './ui/StatusBadge';
import FileUpload from './FileUpload';

const API_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

interface VODFile {
  name: string;
  originalName: string;
}

interface ProgramStream {
  index: string;
  type: string;
  codec: string;
  lang: string;
  resolution: string | null;
}

interface Program {
  id: number;
  name: string;
  streams: ProgramStream[];
}

interface Props {
  profiles: TranscodingProfile[];
  settings: AppSettings;
  licenseStatus: string;
  addChannel: (channelData: Omit<Channel, 'id' | 'command' | 'status' | 'uptime' | 'speed' | 'speedHistory' | 'outputLog'>) => Promise<void>;
  getTsPrograms: (input: string) => Promise<Program[]>;
  fetchIngestStreams: () => Promise<any>;
  profileId: string;
  setProfileId: (id: string) => void;
}

const inputTabs = [
  { value: InputType.URL, label: 'URL', icon: FiGlobe },
  { value: InputType.VOD, label: 'VOD', icon: FiFilm },
  { value: InputType.DEVICE, label: 'Device', icon: FiVideo },
  { value: InputType.LIVE, label: 'Live', icon: FiZap },
  { value: InputType.SRT, label: 'SRT', icon: FiActivity },
  { value: InputType.YOUTUBE, label: 'YouTube', icon: FiPlay },
];

const destinationOptions = [
  ...LIVE_PROTOCOL_OPTIONS,
  { value: Protocol.YOUTUBE, label: 'YouTube' },
  { value: Protocol.FACEBOOK, label: 'Facebook' },
  { value: Protocol.RTMP, label: 'RTMP Push' },
  { value: Protocol.RECORDING, label: 'Recording File' },
];

const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultUrl = (protocol: Protocol, name: string, settings: AppSettings, streamKey = '') => {
  const slug = safeName(name);
  switch (protocol) {
    case Protocol.HLS:
      return `http://${API_HOST}:${settings.mediaPort}/live/${slug}/index.m3u8`;
    case Protocol.DASH:
      return `http://${API_HOST}:${settings.mediaPort}/dash/${slug}/index.mpd`;
    case Protocol.RTMP:
      return `rtmp://${API_HOST}:${settings.rtmpPort}/live/${slug}`;
    case Protocol.YOUTUBE:
      return `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
    case Protocol.FACEBOOK:
      return `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;
    case Protocol.SRT:
      return `srt://127.0.0.1:9001?mode=caller`;
    case Protocol.UDP:
      return `udp://224.1.1.2:3000`;
    case Protocol.HTTP_TS:
      return `http://${API_HOST}:${settings.mediaPort}/ts/${slug}.ts`;
    case Protocol.RECORDING:
      return `media/recordings/${slug}.mp4`;
    default:
      return '';
  }
};

const playbackUrl = (protocol: Protocol, name: string, settings: AppSettings, url: string) => {
  const slug = safeName(name);
  if (protocol === Protocol.HLS) return `http://${API_HOST}:${settings.mediaPort}/live/${slug}/index.m3u8`;
  if (protocol === Protocol.DASH) return `http://${API_HOST}:${settings.mediaPort}/dash/${slug}/index.mpd`;
  if (protocol === Protocol.RECORDING) return '';
  return url;
};

const Configurator: React.FC<Props> = ({ profiles, settings, licenseStatus, addChannel, getTsPrograms, fetchIngestStreams, profileId, setProfileId }) => {
  const [inputType, setInputType] = useState<InputType>(InputType.SRT);
  const [channelName, setChannelName] = useState('Main Feed');
  const [inputUrl, setInputUrl] = useState('srt://0.0.0.0:8890?mode=listener');
  const [vodFiles, setVodFiles] = useState<VODFile[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<number | undefined>();
  const [selectedVideoStream, setSelectedVideoStream] = useState<string | undefined>();
  const [selectedAudioStream, setSelectedAudioStream] = useState<string | undefined>();
  const [videoDevices, setVideoDevices] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [videoDevice, setVideoDevice] = useState('');
  const [audioDevice, setAudioDevice] = useState('');
  const [liveStreams, setLiveStreams] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [destinations, setDestinations] = useState<ChannelDestination[]>([
    { id: id(), name: 'HLS Preview', protocol: Protocol.HLS, url: defaultUrl(Protocol.HLS, 'Main Feed', settings), playbackUrl: playbackUrl(Protocol.HLS, 'Main Feed', settings, defaultUrl(Protocol.HLS, 'Main Feed', settings)) },
  ]);

  const canOperate = licenseStatus === 'activated';
  const currentProgram = useMemo(() => programs.find(p => p.id === programId), [programId, programs]);

  const recordingOutputUrl = (destination: ChannelDestination) => {
    const fileName = destination.recording?.fileName?.trim()
      ? safeName(destination.recording.fileName)
      : safeName(channelName);
    const format = destination.recording?.format || 'mp4';
    return `media/recordings/${fileName}.${format}`;
  };

  useEffect(() => {
    if (!profiles.length) return;
    const exists = profiles.some(p => p.id === profileId);
    if (!exists) setProfileId(profiles[0].id);
  }, [profiles, profileId, setProfileId]);

  const refreshVod = useCallback(async () => {
    const files = await fetch('/api/vod/list').then(res => res.json()).catch(() => []);
    setVodFiles(files);
  }, []);

  const refreshDevices = useCallback(async () => {
    const token = localStorage.getItem('kte-auth-token');
    const devices = await fetch('/api/ffmpeg/devices', { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(res => res.json()).catch(() => ({ video: [], audio: [] }));
    setVideoDevices(devices.video || []);
    setAudioDevices(devices.audio || []);
  }, []);

  const refreshLive = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchIngestStreams();
      setLiveStreams(data.streams || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fetchIngestStreams]);

  useEffect(() => {
    if (inputType === InputType.VOD) refreshVod();
    if (inputType === InputType.DEVICE) refreshDevices();
    if (inputType === InputType.LIVE) refreshLive();
  }, [inputType, refreshDevices, refreshVod, refreshLive]);

  useEffect(() => {
    setDestinations(prev => prev.map(dest => {
      const slug = safeName(channelName);
      const isDefaultUrl = dest.url.includes('/live/') || dest.url.includes('/dash/') || dest.url.includes('/ts/');
      
      if (isDefaultUrl && !dest.url.includes(slug)) {
        const nextUrl = defaultUrl(dest.protocol, channelName, settings, dest.streamKey);
        return {
          ...dest,
          url: nextUrl,
          playbackUrl: playbackUrl(dest.protocol, channelName, settings, nextUrl)
        };
      }
      return dest;
    }));
  }, [channelName, settings]);

  const probeInput = async () => {
    let targetInput = inputUrl;
    if (inputType === InputType.LIVE) {
       const stream = Object.values(liveStreams).find((s: any) => s.streamName === inputUrl || s.appName === inputUrl || `${s.app}/${s.name}` === inputUrl);
       if (stream) targetInput = `rtmp://127.0.0.1:${settings.rtmpPort}/${(stream as any).app}/${(stream as any).name}`;
    }

    if (!targetInput) return toast.error('Choose or enter an input first.');
    if (inputType === InputType.YOUTUBE) return toast.error('Probing is not available for YouTube URLs.');
    
    setLoading(true);
    try {
      const found = await getTsPrograms(targetInput);
      setPrograms(found);
      const first = found[0];
      setProgramId(first?.id);
      setSelectedVideoStream(first?.streams.find(s => s.type === 'video')?.index);
      setSelectedAudioStream(first?.streams.find(s => s.type === 'audio')?.index);
      toast.success(found.length ? `Found ${found.length} program(s).` : 'No programs found.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const setDestination = (destinationId: string, patch: Partial<ChannelDestination>) => {
    setDestinations(prev => prev.map(dest => {
      if (dest.id !== destinationId) return dest;
      const next = { ...dest, ...patch };
      if (patch.protocol) next.url = defaultUrl(patch.protocol, channelName, settings, next.streamKey);
      if (next.protocol === Protocol.RECORDING) next.url = recordingOutputUrl(next);
      next.playbackUrl = playbackUrl(next.protocol, channelName, settings, next.url);
      return next;
    }));
  };

  const addDestination = () => {
    const url = defaultUrl(Protocol.RTMP, channelName, settings);
    setDestinations(prev => [...prev, { id: id(), name: 'RTMP Output', protocol: Protocol.RTMP, url, playbackUrl: playbackUrl(Protocol.RTMP, channelName, settings, url) }]);
  };

  const createChannel = async () => {
    if (!channelName || !profileId) return toast.error('Channel name and profile are required.');
    if (destinations.length === 0) return toast.error('Add at least one destination.');

    let finalInput = inputUrl;
    if (inputType === InputType.DEVICE) {
      if (!videoDevice && !audioDevice) return toast.error('Select at least one capture device.');
      if (videoDevice && audioDevice) {
        finalInput = `device://${videoDevice}+${audioDevice}`;
      } else if (videoDevice) {
        finalInput = `device://video=${videoDevice}`;
      } else {
        finalInput = `device://audio=${audioDevice}`;
      }
    } else if (inputType === InputType.LIVE) {
        const stream = Object.values(liveStreams).find((s: any) => s.streamName === inputUrl || s.appName === inputUrl || `${s.app}/${s.name}` === inputUrl);
        if (stream) finalInput = `/${(stream as any).app}/${(stream as any).name}`;
    }

    if (!finalInput) return toast.error('Input is required.');

    const firstDest = destinations[0];
    await addChannel({
      name: channelName,
      inputType,
      inputUrl: finalInput,
      outputProtocol: firstDest.protocol,
      outputUrl: firstDest.url,
      destinations,
      profileId,
      programId,
      selectedVideoStream,
      selectedAudioStream,
    });
    toast.success('Channel saved successfully.');
  };

  const copyUrl = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
    toast.success('URL copied to clipboard');
  };

  const renderInput = () => {
    if (inputType === InputType.URL || inputType === InputType.SRT || inputType === InputType.YOUTUBE) {
      return (
        <div className="relative">
          <input 
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 pr-10 text-sm font-mono text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10" 
            placeholder="srt://0.0.0.0:8890?mode=listener" 
            value={inputUrl} 
            onChange={e => setInputUrl(e.target.value)} 
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
            <FiCheckCircle size={18} />
          </span>
        </div>
      );
    }
    if (inputType === InputType.VOD) {
      return (
        <div className="space-y-3">
          <Select label="Server VOD File" value={inputUrl} onChange={e => setInputUrl(e.target.value)} placeholder="Select VOD file" options={vodFiles.map(f => ({ value: f.name, label: f.originalName }))} />
          <FileUpload onFileUploaded={(file, original) => { setInputUrl(file); if (!channelName) setChannelName(original.replace(/\.[^.]+$/, '')); refreshVod(); }} selectedFileName={null} uploadButtonText="Upload VOD File" />
        </div>
      );
    }
    if (inputType === InputType.DEVICE) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Video Device" value={videoDevice} onChange={e => setVideoDevice(e.target.value)} placeholder="No video" options={videoDevices.map(name => ({ value: name, label: name }))} />
          <Select label="Audio Device" value={audioDevice} onChange={e => setAudioDevice(e.target.value)} placeholder="No audio" options={audioDevices.map(name => ({ value: name, label: name }))} />
        </div>
      );
    }
    if (inputType === InputType.LIVE) {
      return (
        <div className="flex gap-2">
           <Select 
            label="Active Ingest Stream" 
            value={inputUrl} 
            onChange={e => setInputUrl(e.target.value)} 
            placeholder="Select stream" 
            options={Object.values(liveStreams).map((s: any) => ({ value: `${s.app}/${s.name}`, label: `${s.app}/${s.name}` }))} 
            className="flex-1"
           />
           <Button type="button" variant="secondary" onClick={refreshLive} className="mt-6">
              <span className={loading ? 'animate-spin' : ''}>
                <FiRefreshCw size={14} />
              </span>
           </Button>
        </div>
      );
    }
    return null;
  };

  const videoStreams = currentProgram?.streams.filter(s => s.type === 'video') || [];
  const audioStreams = currentProgram?.streams.filter(s => s.type === 'audio') || [];

  return (
    <div className="space-y-6">
      {/* 1. Channel Composer Card */}
      <Card>
        <div className="flex flex-col gap-3 mb-4 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">Channel Composer</h2>
            <p className="text-xs text-[var(--text-secondary)]">Create live TV channels, assign inputs & transcoding profiles</p>
          </div>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> ACTIVATED
          </span>
        </div>

        {/* Input Type Selector Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {inputTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = inputType === tab.value;
            return (
              <button 
                key={tab.value} 
                onClick={() => setInputType(tab.value)} 
                className={`flex flex-col items-center justify-center gap-1 h-14 rounded-[var(--radius-md)] border text-[11px] font-extrabold transition-all ${
                  isActive 
                    ? 'bg-gradient-to-r from-[var(--primary)] via-[var(--primary-light)] to-[var(--accent)] text-white border-transparent shadow-[var(--shadow-brand)]' 
                    : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-[var(--text-primary)]">Channel Name <span className="text-red-500">*</span></label>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">9/100</span>
            </div>
            <input 
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/10" 
              placeholder="Main Feed" 
              value={channelName} 
              onChange={e => setChannelName(e.target.value)} 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">Input Source <span className="text-red-500">*</span></label>
            {renderInput()}
          </div>

          <button
            type="button"
            onClick={probeInput}
            disabled={loading}
            className="w-full h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)] text-xs font-bold text-[var(--text-primary)] flex items-center justify-center gap-2 transition-all shadow-[var(--shadow-sm)]"
          >
            <span className={loading ? 'animate-spin' : ''}><FiRefreshCw size={14} /></span>
            Probe Input Streams & Programs
          </button>

          {programs.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-[var(--primary-200)] bg-[var(--primary-50)] p-4 space-y-3">
              <Select label="Program" value={programId?.toString() || ''} onChange={e => setProgramId(Number(e.target.value))} options={programs.map(p => ({ value: String(p.id), label: `${p.id} - ${p.name}` }))} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select label="Video Stream" value={selectedVideoStream || ''} onChange={e => setSelectedVideoStream(e.target.value || undefined)} placeholder="No video" options={videoStreams.map(s => ({ value: s.index, label: `${s.index} ${s.codec} ${s.resolution || ''}` }))} />
                <Select label="Audio Stream" value={selectedAudioStream || ''} onChange={e => setSelectedAudioStream(e.target.value || undefined)} placeholder="No audio" options={audioStreams.map(s => ({ value: s.index, label: `${s.index} ${s.codec} ${s.lang}` }))} />
              </div>
            </div>
          )}

          <Select 
            label="Transcoding Profile *" 
            value={profileId} 
            onChange={e => setProfileId(e.target.value)} 
            options={profiles.map(p => ({ value: p.id, label: p.name }))} 
          />
        </div>
      </Card>

      {/* 2. Output Destinations Card */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">Output Destinations</h2>
            <p className="text-xs text-[var(--text-secondary)]">Push to HLS, DASH, RTMP, YouTube, or local Recording files</p>
          </div>
          <button 
            type="button" 
            onClick={addDestination}
            className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] transition-all shadow-[var(--shadow-sm)] min-[430px]:w-auto"
          >
            <FiPlus size={14} /> Add Destination
          </button>
        </div>

        <div className="space-y-4">
          {destinations.map(destination => (
            <div key={destination.id} className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <Select label="Protocol" value={destination.protocol} onChange={e => setDestination(destination.id, { protocol: e.target.value as Protocol })} options={destinationOptions.map(o => ({ value: o.value, label: o.label }))} />
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">Destination Label</label>
                  <div className="flex min-w-0 flex-col gap-2 min-[360px]:flex-row min-[360px]:items-center">
                    <input className="min-w-0 w-full flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" placeholder="HLS Preview" value={destination.name} onChange={e => setDestination(destination.id, { name: e.target.value })} />
                    <StatusBadge status="Active" />
                  </div>
                </div>
              </div>

              {(destination.protocol === Protocol.YOUTUBE || destination.protocol === Protocol.FACEBOOK) && (
                <input className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] outline-none" placeholder="Stream key" value={destination.streamKey || ''} onChange={e => {
                  const url = defaultUrl(destination.protocol, channelName, settings, e.target.value);
                  setDestination(destination.id, { streamKey: e.target.value, url, playbackUrl: playbackUrl(destination.protocol, channelName, settings, url) });
                }} />
              )}

              {destination.protocol === Protocol.RECORDING ? (
                <div className="grid grid-cols-1 gap-3">
                  <input className="min-w-0 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" placeholder="File name" value={destination.recording?.fileName || ''} onChange={e => setDestination(destination.id, { recording: { format: destination.recording?.format || 'mp4', ...destination.recording, fileName: e.target.value } })} />
                  <Select label="Format" value={destination.recording?.format || 'mp4'} onChange={e => setDestination(destination.id, { recording: { ...destination.recording, format: e.target.value as any } })} options={['mp4', 'mkv', 'mov', 'ts', 'flv'].map(value => ({ value, label: value.toUpperCase() }))} />
                </div>
              ) : (
                <div className="relative flex items-center">
                  <input 
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pr-10 text-xs font-mono text-[var(--text-primary)] outline-none" 
                    placeholder="Output URL" 
                    value={destination.url} 
                    onChange={e => setDestination(destination.id, { url: e.target.value, playbackUrl: playbackUrl(destination.protocol, channelName, settings, e.target.value) })} 
                  />
                  <button 
                    type="button" 
                    onClick={() => copyUrl(destination.url)}
                    className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors p-1"
                    title="Copy URL"
                  >
                    <FiCopy size={14} />
                  </button>
                </div>
              )}

              {destination.playbackUrl && (
                <p className="rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)] break-all">
                  <strong className="text-[var(--primary)]">Play URL:</strong> {destination.playbackUrl}
                </p>
              )}

              <div className="flex justify-end pt-1">
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors" onClick={() => setDestinations(prev => prev.filter(item => item.id !== destination.id))}>
                  <FiTrash2 size={14} /> Remove Destination
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Save Live Channel Gradient Button */}
        <button 
          type="button" 
          onClick={createChannel} 
          disabled={loading}
          className="w-full mt-6 h-12 rounded-[var(--radius-md)] bg-gradient-to-r from-[var(--primary)] via-[var(--primary-light)] to-[var(--accent)] text-white font-extrabold text-sm shadow-[var(--shadow-brand)] hover:opacity-95 transition-all flex items-center justify-center gap-2"
        >
          <FiPlay size={16} /> Save Live Channel
        </button>
      </Card>
    </div>
  );
};

export default Configurator;
