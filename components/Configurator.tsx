import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe,
  Film,
  Video,
  Zap,
  Activity,
  Play,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Copy,
  Layers,
  Info,
  Check,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppSettings, Channel, ChannelDestination, InputType, Protocol, TranscodingProfile } from '../types';
import { LIVE_PROTOCOL_OPTIONS } from '../constants';
import SegmentedControl from './ui/SegmentedControl';
import ProtocolBadge from './ui/ProtocolBadge';
import CodeField from './ui/CodeField';
import Select from './ui/Select';
import DetailDrawer from './ui/DetailDrawer';
import FileUpload from './FileUpload';
import { sendRealtime, subscribeRealtime } from '../services/realtime';

const API_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const WEB_ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

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
  isOpen: boolean;
  onClose: () => void;
  profiles: TranscodingProfile[];
  settings: AppSettings;
  licenseStatus: string;
  addChannel: (channelData: Omit<Channel, 'id' | 'command' | 'status' | 'uptime' | 'speed' | 'speedHistory' | 'outputLog'>) => Promise<void>;
  getTsPrograms: (input: string) => Promise<Program[]>;
  fetchIngestStreams: () => Promise<any>;
  profileId: string;
  setProfileId: (id: string) => void;
}

const inputSourceOptions = [
  { value: InputType.URL, label: 'URL', icon: Globe },
  { value: InputType.VOD, label: 'VOD', icon: Film },
  { value: InputType.DEVICE, label: 'Device', icon: Video },
  { value: InputType.LIVE, label: 'Live', icon: Zap },
  { value: InputType.SRT, label: 'SRT', icon: Activity },
  { value: InputType.YOUTUBE, label: 'YouTube', icon: Play },
];

const destinationOptions = [
  ...LIVE_PROTOCOL_OPTIONS,
  { value: Protocol.YOUTUBE, label: 'YouTube' },
  { value: Protocol.FACEBOOK, label: 'Facebook' },
  { value: Protocol.RTMP, label: 'RTMP Push' },
  { value: Protocol.RECORDING, label: 'Recording File' },
];

const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';
const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultUrl = (protocol: Protocol, name: string, settings: AppSettings, streamKey = '') => {
  const slug = safeName(name);
  switch (protocol) {
    case Protocol.HLS:
      return `${WEB_ORIGIN}/live/${slug}/index.m3u8`;
    case Protocol.DASH:
      return `${WEB_ORIGIN}/dash/${slug}/index.mpd`;
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
      return `${WEB_ORIGIN}/ts/${slug}.ts`;
    case Protocol.RECORDING:
      return `media/recordings/${slug}.mp4`;
    default:
      return '';
  }
};

const playbackUrl = (protocol: Protocol, name: string, settings: AppSettings, url: string) => {
  const slug = safeName(name);
  if (protocol === Protocol.HLS) return `${WEB_ORIGIN}/live/${slug}/index.m3u8`;
  if (protocol === Protocol.DASH) return `${WEB_ORIGIN}/dash/${slug}/index.mpd`;
  if (protocol === Protocol.RECORDING) return '';
  return url;
};

