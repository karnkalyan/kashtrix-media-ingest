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
  X,
  HardDrive,
  Server,
  Radio,
  Sliders,
  Folder
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppSettings, Channel, ChannelDestination, DecklinkFormat, InputType, Protocol, StorageLocation, TranscodingProfile } from '../types';
import { LIVE_PROTOCOL_OPTIONS, DEFAULT_DECKLINK_FORMATS } from '../constants';
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
  updateChannel?: (channelData: Partial<Channel> & { id: string }) => Promise<void>;
  editingChannel?: Channel | null;
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
  { value: InputType.YOUTUBE, label: 'YouTube', icon: Play },
];

const destinationOptions = LIVE_PROTOCOL_OPTIONS;

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
    case Protocol.CUSTOM:
      return `rtmp://${API_HOST}:${settings.rtmpPort}/live/${slug}`;
    case Protocol.SRT:
      return `srt://127.0.0.1:9001?mode=caller&latency=200`;
    case Protocol.UDP:
    case Protocol.UDP_DVB:
      return `udp://224.1.1.2:3000`;
    case Protocol.HTTP_TS:
      return `${WEB_ORIGIN}/ts/${slug}.ts`;
    case Protocol.DECKLINK:
      return '';
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

const resolveInputType = (type?: string, url: string = ''): InputType => {
  const rawType = (type || '').toLowerCase().trim();
  const rawUrl = url.toLowerCase().trim();

  if (rawType.includes('vod') || rawType === 'file') return InputType.VOD;
  if (rawType.includes('device')) return InputType.DEVICE;
  if (rawType.includes('live') || rawType.includes('incoming')) return InputType.LIVE;
  if (rawType.includes('youtube')) return InputType.YOUTUBE;
  if (rawType.includes('url') || rawType.includes('http') || rawType.includes('srt') || rawType.includes('udp')) return InputType.URL;

  if (rawUrl.startsWith('device://')) return InputType.DEVICE;
  if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be')) return InputType.YOUTUBE;
  if (rawUrl.startsWith('rtmp://') || rawUrl.startsWith('/live/') || rawUrl.startsWith('live/')) return InputType.LIVE;

  if (
    rawUrl.endsWith('.mp4') ||
    rawUrl.endsWith('.mkv') ||
    rawUrl.endsWith('.ts') ||
    rawUrl.endsWith('.mov') ||
    rawUrl.endsWith('.avi') ||
    rawUrl.includes('media/vod/')
  ) {
    return InputType.VOD;
  }

  return InputType.URL;
};