export const Configurator: React.FC<Props> = ({
  isOpen,
  onClose,
  profiles,
  settings,
  licenseStatus,
  addChannel,
  getTsPrograms,
  fetchIngestStreams,
  profileId,
  setProfileId,
}) => {
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
  const [destinations, setDestinations] = useState<ChannelDestination[]>([
    {
      id: uniqueId(),
      name: 'HLS Preview',
      protocol: Protocol.HLS,
      url: defaultUrl(Protocol.HLS, 'Main Feed', settings),
      playbackUrl: playbackUrl(Protocol.HLS, 'Main Feed', settings, defaultUrl(Protocol.HLS, 'Main Feed', settings)),
    },
  ]);

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

  const refreshDevices = useCallback(() => {
    sendRealtime({ type: 'capture_devices_request' });
  }, []);

  useEffect(() => subscribeRealtime(message => {
    if (message.type !== 'capture_devices') return;
    setVideoDevices(message.payload?.video || []);
    setAudioDevices(message.payload?.audio || []);
  }), []);

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

    if (!targetInput) return toast.error('Enter or select an input first.');
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
    setDestinations(prev => [...prev, { id: uniqueId(), name: 'RTMP Output', protocol: Protocol.RTMP, url, playbackUrl: playbackUrl(Protocol.RTMP, channelName, settings, url) }]);
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
    onClose();
  };

  const renderInputFields = () => {
    if (inputType === InputType.URL || inputType === InputType.SRT || inputType === InputType.YOUTUBE) {
      return (
        <div className="relative">
          <input
            className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
            placeholder="srt://0.0.0.0:8890?mode=listener"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
          />
        </div>
      );
    }
    if (inputType === InputType.VOD) {
      return (
        <div className="space-y-2">
          <Select label="Server VOD File" value={inputUrl} onChange={e => setInputUrl(e.target.value)} placeholder="Select VOD file" options={vodFiles.map(f => ({ value: f.name, label: f.originalName }))} />
          <FileUpload onFileUploaded={(file, original) => { setInputUrl(file); if (!channelName) setChannelName(original.replace(/\.[^.]+$/, '')); refreshVod(); }} selectedFileName={null} uploadButtonText="Upload VOD File" />
        </div>
      );
    }
    if (inputType === InputType.DEVICE) {
      return (
        <div className="grid grid-cols-2 gap-2">
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
          <button type="button" onClick={refreshLive} className="mt-6 flex h-9 w-9 items-center justify-center rounded-md border border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] hover:bg-[#F4EEFF]">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      );
    }
    return null;
  };

  const videoStreams = currentProgram?.streams.filter(s => s.type === 'video') || [];
  const audioStreams = currentProgram?.streams.filter(s => s.type === 'audio') || [];

  const footerActions = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="h-9 rounded-md border border-[#E8DFF0] bg-white px-4 text-[12px] font-semibold text-[#6F6078] hover:bg-[#F8F7FA]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={createChannel}
        disabled={loading}
        className="flex h-9 items-center gap-1.5 rounded-md bg-[#351147] px-5 text-[12px] font-semibold text-white hover:bg-[#2B0D3A]"
      >
        <Play size={14} /> Save Live Channel
      </button>
    </div>
  );

  return (
    <DetailDrawer
      open={isOpen}
      onClose={onClose}
      title="Create Channel"
      subtitle="Configure live TV channel input, transcoding profile and outputs"
      width="max-w-[500px]"
      footer={footerActions}
    >
      <div className="space-y-4">
        {/* 1. Input Source Type */}
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[#1B1024]">
            1. Input Source <span className="text-[#E11D72]">*</span>
          </label>
          <SegmentedControl
            options={inputSourceOptions}
            value={inputType}
            onChange={val => setInputType(val as InputType)}
          />
        </div>

        {/* 2. Input Configuration */}
        <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#6F6078]">
              Input Source URL / Device <span className="text-[#E11D72]">*</span>
            </label>
            {renderInputFields()}
          </div>

          <button
            type="button"
            onClick={probeInput}
            disabled={loading}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#E8DFF0] bg-white text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Probe Input Streams & Programs
          </button>

          {programs.length > 0 && (
            <div className="rounded-md border border-[#D8C6E8] bg-[#F4EEFF] p-3 space-y-2">
              <Select label="Program" value={programId?.toString() || ''} onChange={e => setProgramId(Number(e.target.value))} options={programs.map(p => ({ value: String(p.id), label: `${p.id} - ${p.name}` }))} />
              <div className="grid grid-cols-2 gap-2">
                <Select label="Video Stream" value={selectedVideoStream || ''} onChange={e => setSelectedVideoStream(e.target.value || undefined)} placeholder="No video" options={videoStreams.map(s => ({ value: s.index, label: `${s.index} ${s.codec} ${s.resolution || ''}` }))} />
                <Select label="Audio Stream" value={selectedAudioStream || ''} onChange={e => setSelectedAudioStream(e.target.value || undefined)} placeholder="No audio" options={audioStreams.map(s => ({ value: s.index, label: `${s.index} ${s.codec} ${s.lang}` }))} />
              </div>
            </div>
          )}
        </div>

        {/* 3. Channel Settings */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#1B1024]">
              2. Channel Name <span className="text-[#E11D72]">*</span>
            </label>
            <input
              className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 text-[13px] font-semibold text-[#1B1024] outline-none focus:border-[#4A1B7A]"
              placeholder="Main Feed"
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
            />
          </div>

          <Select
            label="Transcoding Profile *"
            value={profileId}
            onChange={e => setProfileId(e.target.value)}
            options={profiles.map(p => ({ value: p.id, label: `${p.name} (${p.resolution || '1080p'})` }))}
          />
        </div>

        {/* 4. Output Destinations */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[12px] font-semibold text-[#1B1024]">
              3. Output Destinations ({destinations.length})
            </label>
            <button
              type="button"
              onClick={addDestination}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#6D32D9] hover:underline"
            >
              <Plus size={13} /> Add Output
            </button>
          </div>

          <div className="space-y-2.5">
            {destinations.map(dest => (
              <div key={dest.id} className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ProtocolBadge protocol={dest.protocol} />
                    <input
                      className="h-7 rounded border border-[#E8DFF0] bg-white px-2 text-[12px] font-semibold text-[#1B1024]"
                      placeholder="Label"
                      value={dest.name}
                      onChange={e => setDestination(dest.id, { name: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDestinations(prev => prev.filter(d => d.id !== dest.id))}
                    className="text-[#6F6078] hover:text-[#DC3545]"
                    title="Remove destination"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <Select
                  label="Protocol"
                  value={dest.protocol}
                  onChange={e => setDestination(dest.id, { protocol: e.target.value as Protocol })}
                  options={destinationOptions.map(o => ({ value: o.value, label: o.label }))}
                />

                {(dest.protocol === Protocol.YOUTUBE || dest.protocol === Protocol.FACEBOOK) && (
                  <input
                    className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2.5 font-mono text-[11px]"
                    placeholder="Stream key"
                    value={dest.streamKey || ''}
                    onChange={e => {
                      const url = defaultUrl(dest.protocol, channelName, settings, e.target.value);
                      setDestination(dest.id, { streamKey: e.target.value, url, playbackUrl: playbackUrl(dest.protocol, channelName, settings, url) });
                    }}
                  />
                )}

                <CodeField value={dest.url} label="Output URL" readOnly={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
};

export default Configurator;