export const Configurator: React.FC<Props> = ({
  isOpen,
  onClose,
  profiles,
  settings,
  licenseStatus,
  addChannel,
  updateChannel,
  editingChannel,
  getTsPrograms,
  fetchIngestStreams,
  profileId,
  setProfileId,
}) => {
  const [inputType, setInputType] = useState<InputType>(InputType.URL);
  const [channelName, setChannelName] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [vodFiles, setVodFiles] = useState<VODFile[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<number | undefined>();
  const [selectedVideoStream, setSelectedVideoStream] = useState<string | undefined>();
  const [selectedAudioStream, setSelectedAudioStream] = useState<string | undefined>();
  const [videoDevices, setVideoDevices] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [videoDevice, setVideoDevice] = useState('');
  const [audioDevice, setAudioDevice] = useState('');
  const [videoInput, setVideoInput] = useState('sdi');
  const [formatCode, setFormatCode] = useState('Hi50');
  const [liveStreams, setLiveStreams] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [decklinkDevicesList, setDecklinkDevicesList] = useState<{id: string; name: string}[]>([]);
  const [decklinkFormats, setDecklinkFormats] = useState<Record<string, DecklinkFormat[]>>({});
  const [destinations, setDestinations] = useState<ChannelDestination[]>([
    {
      id: uniqueId(),
      name: 'HLS Preview',
      protocol: Protocol.HLS,
      url: defaultUrl(Protocol.HLS, 'channel', settings),
      playbackUrl: playbackUrl(Protocol.HLS, 'channel', settings, defaultUrl(Protocol.HLS, 'channel', settings)),
    },
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingChannel) {
      const resolvedType = resolveInputType(editingChannel.inputType, editingChannel.inputUrl);
      setInputType(resolvedType);
      setChannelName(editingChannel.name || '');

      let cleanInputUrl = editingChannel.inputUrl || '';
      if (resolvedType === InputType.VOD && cleanInputUrl.startsWith('media/vod/')) {
        cleanInputUrl = cleanInputUrl.replace(/^media\/vod\//, '');
      }
      if (resolvedType === InputType.DEVICE) {
        const [rawBase, rawQuery] = cleanInputUrl.replace('device://', '').split('?');
        if (rawQuery) {
          const params = new URLSearchParams(rawQuery);
          if (params.get('video_input')) setVideoInput(params.get('video_input') || 'sdi');
          if (params.get('format_code')) setFormatCode(params.get('format_code') || 'Hi50');
        }
        if (rawBase.includes('+')) {
          const parts = rawBase.split('+');
          setVideoDevice(parts[0].replace(/^video=/i, '').trim());
          setAudioDevice(parts[1].replace(/^audio=/i, '').trim());
        } else if (rawBase.startsWith('video=')) {
          setVideoDevice(rawBase.replace(/^video=/i, '').trim());
        } else if (rawBase.startsWith('audio=')) {
          setAudioDevice(rawBase.replace(/^audio=/i, '').trim());
        } else {
          setVideoDevice(rawBase.trim());
          setAudioDevice(rawBase.trim());
        }
      }
      setInputUrl(cleanInputUrl);

      if (editingChannel.profileId) setProfileId(editingChannel.profileId);
      if (editingChannel.destinations?.length) {
        setDestinations(editingChannel.destinations);
      } else if (editingChannel.outputUrl) {
        setDestinations([{
          id: uniqueId(),
          name: editingChannel.outputProtocol?.toUpperCase() || 'HLS',
          protocol: editingChannel.outputProtocol || Protocol.HLS,
          url: editingChannel.outputUrl,
          playbackUrl: editingChannel.outputUrl
        }]);
      }
      setSelectedVideoStream(editingChannel.selectedVideoStream);
      setSelectedAudioStream(editingChannel.selectedAudioStream);
      setProgramId(editingChannel.programId);
    } else {
      setInputType(InputType.URL);
      setChannelName('');
      setInputUrl('');
      setVideoDevice('');
      setAudioDevice('');
      setDestinations([
        {
          id: uniqueId(),
          name: 'HLS Preview',
          protocol: Protocol.HLS,
          url: defaultUrl(Protocol.HLS, 'channel', settings),
          playbackUrl: playbackUrl(Protocol.HLS, 'channel', settings, defaultUrl(Protocol.HLS, 'channel', settings)),
        },
      ]);
      setSelectedVideoStream(undefined);
      setSelectedAudioStream(undefined);
      setProgramId(undefined);
    }
  }, [isOpen, editingChannel, settings, setProfileId]);

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
    const token = localStorage.getItem('kte-auth-token');
    const files = await fetch('/api/vod/list', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(res => res.json()).catch(() => []);
    setVodFiles(Array.isArray(files) ? files : []);
  }, []);

  const refreshDevices = useCallback(() => {
    sendRealtime({ type: 'capture_devices_request' });
  }, []);

  useEffect(() => subscribeRealtime(message => {
    if (message.type !== 'capture_devices') return;
    setVideoDevices(message.payload?.video || []);
    setAudioDevices(message.payload?.audio || []);
    // Capture structured DeckLink device list with IDs
    if (message.payload?.decklinkDevices?.length) {
      setDecklinkDevicesList(message.payload.decklinkDevices);
    } else if (message.payload?.decklinkMap) {
      // Fallback: build from decklinkMap
      const devs = Object.entries(message.payload.decklinkMap).map(([name, id]) => ({ id: id as string, name }));
      setDecklinkDevicesList(devs);
    }
  }), []);

  // HTTP fallback for device list
  const fetchDevicesHttp = useCallback(async () => {
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/ffmpeg/devices', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.video?.length) setVideoDevices(prev => Array.from(new Set([...prev, ...data.video])));
        if (data.audio?.length) setAudioDevices(prev => Array.from(new Set([...prev, ...data.audio])));
        // Capture structured DeckLink device list
        if (data.decklinkDevices?.length) {
          setDecklinkDevicesList(data.decklinkDevices);
        } else if (data.decklinkMap) {
          const devs = Object.entries(data.decklinkMap).map(([name, id]) => ({ id: id as string, name }));
          setDecklinkDevicesList(devs);
        }
      }
    } catch {}
  }, []);

  const fetchDecklinkFormats = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/ffmpeg/devices/${encodeURIComponent(deviceId)}/formats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.formats?.length) {
          setDecklinkFormats(prev => ({ ...prev, [deviceId]: data.formats }));
          return;
        }
      }
    } catch {}
    // Fallback if API or hardware query returned empty
    setDecklinkFormats(prev => ({
      ...prev,
      [deviceId]: prev[deviceId]?.length ? prev[deviceId] : DEFAULT_DECKLINK_FORMATS,
    }));
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
    if (inputType === InputType.DEVICE) { refreshDevices(); fetchDevicesHttp(); }
    if (inputType === InputType.LIVE) refreshLive();
    // Also fetch devices if any destination is DeckLink
    if (destinations.some(d => d.protocol === Protocol.DECKLINK)) {
      refreshDevices(); fetchDevicesHttp();
    }
  }, [inputType, refreshDevices, refreshVod, refreshLive, fetchDevicesHttp, destinations]);

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

  const addDestination = () => {
    const defaultProtocol = Protocol.HLS;
    const name = `Destination ${destinations.length + 1}`;
    const url = defaultUrl(defaultProtocol, channelName, settings);

    setDestinations(prev => [
      ...prev,
      {
        id: uniqueId(),
        name,
        protocol: defaultProtocol,
        url,
        playbackUrl: playbackUrl(defaultProtocol, channelName, settings, url),
      },
    ]);
  };

  const removeDestination = (id: string) => {
    if (destinations.length === 1) return toast.error('At least one output destination is required.');
    setDestinations(prev => prev.filter(item => item.id !== id));
  };

  const setDestination = (id: string, next: Partial<ChannelDestination>) => {
    setDestinations(prev => prev.map(item => {
      if (item.id !== id) return item;

      const protocol = next.protocol || item.protocol;
      const streamKey = next.streamKey !== undefined ? next.streamKey : item.streamKey;
      let url = next.url !== undefined ? next.url : item.url;

      if (next.protocol && next.protocol !== item.protocol) {
        url = defaultUrl(next.protocol, channelName, settings, streamKey);
      }

      if (protocol === Protocol.RECORDING) {
        const recording = { ...item.recording, ...next.recording };
        const fileName = recording.fileName?.trim() ? safeName(recording.fileName) : safeName(channelName);
        const format = recording.format || 'mp4';
        url = `media/recordings/${fileName}.${format}`;
        return { ...item, ...next, protocol, url, playbackUrl: '', recording };
      }

      if (protocol === Protocol.DECKLINK) {
        const devId = next.decklinkDeviceId || item.decklinkDeviceId || decklinkDevicesList[0]?.id || '75:05326625:00000000';
        const devName = next.decklinkDeviceName || item.decklinkDeviceName || decklinkDevicesList.find(d => d.id === devId)?.name || 'Intensity Pro 4K';
        const formatCode = next.decklinkFormatCode || item.decklinkFormatCode || 'Hi50';
        url = devId;
        return {
          ...item,
          ...next,
          protocol,
          url,
          decklinkDeviceId: devId,
          decklinkDeviceName: devName,
          decklinkFormatCode: formatCode,
          playbackUrl: '',
        };
      }

      return {
        ...item,
        ...next,
        protocol,
        streamKey,
        url,
        playbackUrl: playbackUrl(protocol, channelName, settings, url),
      };
    }));
  };

  const probeInput = async () => {
    let target = inputUrl.trim();
    if (inputType === InputType.DEVICE) {
      if (videoDevice && audioDevice) target = `device://${videoDevice}+${audioDevice}`;
      else if (videoDevice) target = `device://video=${videoDevice}`;
      else if (audioDevice) target = `device://audio=${audioDevice}`;
    }
    if (!target) return toast.error('Enter input URL or select capture device before probing.');
    setLoading(true);
    try {
      const data: any = await getTsPrograms(target);
      const progList = Array.isArray(data) ? data : (data?.programs || []);
      setPrograms(progList);
      if (progList.length) {
        setProgramId(progList[0].id || progList[0].programId);
        toast.success(`Found ${progList.length} program(s).`);
      } else if (data?.video || (data && !data.error && data.success)) {
        toast.success('Live stream signal detected successfully!');
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.error('No stream signal or programs detected. Ensure sender is actively transmitting.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Probe failed.');
    } finally {
      setLoading(false);
    }
  };

  const createChannel = async () => {
    let finalInput = inputUrl.trim();
    if (inputType === InputType.DEVICE) {
      const qParams = [];
      if (videoInput && videoInput !== 'unset' && videoInput !== 'auto') qParams.push(`video_input=${encodeURIComponent(videoInput)}`);
      if (formatCode && formatCode !== 'unset' && formatCode !== 'auto') qParams.push(`format_code=${encodeURIComponent(formatCode)}`);
      const qStr = qParams.length ? `?${qParams.join('&')}` : '';

      if (videoDevice && audioDevice) {
        finalInput = `device://${videoDevice}+${audioDevice}${qStr}`;
      } else if (videoDevice) {
        finalInput = `device://video=${videoDevice}${qStr}`;
      } else if (audioDevice) {
        finalInput = `device://audio=${audioDevice}${qStr}`;
      }
    } else if (inputType === InputType.LIVE) {
      const stream = Object.values(liveStreams).find((s: any) => s.streamName === inputUrl || s.appName === inputUrl || `${s.app}/${s.name}` === inputUrl);
      if (stream) finalInput = `/${(stream as any).app}/${(stream as any).name}`;
    }

    if (!finalInput) return toast.error('Input is required.');

    const firstDest = destinations[0] || { protocol: Protocol.HLS, url: defaultUrl(Protocol.HLS, channelName, settings) };

    const payload = {
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
    };

    if (editingChannel && updateChannel) {
      await updateChannel({ id: editingChannel.id, ...payload });
      toast.success('Channel updated successfully.');
    } else {
      await addChannel(payload);
      toast.success('Channel created successfully.');
    }
    onClose();
  };

  const renderInputFields = () => {
    if (inputType === InputType.URL) {
      const isSrt = inputUrl.startsWith('srt://');
      return (
        <div className="space-y-2">
          <div className="relative">
            <input
              className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              placeholder="srt://, udp://, rtmp://, rtsp://, http://, or https://..."
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
            />
          </div>

          {/* Protocol Quick-Pill Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-semibold text-[#6F6078] dark:text-[#A898BC]">Presets:</span>
            <button
              type="button"
              onClick={() => setInputUrl('srt://0.0.0.0:8890?mode=listener&latency=200')}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
            >
              🟢 SRT Listener
            </button>
            <button
              type="button"
              onClick={() => setInputUrl('srt://127.0.0.1:9001?mode=caller&latency=200')}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300"
            >
              🔵 SRT Caller
            </button>
            <button
              type="button"
              onClick={() => setInputUrl('srt://127.0.0.1:9001?mode=rendezvous&latency=200')}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300"
            >
              🟣 SRT Rendezvous
            </button>
            <button
              type="button"
              onClick={() => setInputUrl('udp://239.255.0.1:5000?pkt_size=1316')}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
            >
              📡 UDP Multicast
            </button>
            <button
              type="button"
              onClick={() => setInputUrl('rtmp://127.0.0.1:1935/live/stream')}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-300"
            >
              ⚡ RTMP
            </button>
          </div>

          {/* Interactive SRT Configuration Assistant when SRT is detected */}
          {isSrt && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5 space-y-2 dark:bg-purple-950/20 dark:border-purple-900/40 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1">
                  <Activity size={12} className="text-purple-600 dark:text-purple-400" /> SRT Input Mode & Parameters (All 3 Options)
                </span>
                <span className="text-[9px] text-purple-700 dark:text-purple-300 font-mono">Live Sync</span>
              </div>

              <div>
                <label className="block font-semibold text-[#1B1024] dark:text-white mb-1">SRT Connection Mode</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['listener', 'caller', 'rendezvous'] as const).map(mode => {
                    const currentMode = inputUrl.includes('mode=caller') ? 'caller' : inputUrl.includes('mode=rendezvous') ? 'rendezvous' : 'listener';
                    const isSelected = currentMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          let newUrl = inputUrl;
                          if (newUrl.includes('mode=')) {
                            newUrl = newUrl.replace(/mode=(caller|listener|rendezvous)/g, `mode=${mode}`);
                          } else {
                            newUrl += (newUrl.includes('?') ? '&' : '?') + `mode=${mode}`;
                          }
                          setInputUrl(newUrl);
                        }}
                        className={`py-1 px-1.5 rounded text-center font-bold capitalize transition-colors ${
                          isSelected
                            ? 'bg-[#7C3AED] text-white shadow-xs'
                            : 'bg-white dark:bg-[#211335] text-[#6F6078] dark:text-[#B9A5CD] border border-[#E8DFF0] dark:border-[#371F59] hover:bg-white/80'
                        }`}
                      >
                        {mode === 'listener' ? '🟢 Listener' : mode === 'caller' ? '🔵 Caller' : '🟣 Rendezvous'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <div>
                  <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Latency (ms)</label>
                  <input
                    type="number"
                    value={(() => {
                      const match = inputUrl.match(/latency=(\d+)/);
                      return match ? Number(match[1]) : 200;
                    })()}
                    onChange={e => {
                      const lat = Number(e.target.value) || 200;
                      let newUrl = inputUrl;
                      if (newUrl.includes('latency=')) {
                        newUrl = newUrl.replace(/latency=\d+/g, `latency=${lat}`);
                      } else {
                        newUrl += (newUrl.includes('?') ? '&' : '?') + `latency=${lat}`;
                      }
                      setInputUrl(newUrl);
                    }}
                    className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    placeholder="200"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Passphrase</label>
                  <input
                    type="text"
                    value={(() => {
                      const match = inputUrl.match(/passphrase=([^&]+)/);
                      return match ? decodeURIComponent(match[1]) : '';
                    })()}
                    onChange={e => {
                      const pass = e.target.value;
                      let newUrl = inputUrl;
                      if (pass) {
                        if (newUrl.includes('passphrase=')) {
                          newUrl = newUrl.replace(/passphrase=[^&]+/g, `passphrase=${encodeURIComponent(pass)}`);
                        } else {
                          newUrl += (newUrl.includes('?') ? '&' : '?') + `passphrase=${encodeURIComponent(pass)}`;
                        }
                      } else {
                        newUrl = newUrl.replace(/&?passphrase=[^&]+/g, '').replace(/\?&/, '?').replace(/\?$/, '');
                      }
                      setInputUrl(newUrl);
                    }}
                    className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    placeholder="AES Key"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Stream ID</label>
                  <input
                    type="text"
                    value={(() => {
                      const match = inputUrl.match(/streamid=([^&]+)/);
                      return match ? decodeURIComponent(match[1]) : '';
                    })()}
                    onChange={e => {
                      const sid = e.target.value;
                      let newUrl = inputUrl;
                      if (sid) {
                        if (newUrl.includes('streamid=')) {
                          newUrl = newUrl.replace(/streamid=[^&]+/g, `streamid=${encodeURIComponent(sid)}`);
                        } else {
                          newUrl += (newUrl.includes('?') ? '&' : '?') + `streamid=${encodeURIComponent(sid)}`;
                        }
                      } else {
                        newUrl = newUrl.replace(/&?streamid=[^&]+/g, '').replace(/\?&/, '?').replace(/\?$/, '');
                      }
                      setInputUrl(newUrl);
                    }}
                    className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                    placeholder="e.g. live/stream"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (inputType === InputType.YOUTUBE) {
      return (
        <div className="space-y-2.5">
          <div className="relative">
            <input
              className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-mono text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/60 p-2 text-[11px] text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
            <span className="flex items-center gap-1.5 font-medium">
              <Play size={13} className="text-red-600 fill-red-600 dark:text-red-400" />
              YouTube Live Stream &amp; VOD Ingest
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  const clip = await navigator.clipboard.readText();
                  if (clip.includes('youtube.com') || clip.includes('youtu.be')) {
                    setInputUrl(clip);
                  }
                } catch (_) {}
              }}
              className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200 hover:bg-red-50 dark:bg-[#211335] dark:border-red-800 dark:text-red-300"
            >
              Paste Clipboard
            </button>
          </div>
        </div>
      );
    }

    if (inputType === InputType.VOD) {
      const vodOptions = vodFiles.map(f => ({
        value: f.name,
        label: f.originalName && f.originalName !== f.name ? `${f.originalName} (${f.name})` : f.name
      }));
      if (inputUrl && !vodOptions.some(o => o.value === inputUrl)) {
        vodOptions.unshift({ value: inputUrl, label: inputUrl });
      }
      return (
        <div className="space-y-2">
          <Select label="Server VOD File" value={inputUrl} onChange={e => setInputUrl(e.target.value)} placeholder="Select VOD file" options={vodOptions} />
          <FileUpload
            onFileUploaded={(file, original) => {
              setInputUrl(file);
              if (!channelName) setChannelName(original.replace(/\.[^.]+$/, ''));
              refreshVod();
            }}
            selectedFileName={null}
            uploadButtonText="Upload VOD File"
          />
        </div>
      );
    }

    if (inputType === InputType.DEVICE) {
      const isDeckLink = /decklink|intensity|blackmagic|ultra\s*studio/i.test(videoDevice || '');
      const inputDeviceFormats = (videoDevice && decklinkFormats[videoDevice]) || DEFAULT_DECKLINK_FORMATS;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Video Device"
              value={videoDevice}
              onChange={e => {
                const v = e.target.value;
                setVideoDevice(v);
                if (v) fetchDecklinkFormats(v);
              }}
              placeholder="No video"
              options={videoDevices.map(name => ({ value: name, label: name }))}
            />
            <Select label="Audio Device" value={audioDevice} onChange={e => setAudioDevice(e.target.value)} placeholder="No audio" options={audioDevices.map(name => ({ value: name, label: name }))} />
          </div>

          {/* DeckLink Specific: Video Input Port and Signal Standard */}
          {isDeckLink ? (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5 space-y-2.5 dark:bg-purple-950/20 dark:border-purple-900/40">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                  <Video size={13} className="text-purple-600 dark:text-purple-400" />
                  DeckLink SDI / HDMI Hardware Ingest
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  Blackmagic SDK
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Video Input Port"
                  value={videoInput || 'sdi'}
                  onChange={e => setVideoInput(e.target.value)}
                  options={[
                    { value: 'sdi', label: 'SDI Input' },
                    { value: 'hdmi', label: 'HDMI Input' },
                    { value: 'optical_sdi', label: 'Optical SDI' },
                    { value: 'component', label: 'Component (YPbPr)' },
                    { value: 'composite', label: 'Composite (CVBS)' },
                    { value: 's_video', label: 'S-Video' },
                    { value: 'unset', label: 'Auto / Default' },
                  ]}
                />
                <Select
                  label="Signal Standard"
                  value={formatCode || 'auto'}
                  onChange={e => setFormatCode(e.target.value)}
                  options={[
                    { value: 'auto', label: '✨ Auto Detect Wire Signal (Recommended)' },
                    { value: '', label: 'Auto / Default Format' },
                    ...inputDeviceFormats.map(f => ({
                      value: f.code,
                      label: `${f.code} — ${f.description || f.code} (${f.resolution || '1080'} @ ${f.fps || 50}fps)`,
                    })),
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-[11px] text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
              <span className="font-semibold text-[#1B1024] dark:text-white">DirectShow / UVC Capture Hardware</span>
              <p className="mt-0.5 text-[10px]">
                Standard USB Webcam / DirectShow device selected. Frame rate and resolution are auto-negotiated from the camera device.
              </p>
            </div>
          )}
        </div>
      );
    }
    if (inputType === InputType.LIVE) {
      return (
        <div className="flex items-center gap-2">
          <Select
            label="Live Publisher Feed"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="Select live publisher stream"
            options={Object.entries(liveStreams).map(([k, s]: [string, any]) => ({
              value: s.appName ? `${s.appName}/${s.streamName}` : k,
              label: `${s.appName || 'live'}/${s.streamName || k} (${s.incoming_kbps || 0}k)`,
            }))}
            className="flex-1"
          />
          <button type="button" onClick={refreshLive} className="mt-6 flex h-9 w-9 items-center justify-center rounded-md border border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078] hover:bg-[#F4EEFF] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9]">
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
        className="h-9 rounded-md border border-[#E8DFF0] bg-white px-4 text-[12px] font-semibold text-[#6F6078] hover:bg-[#F8F7FA] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={createChannel}
        disabled={loading}
        className="flex h-9 items-center gap-1.5 rounded-md bg-[#351147] px-5 text-[12px] font-semibold text-white hover:bg-[#2B0D3A] dark:bg-[#6D32D9] dark:hover:bg-[#5B21B6]"
      >
        <Play size={14} /> {editingChannel ? 'Update Live Channel' : 'Save Live Channel'}
      </button>
    </div>
  );

  return (
    <DetailDrawer
      open={isOpen}
      onClose={onClose}
      title={editingChannel ? `Edit Channel — ${editingChannel.name}` : 'Create Channel'}
      subtitle={editingChannel ? 'Update live TV channel input, transcoding profile and outputs' : 'Configure live TV channel input, transcoding profile and outputs'}
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

          {destinations.length > 0 && destinations.every(d => d.protocol === Protocol.DECKLINK) ? (
            <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-2.5 dark:border-purple-900/40 dark:bg-purple-950/20 text-[11px] text-purple-900 dark:text-purple-200">
              <span className="font-semibold block text-[12px] text-purple-950 dark:text-purple-100">DeckLink Baseband Output (Direct Playout)</span>
              <p className="mt-0.5 text-[10px] text-purple-700 dark:text-purple-300">
                DeckLink card playout bypasses standard H.264/NVENC transcoding profiles and renders direct uncompressed video (uyvy422) & audio (pcm_s16le) to your selected hardware format below.
              </p>
            </div>
          ) : (
            <Select
              label="Transcoding Profile *"
              value={profileId}
              onChange={e => setProfileId(e.target.value)}
              options={profiles.map(p => ({ value: p.id, label: `${p.name} (${p.resolution || '1080p'})` }))}
            />
          )}
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

                {(dest.protocol === Protocol.YOUTUBE || dest.protocol === Protocol.FACEBOOK || dest.protocol === Protocol.CUSTOM) && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-[#1B1024] dark:text-white">
                      Stream Key {dest.protocol === Protocol.CUSTOM ? '(Optional)' : '*'}
                    </label>
                    <input
                      className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                      placeholder={dest.protocol === Protocol.CUSTOM ? "e.g. live_secret_key" : "Paste stream key here"}
                      value={dest.streamKey || ''}
                      onChange={e => {
                        const url = defaultUrl(dest.protocol, channelName, settings, e.target.value);
                        setDestination(dest.id, { streamKey: e.target.value, url, playbackUrl: playbackUrl(dest.protocol, channelName, settings, url) });
                      }}
                    />
                  </div>
                )}

                {dest.protocol !== Protocol.RECORDING && dest.protocol !== Protocol.DECKLINK && (
                  <CodeField
                    value={dest.url}
                    label="Output URL"
                    readOnly={false}
                    onChange={url => setDestination(dest.id, { url })}
                  />
                )}

                {dest.protocol === Protocol.UDP_DVB && (
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-2.5 dark:bg-[#1A0F26] dark:border-[#371F59]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD]">
                        DVB Standard MPEG-TS Parameters
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-[#7C3AED] dark:bg-[#311754] dark:text-[#E2D1F9]">
                        ETSI EN 300 468
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Program / Service ID</label>
                        <input
                          type="number"
                          value={dest.dvbServiceId ?? 1}
                          onChange={e => setDestination(dest.id, { dvbServiceId: Number(e.target.value) || 1 })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="1"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Service Name (SDT)</label>
                        <input
                          type="text"
                          value={dest.dvbServiceName ?? (channelName || 'Kashtrix HD')}
                          onChange={e => setDestination(dest.id, { dvbServiceName: e.target.value })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="Kashtrix HD"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Service Provider</label>
                        <input
                          type="text"
                          value={dest.dvbServiceProvider ?? 'Kashtrix Media'}
                          onChange={e => setDestination(dest.id, { dvbServiceProvider: e.target.value })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="Kashtrix Media"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Video PID</label>
                        <input
                          type="number"
                          value={dest.dvbVideoPid ?? 256}
                          onChange={e => setDestination(dest.id, { dvbVideoPid: Number(e.target.value) || 256 })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="256"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Audio PID</label>
                        <input
                          type="number"
                          value={dest.dvbAudioPid ?? 257}
                          onChange={e => setDestination(dest.id, { dvbAudioPid: Number(e.target.value) || 257 })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="257"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">PMT PID</label>
                        <input
                          type="number"
                          value={dest.dvbPmtPid ?? 4096}
                          onChange={e => setDestination(dest.id, { dvbPmtPid: Number(e.target.value) || 4096 })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="4096"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">TS ID / ON ID</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={dest.dvbTsid ?? 1}
                            onChange={e => setDestination(dest.id, { dvbTsid: Number(e.target.value) || 1 })}
                            className="h-7 flex-1 rounded border border-[#E8DFF0] bg-white px-1.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="TSID 1"
                            title="Transport Stream ID"
                          />
                          <input
                            type="number"
                            value={dest.dvbOnid ?? 1}
                            onChange={e => setDestination(dest.id, { dvbOnid: Number(e.target.value) || 1 })}
                            className="h-7 flex-1 rounded border border-[#E8DFF0] bg-white px-1.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="ONID 1"
                            title="Original Network ID"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">CBR Muxrate (kbps)</label>
                        <input
                          type="number"
                          value={dest.dvbMuxrate || ''}
                          onChange={e => setDestination(dest.id, { dvbMuxrate: Number(e.target.value) || undefined })}
                          className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          placeholder="e.g. 8000 (Null Stuffing)"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Packet Size / TTL</label>
                        <div className="flex gap-1">
                          <select
                            value={dest.dvbPacketSize ?? 1316}
                            onChange={e => setDestination(dest.id, { dvbPacketSize: Number(e.target.value) || 1316 })}
                            className="h-7 flex-1 rounded border border-[#E8DFF0] bg-white px-1 text-[11px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                          >
                            <option value={1316}>1316 B (7 TS)</option>
                            <option value={188}>188 B (1 TS)</option>
                          </select>
                          <input
                            type="number"
                            value={dest.dvbTtl ?? 64}
                            onChange={e => setDestination(dest.id, { dvbTtl: Number(e.target.value) || 64 })}
                            className="h-7 w-12 rounded border border-[#E8DFF0] bg-white px-1 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="TTL"
                            title="Multicast TTL"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {dest.protocol === Protocol.SRT && (
                  <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-2.5 dark:bg-[#1A0F26] dark:border-[#371F59]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD]">
                        SRT Protocol Parameters (All 3 Modes)
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-[#7C3AED] dark:bg-[#311754] dark:text-[#E2D1F9]">
                        Secure Reliable Transport
                      </span>
                    </div>

                    <div className="space-y-2 text-[10px]">
                      <div>
                        <label className="block font-semibold text-[#1B1024] dark:text-white mb-1">SRT Connection Mode</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['caller', 'listener', 'rendezvous'] as const).map(mode => {
                            const currentMode = dest.srtMode || (dest.url.includes('mode=listener') ? 'listener' : dest.url.includes('mode=rendezvous') ? 'rendezvous' : 'caller');
                            const isSelected = currentMode === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                  let newUrl = dest.url || 'srt://127.0.0.1:9001';
                                  if (newUrl.includes('mode=')) {
                                    newUrl = newUrl.replace(/mode=(caller|listener|rendezvous)/g, `mode=${mode}`);
                                  } else {
                                    newUrl += (newUrl.includes('?') ? '&' : '?') + `mode=${mode}`;
                                  }
                                  setDestination(dest.id, { srtMode: mode, url: newUrl });
                                }}
                                className={`py-1 px-2 rounded text-center font-bold capitalize transition-colors ${
                                  isSelected
                                    ? 'bg-[#7C3AED] text-white shadow-xs'
                                    : 'bg-white dark:bg-[#211335] text-[#6F6078] dark:text-[#B9A5CD] border border-[#E8DFF0] dark:border-[#371F59] hover:bg-[#F4EEFF]'
                                }`}
                              >
                                {mode === 'caller' ? '🔵 Caller' : mode === 'listener' ? '🟢 Listener' : '🟣 Rendezvous'}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Latency (ms)</label>
                          <input
                            type="number"
                            value={dest.srtLatency ?? 200}
                            onChange={e => {
                              const lat = Number(e.target.value) || 200;
                              let newUrl = dest.url || 'srt://127.0.0.1:9001?mode=caller';
                              if (newUrl.includes('latency=')) {
                                newUrl = newUrl.replace(/latency=\d+/g, `latency=${lat}`);
                              } else {
                                newUrl += (newUrl.includes('?') ? '&' : '?') + `latency=${lat}`;
                              }
                              setDestination(dest.id, { srtLatency: lat, url: newUrl });
                            }}
                            className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="200"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Passphrase (AES)</label>
                          <input
                            type="text"
                            value={dest.srtPassphrase ?? ''}
                            onChange={e => {
                              const pass = e.target.value;
                              let newUrl = dest.url || 'srt://127.0.0.1:9001?mode=caller';
                              if (pass) {
                                if (newUrl.includes('passphrase=')) {
                                  newUrl = newUrl.replace(/passphrase=[^&]+/g, `passphrase=${encodeURIComponent(pass)}`);
                                } else {
                                  newUrl += (newUrl.includes('?') ? '&' : '?') + `passphrase=${encodeURIComponent(pass)}`;
                                }
                              } else {
                                newUrl = newUrl.replace(/&?passphrase=[^&]+/g, '').replace(/\?&/, '?').replace(/\?$/, '');
                              }
                              setDestination(dest.id, { srtPassphrase: pass, url: newUrl });
                            }}
                            className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="Optional"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-[#1B1024] dark:text-white mb-0.5">Stream ID</label>
                          <input
                            type="text"
                            value={dest.srtStreamId ?? ''}
                            onChange={e => {
                              const sid = e.target.value;
                              let newUrl = dest.url || 'srt://127.0.0.1:9001?mode=caller';
                              if (sid) {
                                if (newUrl.includes('streamid=')) {
                                  newUrl = newUrl.replace(/streamid=[^&]+/g, `streamid=${encodeURIComponent(sid)}`);
                                } else {
                                  newUrl += (newUrl.includes('?') ? '&' : '?') + `streamid=${encodeURIComponent(sid)}`;
                                }
                              } else {
                                newUrl = newUrl.replace(/&?streamid=[^&]+/g, '').replace(/\?&/, '?').replace(/\?$/, '');
                              }
                              setDestination(dest.id, { srtStreamId: sid, url: newUrl });
                            }}
                            className="h-7 w-full rounded border border-[#E8DFF0] bg-white px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="Optional (e.g. live/stream)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {dest.protocol === Protocol.RECORDING && (() => {
                  const recording = dest.recording || { format: 'mp4', fileName: channelName };
                  const format = recording.format || 'mp4';
                  const fileName = recording.fileName !== undefined ? recording.fileName : channelName;
                  const locations: StorageLocation[] = (dest.locations && dest.locations.length > 0)
                    ? dest.locations
                    : (dest.recording?.locations && dest.recording.locations.length > 0)
                      ? dest.recording.locations
                      : [{ id: 'loc_1', name: 'Primary Storage', storageType: 'local', storagePath: 'media/recordings', enabled: true }];

                  const updateLocations = (newLocs: StorageLocation[]) => {
                    const primary = newLocs.find(l => l.enabled) || newLocs[0];
                    let primaryUrl = '';
                    const safeBaseName = fileName.trim() ? safeName(fileName) : safeName(channelName);
                    if (primary) {
                      if (primary.storageType === 'local' || !primary.storageType) {
                        const dir = (primary.storagePath || 'media/recordings').replace(/\\/g, '/').replace(/\/+$/, '');
                        primaryUrl = `${dir}/${safeBaseName}.${format}`;
                      } else if (primary.storageType === 'smb') {
                        const share = (primary.smbShare || '//nas/recordings').replace(/\\/g, '/').replace(/\/+$/, '');
                        primaryUrl = `${share}/${safeBaseName}.${format}`;
                      } else if (primary.storageType === 'ftp') {
                        primaryUrl = `ftp://${primary.ftpHost || '127.0.0.1'}/${safeBaseName}.${format}`;
                      } else if (primary.storageType === 's3') {
                        primaryUrl = `${primary.s3Bucket || 's3://kashtrix-recordings'}/${safeBaseName}.${format}`;
                      }
                    } else {
                      primaryUrl = `media/recordings/${safeBaseName}.${format}`;
                    }

                    setDestination(dest.id, {
                      locations: newLocs,
                      recording: { ...recording, format, fileName, locations: newLocs },
                      url: primaryUrl,
                    });
                  };

                  const addLocation = () => {
                    const nextLoc: StorageLocation = {
                      id: `loc_${Date.now()}`,
                      name: `Storage Destination ${locations.length + 1}`,
                      storageType: locations.length === 1 ? 'smb' : 'local',
                      storagePath: locations.length === 1 ? '' : 'media/recordings_backup',
                      smbShare: locations.length === 1 ? '\\\\192.168.1.100\\recordings' : '',
                      enabled: true,
                    };
                    updateLocations([...locations, nextLoc]);
                  };

                  const removeLocation = (locId: string) => {
                    if (locations.length === 1) {
                      toast.error('At least one storage destination is required for recording.');
                      return;
                    }
                    updateLocations(locations.filter(l => l.id !== locId));
                  };

                  const patchLocation = (locId: string, updates: Partial<StorageLocation>) => {
                    updateLocations(locations.map(l => (l.id === locId ? { ...l, ...updates } : l)));
                  };

                  return (
                    <div className="space-y-3 pt-2 border-t border-[#E8DFF0] dark:border-[#371F59]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Select
                          label="Container Format"
                          value={format}
                          onChange={e => {
                            const nextFormat = e.target.value as any;
                            const updatedRecording = { ...recording, format: nextFormat };
                            setDestination(dest.id, { recording: updatedRecording });
                            updateLocations(locations);
                          }}
                          options={[
                            { value: 'mp4', label: 'MP4 (MPEG-4 Part 14 - Universal)' },
                            { value: 'mkv', label: 'MKV (Matroska - Crash Resilient)' },
                            { value: 'ts', label: 'TS (MPEG Transport Stream - Broadcast)' },
                            { value: 'mov', label: 'MOV (Apple QuickTime ProRes/Master)' },
                            { value: 'flv', label: 'FLV (Flash Video)' },
                          ]}
                        />

                        <div>
                          <label className="block text-[11px] font-semibold text-[#1B1024] dark:text-white mb-1">
                            File Name Base / Prefix
                          </label>
                          <input
                            type="text"
                            className="h-8 w-full rounded border border-[#E8DFF0] bg-white px-2.5 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                            placeholder="e.g. Channel1_Master"
                            value={fileName}
                            onChange={e => {
                              const nextName = e.target.value;
                              const updatedRecording = { ...recording, fileName: nextName };
                              setDestination(dest.id, { recording: updatedRecording });
                              updateLocations(locations);
                            }}
                          />
                        </div>
                      </div>

                      {/* Multiple Storage Destinations Manager */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-[#1B1024] dark:text-white flex items-center gap-1.5">
                            <HardDrive size={13} className="text-[#7C3AED]" />
                            Simultaneous Storage Locations ({locations.length})
                          </label>
                          <button
                            type="button"
                            onClick={addLocation}
                            className="flex items-center gap-1 text-[11px] font-bold text-[#7C3AED] hover:underline dark:text-[#C4B5FD]"
                          >
                            <Plus size={12} /> Add Storage Location
                          </button>
                        </div>

                        <div className="space-y-2">
                          {locations.map((loc, locIdx) => (
                            <div
                              key={loc.id}
                              className="rounded-lg border border-[#E8DFF0] bg-white p-2.5 shadow-2xs space-y-2 dark:bg-[#1E1130] dark:border-[#371F59]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-purple-100 text-[#7C3AED] px-1.5 py-0.5 text-[9px] font-bold uppercase dark:bg-[#311754] dark:text-[#C4B5FD]">
                                    {loc.storageType || 'LOCAL'}
                                  </span>
                                  <input
                                    type="text"
                                    value={loc.name || `Location #${locIdx + 1}`}
                                    onChange={e => patchLocation(loc.id, { name: e.target.value })}
                                    className="h-6 rounded border border-transparent hover:border-[#E8DFF0] focus:border-[#7C3AED] px-1 text-[11px] font-semibold text-[#1B1024] dark:text-white bg-transparent outline-none"
                                    placeholder="Location label..."
                                  />
                                </div>

                                <div className="flex items-center gap-2">
                                  <label className="flex items-center gap-1 text-[10px] text-[#6F6078] dark:text-[#B9A5CD] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={loc.enabled !== false}
                                      onChange={e => patchLocation(loc.id, { enabled: e.target.checked })}
                                      className="rounded text-[#7C3AED]"
                                    />
                                    <span>Active</span>
                                  </label>

                                  {locations.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeLocation(loc.id)}
                                      className="text-[#6F6078] hover:text-[#DC3545] p-0.5"
                                      title="Remove this storage location"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Protocol selector & parameters */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                    Storage Protocol
                                  </label>
                                  <select
                                    value={loc.storageType || 'local'}
                                    onChange={e => patchLocation(loc.id, { storageType: e.target.value as any })}
                                    className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] font-semibold text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                  >
                                    <option value="local">Local Disk Directory</option>
                                    <option value="smb">Network Share (SMB / NAS)</option>
                                    <option value="ftp">FTP / SFTP Server</option>
                                    <option value="s3">AWS S3 / Cloud Bucket</option>
                                  </select>
                                </div>

                                {(!loc.storageType || loc.storageType === 'local') && (
                                  <div>
                                    <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                      Local Directory Path
                                    </label>
                                    <input
                                      type="text"
                                      value={loc.storagePath || 'media/recordings'}
                                      onChange={e => patchLocation(loc.id, { storagePath: e.target.value })}
                                      placeholder="media/recordings or D:/Recordings"
                                      className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                    />
                                  </div>
                                )}

                                {loc.storageType === 'smb' && (
                                  <>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        SMB UNC Path
                                      </label>
                                      <input
                                        type="text"
                                        value={loc.smbShare || ''}
                                        onChange={e => patchLocation(loc.id, { smbShare: e.target.value })}
                                        placeholder="\\192.168.1.100\recordings"
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        SMB Username
                                      </label>
                                      <input
                                        type="text"
                                        value={loc.smbUsername || ''}
                                        onChange={e => patchLocation(loc.id, { smbUsername: e.target.value })}
                                        placeholder="admin"
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        SMB Password
                                      </label>
                                      <input
                                        type="password"
                                        value={loc.smbPassword || ''}
                                        onChange={e => patchLocation(loc.id, { smbPassword: e.target.value })}
                                        placeholder="••••••••"
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      />
                                    </div>
                                  </>
                                )}

                                {loc.storageType === 'ftp' && (
                                  <>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        FTP Host / Port
                                      </label>
                                      <div className="flex gap-1">
                                        <input
                                          type="text"
                                          value={loc.ftpHost || ''}
                                          onChange={e => patchLocation(loc.id, { ftpHost: e.target.value })}
                                          placeholder="ftp.broadcast.net"
                                          className="h-7 flex-1 rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                        />
                                        <input
                                          type="number"
                                          value={loc.ftpPort || 21}
                                          onChange={e => patchLocation(loc.id, { ftpPort: Number(e.target.value) })}
                                          className="h-7 w-14 rounded border border-[#E8DFF0] bg-[#F8F7FA] px-1 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        FTP Remote Directory
                                      </label>
                                      <input
                                        type="text"
                                        value={loc.ftpPath || ''}
                                        onChange={e => patchLocation(loc.id, { ftpPath: e.target.value })}
                                        placeholder="/archives/tv/"
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      />
                                    </div>
                                  </>
                                )}

                                {loc.storageType === 's3' && (
                                  <>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        S3 Bucket Name
                                      </label>
                                      <input
                                        type="text"
                                        value={loc.s3Bucket || ''}
                                        onChange={e => patchLocation(loc.id, { s3Bucket: e.target.value })}
                                        placeholder="s3://kashtrix-recordings"
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 font-mono text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-0.5">
                                        S3 Region
                                      </label>
                                      <input
                                        type="text"
                                        value={loc.s3Region || 'us-east-1'}
                                        onChange={e => patchLocation(loc.id, { s3Region: e.target.value })}
                                        placeholder="us-east-1"
                                        className="h-7 w-full rounded border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-[11px] text-[#1B1024] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {dest.protocol === Protocol.DECKLINK && (() => {
                  const currentFormats = (dest.decklinkDeviceId && decklinkFormats[dest.decklinkDeviceId]?.length)
                    ? decklinkFormats[dest.decklinkDeviceId]
                    : DEFAULT_DECKLINK_FORMATS;
                  const selectedFormat = currentFormats.find(f => f.code === (dest.decklinkFormatCode || 'Hi50')) || currentFormats[0];

                  return (
                    <div className="space-y-2">
                      <Select
                        label="DeckLink Output Device"
                        value={dest.decklinkDeviceId || (decklinkDevicesList[0]?.id || '')}
                        onChange={e => {
                          const devId = e.target.value;
                          const dev = decklinkDevicesList.find(d => d.id === devId);
                          setDestination(dest.id, {
                            decklinkDeviceId: devId,
                            decklinkDeviceName: dev?.name || devId,
                            url: devId,
                            decklinkFormatCode: dest.decklinkFormatCode || 'Hi50',
                          });
                          if (devId) fetchDecklinkFormats(devId);
                        }}
                        placeholder="Select output device"
                        options={decklinkDevicesList.length > 0 ? decklinkDevicesList.map(d => ({
                          value: d.id,
                          label: `${d.name} (${d.id})`,
                        })) : [
                          { value: dest.decklinkDeviceId || '75:05326625:00000000', label: dest.decklinkDeviceName ? `${dest.decklinkDeviceName} (${dest.decklinkDeviceId})` : `Intensity Pro 4K (75:05326625:00000000)` }
                        ]}
                      />

                      <Select
                        label="Output Format (Signal Standard & Frame Rate)"
                        value={dest.decklinkFormatCode || 'Hi50'}
                        onChange={e => setDestination(dest.id, { decklinkFormatCode: e.target.value })}
                        options={currentFormats.map(f => ({
                          value: f.code,
                          label: `${f.code} — ${f.description}`,
                        }))}
                      />

                      {selectedFormat && (
                        <div className="rounded-md border border-purple-200 bg-purple-50/70 p-2 text-[11px] text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>Format: {selectedFormat.code}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${selectedFormat.interlaced ? 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200' : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200'}`}>
                              {selectedFormat.interlaced ? 'Interlaced' : 'Progressive'}
                            </span>
                          </div>
                          <div className="text-[10px] text-purple-700 dark:text-purple-300">
                            Resolution: <span className="font-mono">{selectedFormat.resolution}</span> • Frame Rate: <span className="font-mono">{selectedFormat.fps} fps</span>
                          </div>
                          <div className="text-[10px] text-purple-600 dark:text-purple-400">
                            Video Output: <span className="font-mono">uyvy422</span> (Uncompressed) • Audio: <span className="font-mono">pcm_s16le 48kHz Stereo</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DetailDrawer>
  );
};

export default Configurator;
