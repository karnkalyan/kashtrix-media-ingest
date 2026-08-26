import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { subscribeRealtime } from "../services/realtime";
import {
  AppSettings,
  AudioCodec,
  AuthState,
  Channel,
  ChannelDestination,
  ChannelStatus,
  IngestRecordingOptions,
  InputType,
  LicenseInfo,
  Protocol,
  TranscodingProfile,
  VideoCodec,
} from "../types";
import { DEFAULT_PROFILES } from "../constants";

const API_BASE = "";
const VOD_BASE_PATH = "media/vod/";

interface AppState {
  channels: Channel[];
  profiles: TranscodingProfile[];
  settings: AppSettings;
  license: LicenseInfo;
  ingestStreams: any;
  ingestHistory: any[];
  recordings: any[];
}

type Action =
  | { type: "HYDRATE_STATE"; payload: Partial<AppState> }
  | { type: "ADD_CHANNEL"; payload: Channel }
  | { type: "UPDATE_CHANNEL"; payload: Partial<Channel> & { id: string } }
  | { type: "REMOVE_CHANNEL"; payload: { id: string } }
  | { type: "CLEAR_CHANNELS" }
  | { type: "START_CHANNEL"; payload: { id: string } }
  | { type: "STOP_CHANNEL"; payload: { id: string } }
  | {
      type: "UPDATE_CHANNEL_STATS";
      payload: { id: string; uptime: number; speed: number; log: string };
    }
  | { type: "ADD_PROFILE"; payload: TranscodingProfile }
  | { type: "UPDATE_PROFILE"; payload: TranscodingProfile }
  | { type: "REMOVE_PROFILE"; payload: { id: string } }
  | { type: "SET_SETTINGS"; payload: AppSettings }
  | { type: "SET_LICENSE"; payload: LicenseInfo }
  | { type: "UPDATE_INGEST_STATS"; payload: any }
  | { type: "UPDATE_INGEST_HISTORY"; payload: any[] }
  | { type: "UPDATE_RECORDINGS_LIST"; payload: any[] };

type SaveStatus = "idle" | "saving" | "saved";

const initialSettings: AppSettings = {
  rtmpPort: 1935,
  mediaPort: 8080,
  httpPort: 8000,
  apiPort: 3001,
};
const unlicensedLicense: LicenseInfo = {
  status: "unlicensed",
  features: [],
  modules: [],
  maxRecordingDevices: 0,
};

const initialState: AppState = {
  channels: [],
  profiles: [],
  settings: initialSettings,
  license: unlicensedLicense,
  ingestStreams: {},
  ingestHistory: [],
  recordings: [],
};

const sanitizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "stream";
const uniqueId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

const normalizeVideoEncoder = (codec?: string): string => {
  const c = String(codec || "").toLowerCase();
  if (c === "h264" || c === "avc") return "libx264";
  if (c === "hevc" || c === "h265") return "libx265";
  if (c === "vp9") return "libvpx-vp9";
  if (c === "av1") return "libaom-av1";
  return codec || "libx264";
};

const buildVideoFlags = (
  profile: TranscodingProfile,
  destination?: ChannelDestination,
) => {
  if (profile.isAudioOnly) return "-vn";
  if (profile.videoCodec === VideoCodec.Copy) return "-c:v copy";

  const encoder = normalizeVideoEncoder(profile.videoCodec);
  const isH264 = [VideoCodec.H264, VideoCodec.H264_NVENC, VideoCodec.H264_AMF, VideoCodec.H264_VIDEOTOOLBOX, "libx264", "h264_nvenc", "h264_amf"].includes(profile.videoCodec as any);
  const bitrate =
    destination?.recording?.videoBitrate || profile.videoBitrate || 2000;
  const rawResolution =
    destination?.recording?.resolution || profile.resolution;
  const resolution =
    rawResolution &&
    !["N/A", "source", "auto", "original"].includes(rawResolution.toLowerCase())
      ? rawResolution
      : "";
  const rawFramerate = destination?.recording?.framerate ?? profile.framerate;
  const framerate =
    rawFramerate && Number(rawFramerate) > 0 ? Number(rawFramerate) : 0;

  // Rate Control Mode
  const rateControl = profile.rateControl || (profile.videoQualityMode === "crf" ? "crf" : "cbr");
  let qualityFlags = "";
  if (rateControl === "crf") {
    qualityFlags = `-crf ${profile.crf || 23}`;
  } else if (rateControl === "cqp") {
    qualityFlags = `-cqp ${profile.crf || 23}`;
  } else if (rateControl === "vbr") {
    const max = profile.maxrate || Math.round(bitrate * 1.5);
    const buf = profile.bufsize || bitrate * 2;
    qualityFlags = `-b:v ${bitrate}k -maxrate ${max}k -bufsize ${buf}k`;
  } else {
    // Strict CBR (default for broadcast/DVB)
    const min = profile.minrate || bitrate;
    const max = profile.maxrate || bitrate;
    const buf = profile.bufsize || bitrate * 2;
    qualityFlags = `-b:v ${bitrate}k -minrate ${min}k -maxrate ${max}k -bufsize ${buf}k`;
  }

  // MPEG-4 AVC Advanced Parameters (Profile, Level, B-Frames, CABAC)
  const avcFlags: string[] = [];
  if (isH264) {
    if (profile.avcProfile) {
      avcFlags.push(`-profile:v ${profile.avcProfile}`);
    } else {
      avcFlags.push("-profile:v high");
    }
    if (profile.avcLevel) {
      avcFlags.push(`-level:v ${profile.avcLevel}`);
    }
    if (profile.bFrames !== undefined && profile.bFrames >= 0) {
      avcFlags.push(`-bf ${profile.bFrames}`);
    } else {
      avcFlags.push("-bf 2");
    }
    if (profile.cabac === false) {
      avcFlags.push("-coder 0"); // CAVLC
    } else {
      avcFlags.push("-coder 1"); // CABAC
    }
  }

  const isAmdAmf = [VideoCodec.H264_AMF, VideoCodec.HEVC_AMF].includes(
    profile.videoCodec as VideoCodec,
  );

  const filters: string[] = [];
  if (profile.interlaced) {
    filters.push("tinterlace=mode=interleave_top");
  } else {
    filters.push("yadif=0:-1:1");
  }
  if (resolution) {
    filters.push(`scale=${resolution.replace("x", ":")}`);
  }

  const gop = profile.gopSize || 50;
  const keyintMin = Math.max(1, Math.floor(gop / 2));

  return [
    `-c:v ${encoder}`,
    ...avcFlags,
    qualityFlags,
    filters.length ? `-vf ${quote(filters.join(","))}` : "",
    framerate > 0 ? `-r ${framerate}` : "",
    !isAmdAmf && profile.preset ? `-preset ${profile.preset}` : "",
    profile.tune ? `-tune ${profile.tune}` : "",
    `-g ${gop}`,
    `-keyint_min ${keyintMin}`,
    profile.pixelFormat
      ? `-pix_fmt ${profile.pixelFormat}`
      : "-pix_fmt yuv420p",
  ]
    .filter(Boolean)
    .join(" ");
};

const buildAudioFlags = (profile: TranscodingProfile) => {
  if (profile.audioCodec === AudioCodec.Copy) return "-c:a copy";
  return [
    `-c:a ${profile.audioCodec}`,
    profile.audioBitrate ? `-b:a ${profile.audioBitrate}k` : "",
    profile.sampleRate ? `-ar ${profile.sampleRate}` : "",
    profile.audioChannels ? `-ac ${profile.audioChannels}` : "-ac 2",
  ]
    .filter(Boolean)
    .join(" ");
};

const recordingOutputPath = (
  destination: ChannelDestination,
  channelName: string,
) => {
  const format = destination.recording?.format || "mp4";
  const fileName = destination.recording?.fileName?.trim()
    ? sanitizeName(destination.recording.fileName)
    : sanitizeName(channelName);
  return `media/recordings/${fileName}.${format}`;
};

const destinationUrl = (
  destination: ChannelDestination,
  channelName: string,
  settings: AppSettings,
) => {
  if (destination.protocol !== Protocol.RECORDING) return destination.url;
  return destination.url && destination.url.trim()
    ? destination.url
    : recordingOutputPath(destination, channelName);
};

const recordingOutputFlags = (destination: ChannelDestination) => {
  const format = destination.recording?.format || "mp4";
  if (["mp4", "mov"].includes(format)) {
    return "-movflags +frag_keyframe+empty_moov+default_base_moof";
  }
  return "";
};

const teeEscape = (value: string) =>
  value.replace(/\\/g, "/").replace(/\|/g, "\\|").replace(/'/g, "\\'");

const teeDestination = (
  destination: ChannelDestination,
  channelName: string,
  settings: AppSettings,
): string[] => {
  const slug = sanitizeName(channelName);
  let url = destinationUrl(destination, channelName, settings);

  switch (destination.protocol) {
    case Protocol.HLS:
      return [
        `[f=hls:hls_time=4:hls_list_size=5:hls_flags=delete_segments]${teeEscape(`media/hls/${slug}/index.m3u8`)}`,
      ];
    case Protocol.DASH:
      return [
        `[f=dash:window_size=5:extra_window_size=5:use_template=1:use_timeline=1]${teeEscape(`media/dash/${slug}/index.mpd`)}`,
      ];
    case Protocol.RTMP:
    case Protocol.YOUTUBE:
    case Protocol.FACEBOOK:
    case Protocol.TWITCH:
    case Protocol.CUSTOM:
      return [`[f=flv]${teeEscape(url)}`];
    case Protocol.SRT:
      url = url.includes("?") ? url : `${url}?mode=caller`;
      return [`[f=mpegts]${teeEscape(url)}`];
    case Protocol.UDP: {
      const pktSize = destination.dvbPacketSize || 1316;
      const ttl = destination.dvbTtl || 64;
      const buf = destination.dvbBufferSize || 65535;
      const local = destination.dvbLocalAddr ? `&localaddr=${encodeURIComponent(destination.dvbLocalAddr)}` : "";
      const udpParams = `pkt_size=${pktSize}&ttl=${ttl}&buffer_size=${buf}${local}`;
      const destUrl = destination.url.includes("?")
        ? `${destination.url}&${udpParams}`
        : `${destination.url}?${udpParams}`;

      // Build DVB Standard MPEG-TS muxing options
      const sId = destination.dvbServiceId || 1;
      const sName = destination.dvbServiceName || channelName || "Kashtrix TV";
      const sProvider = destination.dvbServiceProvider || "Kashtrix Media";
      const pmtPid = destination.dvbPmtPid || 4096;
      const vidPid = destination.dvbVideoPid || 256;
      const tsId = destination.dvbTsid || 1;
      const onId = destination.dvbOnid || 1;
      const muxrateFlag = destination.dvbMuxrate ? `:muxrate=${destination.dvbMuxrate}k` : "";

      const dvbMuxer = `f=mpegts:mpegts_service_id=${sId}:mpegts_service_type=digital_tv:mpegts_pmt_start_pid=${pmtPid}:mpegts_start_pid=${vidPid}:mpegts_transport_stream_id=${tsId}:mpegts_original_network_id=${onId}:metadata=service_name=${teeEscape(sName)}:metadata=service_provider=${teeEscape(sProvider)}${muxrateFlag}`;

      return [`[${dvbMuxer}]${teeEscape(destUrl)}`];
    }
    case Protocol.HTTP_TS: {
      const sId = destination.dvbServiceId || 1;
      const sName = destination.dvbServiceName || channelName || "Kashtrix TV";
      const sProvider = destination.dvbServiceProvider || "Kashtrix Media";
      const pmtPid = destination.dvbPmtPid || 4096;
      const vidPid = destination.dvbVideoPid || 256;
      const dvbMuxer = `f=mpegts:mpegts_service_id=${sId}:mpegts_pmt_start_pid=${pmtPid}:mpegts_start_pid=${vidPid}:metadata=service_name=${teeEscape(sName)}:metadata=service_provider=${teeEscape(sProvider)}`;
      return [`[${dvbMuxer}]${teeEscape(url)}`];
    }
    case Protocol.DECKLINK: {
      return [];
    }
    case Protocol.RECORDING: {
      const format = destination.recording?.format || "mp4";
      const muxer = format === "ts" ? "mpegts" : format;
      const fileName = destination.recording?.fileName?.trim()
        ? sanitizeName(destination.recording.fileName)
        : sanitizeName(channelName);

      const locations =
        destination.locations && destination.locations.length > 0
          ? destination.locations
          : destination.recording?.locations &&
              destination.recording.locations.length > 0
            ? destination.recording.locations
            : null;

      if (locations && locations.length > 0) {
        const enabledLocs = locations.filter((l) => l.enabled !== false);
        if (enabledLocs.length > 0) {
          return enabledLocs.map((loc) => {
            let targetPath = "";
            if (loc.storageType === "local" || !loc.storageType) {
              const dir = (loc.storagePath || "media/recordings")
                .replace(/\\/g, "/")
                .replace(/\/+$/, "");
              targetPath = `${dir}/${fileName}.${format}`;
            } else if (loc.storageType === "smb") {
              const share = (loc.smbShare || "//nas/recordings")
                .replace(/\\/g, "/")
                .replace(/\/+$/, "");
              targetPath = `${share}/${fileName}.${format}`;
            } else if (loc.storageType === "ftp") {
              const host = loc.ftpHost || "127.0.0.1";
              const port = loc.ftpPort ? `:${loc.ftpPort}` : "";
              const user = loc.ftpUsername
                ? `${loc.ftpUsername}${loc.ftpPassword ? `:${loc.ftpPassword}` : ""}@`
                : "";
              const fPath = (loc.ftpPath || "").replace(/^\/+/, "");
              targetPath = `ftp://${user}${host}${port}/${fPath ? `${fPath}/` : ""}${fileName}.${format}`;
            } else if (loc.storageType === "s3") {
              const bucket = (loc.s3Bucket || "s3://kashtrix-recordings")
                .replace(/\\/g, "/")
                .replace(/\/+$/, "");
              targetPath = `${bucket}/${fileName}.${format}`;
            }
            return `[f=${muxer}]${teeEscape(targetPath)}`;
          });
        }
      }

      const targetUrl =
        url && url.trim() ? url : `media/recordings/${fileName}.${format}`;
      return [`[f=${muxer}]${teeEscape(targetUrl)}`];
    }
    default:
      return [teeEscape(url)];
  }
};

/**
 * Build the FFmpeg output flags for a DeckLink destination.
 * DeckLink output requires:
 * - Video: scale → setsar → fps → tinterlace (if interlaced) → format=uyvy422
 * - Pixel format: uyvy422
 * - Audio: pcm_s16le at 48kHz stereo
 * - Output: -f decklink "<device_id>"
 */
const buildDecklinkOutputFlags = (
  dest: ChannelDestination,
  profile?: TranscodingProfile,
) => {
  const deviceId =
    dest.decklinkDeviceId ||
    dest.decklinkDevice ||
    dest.url?.replace("decklink://", "") ||
    "";
  const formatCode = dest.decklinkFormatCode || "Hi50";

  // Derive output parameters from the format code
  // Format codes: Hi50 = 1080i50, Hp25 = 1080p25, hp50 = 720p50, etc.
  const isInterlaced =
    formatCode.startsWith("Hi") ||
    formatCode.startsWith("hi") ||
    formatCode === "ntsc" ||
    formatCode === "pal";

  // Determine output FPS from format code
  let outputFps = 50; // default
  const fpsMatch = formatCode.match(/(\d+)$/);
  if (fpsMatch) {
    outputFps = parseInt(fpsMatch[1]);
  } else if (formatCode === "pal") {
    outputFps = 25;
  } else if (formatCode === "ntsc") {
    outputFps = 30;
  }

  // For interlaced output, the frame rate in the filter chain is double the field rate
  // e.g. Hi50 = 1080i at 25fps field rate → fps=50 in the filter chain for tinterlace
  const filterFps = isInterlaced ? outputFps : outputFps;

  // Determine resolution from format code
  let resolution = profile?.resolution || "1920x1080";
  if (formatCode.startsWith("4k")) {
    resolution = "3840x2160";
  } else if (formatCode.startsWith("hp") || formatCode.startsWith("Hp")) {
    resolution = formatCode.startsWith("hp") ? "1280x720" : "1920x1080";
  } else if (formatCode.startsWith("Hi") || formatCode.startsWith("hi")) {
    resolution = "1920x1080";
  } else if (formatCode === "pal") {
    resolution = "720x576";
  } else if (formatCode === "ntsc") {
    resolution = "720x486";
  } else if (formatCode.includes("23ps") || formatCode.includes("24ps")) {
    resolution = "1920x1080";
  }

  // Build the video filter chain
  const filters: string[] = [
    `scale=${resolution.replace("x", ":")}`,
    "setsar=1",
    `fps=${filterFps}`,
  ];
  if (isInterlaced) {
    filters.push("tinterlace=mode=interleave_top");
  }
  filters.push("format=uyvy422");

  const vf = `-vf "${filters.join(",")}"`;
  const pixFmt = "-pix_fmt uyvy422";
  const audioFlags = "-c:a pcm_s16le -ar 48000 -ac 2";
  const output = `-f decklink ${quote(deviceId)}`;

  return `${vf} ${pixFmt} ${audioFlags} ${output}`;
};

export const generateCommand = (
  channel: Omit<Channel, "command">,
  profile: TranscodingProfile | undefined,
  settings: AppSettings = initialSettings,
): string => {
  const destinations = channel.destinations?.length
    ? channel.destinations
    : [
        {
          id: "legacy",
          name: channel.outputProtocol,
          protocol: channel.outputProtocol,
          url: channel.outputUrl,
        },
      ];

  // Separate DeckLink destinations from non-DeckLink destinations
  const decklinkDests = destinations.filter(
    (d) => d.protocol === Protocol.DECKLINK,
  );
  const nonDecklinkDests = destinations.filter(
    (d) => d.protocol !== Protocol.DECKLINK,
  );

  if (!profile && nonDecklinkDests.length > 0)
    return "Error: Profile not found";

  let inputFlags = "";
  const isWindows =
    navigator.platform.includes("Win") ||
    navigator.userAgent.includes("Windows");
  const isMac = navigator.platform.includes("Mac");

  if (channel.inputType === InputType.DEVICE) {
    const [rawBase, rawQuery] = (channel.inputUrl || "")
      .replace("device://", "")
      .split("?");
    let videoInput = "";
    let formatCode = "";
    if (rawQuery) {
      const params = new URLSearchParams(rawQuery);
      if (params.get("video_input"))
        videoInput = params.get("video_input") || "";
      if (params.get("format_code"))
        formatCode = params.get("format_code") || "";
    }
    const parts = rawBase.split("+");
    const vDev = (parts[0] || "").replace(/^video=/i, "").trim();
    const aDev = (parts[1] || vDev).replace(/^audio=/i, "").trim();
    const dev = vDev || aDev;

    const isDeckLink = /decklink|intensity|blackmagic/i.test(dev);
    const resolvedVideoInput = videoInput && videoInput !== "unset" && videoInput !== "auto"
      ? videoInput
      : (isDeckLink ? "sdi" : "");
    const resolvedFormatCode = formatCode && formatCode !== "unset" && formatCode !== "auto"
      ? formatCode
      : (isDeckLink ? "Hi50" : "");

    if (!dev) {
      inputFlags = "-i pipe:0"; // placeholder — server will resolve actual device
    } else if (isWindows) {
      const vSpec = vDev ? `video=${vDev}` : `video=${dev}`;
      const aSpec = aDev ? `audio=${aDev}` : "";
      const srcSpec = aSpec && aSpec !== vSpec ? `${vSpec}:${aSpec}` : vSpec;
      inputFlags = `-thread_queue_size 2048 -f dshow -rtbufsize 2048M -i ${quote(srcSpec)}`;
    } else {
      const formatFlag = resolvedFormatCode ? `-format_code ${resolvedFormatCode} ` : "";
      const vInputFlag = resolvedVideoInput ? `-video_input ${resolvedVideoInput} ` : "";
      inputFlags = `-thread_queue_size 2048 -f decklink ${formatFlag}${vInputFlag}-i ${quote(dev)}`;
    }
  } else if (channel.inputType === InputType.VOD) {
    inputFlags = `-re -i ${quote(`${VOD_BASE_PATH}${channel.inputUrl}`)}`;
  } else if (channel.inputType === InputType.LIVE) {
    const url = channel.inputUrl.startsWith("rtmp")
      ? channel.inputUrl
      : `rtmp://127.0.0.1:${settings.rtmpPort}/${channel.inputUrl.replace(/^\/+/, "")}`;
    inputFlags = `-re -i ${quote(url)}`;
  } else if (channel.inputType === InputType.SRT) {
    inputFlags = `-i ${quote(channel.inputUrl)}`;
  } else if (channel.inputType === InputType.YOUTUBE) {
    inputFlags = `-i pipe:0`;
  } else {
    inputFlags = `-re -i ${quote(channel.inputUrl)}`;
  }

  const youtubePrefix =
    channel.inputType === InputType.YOUTUBE
      ? `yt-dlp --no-update -f b -o - ${quote(channel.inputUrl)} | `
      : "";

  const mapOptions: string[] = [];
  if (channel.selectedVideoStream)
    mapOptions.push(`-map ${channel.selectedVideoStream}`);
  if (channel.selectedAudioStream)
    mapOptions.push(`-map ${channel.selectedAudioStream}`);
  if (mapOptions.length === 0) {
    if (channel.programId && channel.inputType === InputType.URL) {
      mapOptions.push(`-map 0:p:${channel.programId}`);
    } else if (
      channel.inputType === InputType.DEVICE ||
      decklinkDests.length > 0
    ) {
      mapOptions.push("-map 0:v:0", "-map 0:a:0?");
    } else {
      mapOptions.push("-map 0");
    }
  }

  const outputFormatOptions: Partial<Record<Protocol, string>> = {
    [Protocol.SRT]: "-f mpegts",
    [Protocol.UDP]: "-f mpegts",
    [Protocol.HTTP_TS]: "-f mpegts",
    [Protocol.RTMP]: "-f flv",
    [Protocol.YOUTUBE]: "-f flv",
    [Protocol.FACEBOOK]: "-f flv",
    [Protocol.TWITCH]: "-f flv",
    [Protocol.CUSTOM]: "-f flv",
    [Protocol.HLS]:
      "-f hls -hls_time 4 -hls_list_size 5 -hls_flags delete_segments",
    [Protocol.DASH]:
      "-f dash -window_size 5 -extra_window_size 5 -use_template 1 -use_timeline 1",
    [Protocol.RECORDING]: "",
  };

  const recordingOverride = nonDecklinkDests.find(
    (destination) =>
      destination.protocol === Protocol.RECORDING && destination.recording,
  );
  const sharedVideoFlags = profile
    ? buildVideoFlags(profile, recordingOverride)
    : "";
  const sharedAudioFlags = profile ? buildAudioFlags(profile) : "";
  const recordingFlags = recordingOverride
    ? recordingOutputFlags(recordingOverride)
    : "";

  const hasHls = nonDecklinkDests.some((d) => d.protocol === Protocol.HLS);
  const slug = sanitizeName(channel.name);
  const hlsPreviewTee = `[f=hls:hls_time=2:hls_list_size=4:hls_flags=delete_segments]${teeEscape(`media/hls/${slug}/index.m3u8`)}`;

  // If ONLY DeckLink destinations (no other outputs)
  if (nonDecklinkDests.length === 0 && decklinkDests.length > 0) {
    const dk = decklinkDests[0];
    const dkFlags = buildDecklinkOutputFlags(dk, profile);
    return `${youtubePrefix}ffmpeg -hide_banner -loglevel info ${inputFlags} ${mapOptions.join(" ")} ${dkFlags}`
      .replace(/\s+/g, " ")
      .trim();
  }

  // Build the base command for non-DeckLink destinations
  let baseCommand = "";

  if (nonDecklinkDests.length === 1 && hasHls && decklinkDests.length === 0) {
    // Single HLS destination, no DeckLink — simple direct output
    const destination = nonDecklinkDests[0];
    const url = `media/hls/${slug}/index.m3u8`;
    baseCommand = `${youtubePrefix}ffmpeg -hide_banner -ignore_unknown ${inputFlags} ${mapOptions.join(" ")} ${sharedVideoFlags} ${sharedAudioFlags} ${recordingFlags} ${outputFormatOptions[destination.protocol] || ""} ${quote(url)}`;
  } else if (nonDecklinkDests.length > 0) {
    // Multiple non-DeckLink destinations — use tee muxer
    const teeOutputs = nonDecklinkDests
      .flatMap((destination) =>
        teeDestination(destination, channel.name, settings),
      )
      .filter(Boolean);
    if (!hasHls) {
      teeOutputs.push(hlsPreviewTee);
    }
    const teeSpec = teeOutputs.join("|");
    baseCommand = `${youtubePrefix}ffmpeg -hide_banner -ignore_unknown ${inputFlags} ${mapOptions.join(" ")} ${sharedVideoFlags} ${sharedAudioFlags} ${recordingFlags} -f tee ${quote(teeSpec)}`;
  } else {
    // No non-DeckLink destinations, just the default HLS preview
    baseCommand = `${youtubePrefix}ffmpeg -hide_banner -ignore_unknown ${inputFlags} ${mapOptions.join(" ")} ${sharedVideoFlags} ${sharedAudioFlags} ${recordingFlags} -f hls -hls_time 2 -hls_list_size 4 -hls_flags delete_segments ${quote(`media/hls/${slug}/index.m3u8`)}`;
  }

  // Append DeckLink output(s) to the command
  if (decklinkDests.length > 0) {
    for (const dk of decklinkDests) {
      baseCommand += ` -map 0:v:0 -map 0:a:0? ${buildDecklinkOutputFlags(dk, profile)}`;
    }
  }

  return baseCommand.replace(/\s+/g, " ").trim();
};

type PersistentChannel = Omit<
  Channel,
  "status" | "uptime" | "speed" | "speedHistory" | "outputLog"
>;

const channelToPersistentData = (channel: Channel): PersistentChannel => {
  const {
    status,
    uptime,
    speed,
    speedHistory,
    outputLog,
    ...persistentChannel
  } = channel;
  return persistentChannel;
};

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case "HYDRATE_STATE":
      return {
        ...state,
        ...action.payload,
        profiles: action.payload.profiles?.length
          ? action.payload.profiles
          : DEFAULT_PROFILES,
        channels: (action.payload.channels || []).map((c) => ({
          ...c,
          status:
            c.status === ChannelStatus.Running
              ? ChannelStatus.Running
              : ChannelStatus.Stopped,
          uptime: 0,
          speed: 0,
          speedHistory: [],
          outputLog: [],
        })),
      };
    case "ADD_CHANNEL":
      return { ...state, channels: [action.payload, ...state.channels] };
    case "UPDATE_CHANNEL":
      return {
        ...state,
        channels: state.channels.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c,
        ),
      };
    case "REMOVE_CHANNEL":
      return {
        ...state,
        channels: state.channels.filter((c) => c.id !== action.payload.id),
      };
    case "CLEAR_CHANNELS":
      return { ...state, channels: [] };
    case "START_CHANNEL":
      return {
        ...state,
        channels: state.channels.map((c) =>
          c.id === action.payload.id
            ? {
                ...c,
                status: ChannelStatus.Running,
                uptime: 0,
                speed: 0,
                speedHistory: [],
                outputLog: ["[INFO] Starting ffmpeg..."],
              }
            : c,
        ),
      };
    case "STOP_CHANNEL":
      return {
        ...state,
        channels: state.channels.map((c) =>
          c.id === action.payload.id
            ? {
                ...c,
                status: ChannelStatus.Stopped,
                speed: 0,
                outputLog: [...c.outputLog, "[INFO] Stream stopped."],
              }
            : c,
        ),
      };
    case "UPDATE_CHANNEL_STATS":
      return {
        ...state,
        channels: state.channels.map((c) =>
          c.id === action.payload.id
            ? {
                ...c,
                uptime: action.payload.uptime,
                speed: action.payload.speed,
                outputLog: [...c.outputLog.slice(-100), action.payload.log],
                speedHistory: [
                  ...c.speedHistory.slice(-100),
                  { time: Date.now(), speed: action.payload.speed },
                ],
              }
            : c,
        ),
      };
    case "ADD_PROFILE":
      return { ...state, profiles: [...state.profiles, action.payload] };
    case "UPDATE_PROFILE":
      return {
        ...state,
        profiles: state.profiles.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
      };
    case "REMOVE_PROFILE":
      return {
        ...state,
        profiles: state.profiles.filter((p) => p.id !== action.payload.id),
      };
    case "SET_SETTINGS":
      return { ...state, settings: action.payload };
    case "SET_LICENSE":
      return { ...state, license: action.payload };
    case "UPDATE_INGEST_STATS":
      return { ...state, ingestStreams: action.payload };
    case "UPDATE_INGEST_HISTORY":
      return { ...state, ingestHistory: action.payload };
    case "UPDATE_RECORDINGS_LIST":
      return { ...state, recordings: action.payload };
    default:
      return state;
  }
};

const useEngine = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isHydrated, setIsHydrated] = useState(false);
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem("kte-auth-token"),
    user: null,
    license: unlicensedLicense,
  }));
  const [isAuthChecking, setIsAuthChecking] = useState(
    () => Boolean(localStorage.getItem("kte-auth-token")),
  );
  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    }),
    [auth.token],
  );

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403 && body.license) {
          const license = body.license as LicenseInfo;
          setAuth((previous) => ({ ...previous, license }));
          dispatch({ type: "SET_LICENSE", payload: license });
        }
        const error = new Error(
          body.error || `Request failed: ${response.status}`,
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      if (body.success === false)
        throw new Error(
          body.error || "The server could not complete the request",
        );
      return body;
    },
    [headers],
  );

  const hydrate = useCallback(async () => {
    if (!auth.token) {
      setIsAuthChecking(false);
      return;
    }
    try {
      const me = await api("/api/auth/me");
      setAuth((prev) => ({ ...prev, user: me.user, license: me.license }));
      setIsHydrated(true);
      if (me.license?.status === "activated") {
        const payload = await api("/api/state");
        dispatch({ type: "HYDRATE_STATE", payload });
      }
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        localStorage.removeItem("kte-auth-token");
        setAuth({ token: null, user: null, license: unlicensedLicense });
        setIsHydrated(false);
      } else {
        setIsHydrated(true);
      }
    } finally {
      setIsAuthChecking(false);
    }
  }, [api, auth.token]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let cancelled = false;
    const refreshLicense = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/license/status`, {
          cache: "no-store",
        });
        const license = await response.json();
        if (!cancelled && license?.status) {
          setAuth((previous) => ({ ...previous, license }));
          dispatch({ type: "SET_LICENSE", payload: license });
        }
      } catch {}
    };
    void refreshLicense();
    const timer = window.setInterval(refreshLicense, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const previousLicenseStatus = useRef(auth.license.status);
  useEffect(() => {
    const previous = previousLicenseStatus.current;
    previousLicenseStatus.current = auth.license.status;
    if (
      auth.token &&
      !isAuthChecking &&
      previous !== "activated" &&
      auth.license.status === "activated"
    )
      void hydrate();
  }, [auth.license.status, auth.token, hydrate, isAuthChecking]);

  useEffect(() => {
    if (!isHydrated) return;
    return subscribeRealtime((message) => {
      if (message.type === "license_state") {
        const license = message.payload as LicenseInfo;
        setAuth((previous) => ({ ...previous, license }));
        dispatch({ type: "SET_LICENSE", payload: license });
        if (
          [
            "unlicensed",
            "expired",
            "suspended",
            "revoked",
            "client_banned",
            "hardware_mismatch",
          ].includes(license.status)
        ) {
          toast.error(
            license.reason ||
              "Secure license validation was lost. Licensed operations have been stopped.",
            { duration: 8000 },
          );
        }
        return;
      }
      if (message.type === "storage_critical_stop") {
        toast.error(
          message.payload?.message ||
            "CRITICAL: Harddisk reached capacity deadline (<5% free). All recordings were stopped to protect disk.",
          { duration: 9000 },
        );
        return;
      }
      if (message.type === "ingest_stats") {
        dispatch({ type: "UPDATE_INGEST_STATS", payload: message.payload });
        return;
      }
      if (message.type === "ingest_history") {
        dispatch({ type: "UPDATE_INGEST_HISTORY", payload: message.payload });
        return;
      }
      if (message.type === "recordings_list") {
        dispatch({ type: "UPDATE_RECORDINGS_LIST", payload: message.payload });
        return;
      }
      if (message.type !== "stats") return;
      const { channelId, payload } = message;
      dispatch({
        type: "UPDATE_CHANNEL_STATS",
        payload: {
          id: channelId,
          uptime: payload.uptime || 0,
          speed: payload.speed || 0,
          log: payload.log || "",
        },
      });
      if (payload.status === "stopped")
        dispatch({ type: "STOP_CHANNEL", payload: { id: channelId } });
    });
  }, [isHydrated]);

  const persistChannel = useCallback(
    async (channel: Channel) => {
      setSaveStatus("saving");
      await api(`/api/channels/${channel.id}`, {
        method: "PUT",
        body: JSON.stringify(channelToPersistentData(channel)),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
    },
    [api],
  );

  const login = useCallback(async (username: string, password: string) => {
    const payload = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const text = await res.text();
      let body: any = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {}
      if (!res.ok)
        throw new Error(body.error || `Login failed (${res.status})`);
      return body;
    });
    localStorage.setItem("kte-auth-token", payload.token);
    setAuth({
      token: payload.token,
      user: payload.user,
      license: payload.license,
    });
    setIsAuthChecking(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("kte-auth-token");
    setAuth({ token: null, user: null, license: unlicensedLicense });
    setIsHydrated(false);
    setIsAuthChecking(false);
  }, []);

  const activateLicense = useCallback(
    async (licenseKey: string) => {
      const license = await api("/api/license/activate", {
        method: "POST",
        body: JSON.stringify({ licenseKey }),
      });
      setAuth((prev) => ({ ...prev, license }));
      dispatch({ type: "SET_LICENSE", payload: license });
      return license;
    },
    [api],
  );

  const resetLicense = useCallback(async () => {
    const license = await api("/api/license/activate", { method: "DELETE" });
    setAuth((prev) => ({ ...prev, license }));
    dispatch({ type: "SET_LICENSE", payload: license });
    return license;
  }, [api]);

  const fetchIngestStreams = useCallback(async () => {
    const payload = await api("/api/ingest/streams", { method: "GET" });
    dispatch({ type: "UPDATE_INGEST_STATS", payload: payload.streams || {} });
    return payload;
  }, [api]);
  const fetchIngestHistory = useCallback(async () => {
    const payload = await api("/api/ingest/history", { method: "GET" });
    dispatch({ type: "UPDATE_INGEST_HISTORY", payload: payload.history || [] });
    return payload;
  }, [api]);
  const fetchIngestProcesses = useCallback(
    () => api("/api/ingest/processes", { method: "GET" }),
    [api],
  );
  const startSrtListener = useCallback(
    async (port: number, streamName: string) => {
      if (auth.license?.status === "expired") {
        toast.error(
          "Cannot start SRT listener: License has expired. Please activate a valid license.",
        );
        throw new Error("License expired");
      }
      if (auth.license?.status !== "activated") {
        toast.error(
          "Cannot start SRT listener: secure online license validation is required.",
        );
        throw new Error("Secure license required");
      }
      return api("/api/ingest/srt/start", {
        method: "POST",
        body: JSON.stringify({ port, streamName }),
      });
    },
    [api, auth.license],
  );
  const startRtmpRelay = useCallback(
    async (streamPath: string, destinationUrl: string) => {
      if (auth.license?.status === "expired") {
        toast.error(
          "Cannot start RTMP relay: License has expired. Please activate a valid license.",
        );
        throw new Error("License expired");
      }
      if (auth.license?.status !== "activated") {
        toast.error(
          "Cannot start RTMP relay: secure online license validation is required.",
        );
        throw new Error("Secure license required");
      }
      return api("/api/ingest/relay/start", {
        method: "POST",
        body: JSON.stringify({ streamPath, destinationUrl }),
      });
    },
    [api, auth.license],
  );
  const stopIngestProcess = useCallback(
    (id: string) => api(`/api/ingest/processes/${id}`, { method: "DELETE" }),
    [api],
  );

  const fetchRecordings = useCallback(async () => {
    const payload = await api("/api/ingest/recordings", { method: "GET" });
    dispatch({
      type: "UPDATE_RECORDINGS_LIST",
      payload: payload.recordings || [],
    });
    return payload;
  }, [api]);
  const startRecording = useCallback(
    async (
      appName: string,
      stream: string,
      options?: Partial<IngestRecordingOptions>,
    ) => {
      if (auth.license?.status === "expired") {
        toast.error(
          "Cannot start recording: License has expired. Please activate a valid license.",
        );
        throw new Error("License expired");
      }
      if (auth.license?.status !== "activated") {
        toast.error(
          "Cannot start recording: secure online license validation is required.",
        );
        throw new Error("Secure license required");
      }
      try {
        const payload = await api("/api/ingest/record/start", {
          method: "POST",
          body: JSON.stringify({ app: appName, stream, ...options }),
        });
        await Promise.all([fetchIngestStreams(), fetchRecordings()]);
        return payload;
      } catch (err: any) {
        if (
          err.message &&
          (err.message.includes("Storage disk") ||
            err.message.includes("deadline") ||
            err.message.includes("reserve"))
        ) {
          toast.error(`Recording Blocked: ${err.message}`, { duration: 8000 });
        }
        throw err;
      }
    },
    [api, auth.license, fetchIngestStreams, fetchRecordings],
  );
  const stopRecording = useCallback(
    async (appName: string, stream: string) => {
      const payload = await api("/api/ingest/record/stop", {
        method: "POST",
        body: JSON.stringify({ app: appName, stream }),
      });
      await Promise.all([fetchIngestStreams(), fetchRecordings()]);
      return payload;
    },
    [api, fetchIngestStreams, fetchRecordings],
  );
  const deleteRecording = useCallback(
    async (id: number | string) => {
      const payload = await api(`/api/ingest/recordings/${id}`, {
        method: "DELETE",
      });
      await Promise.all([fetchIngestStreams(), fetchRecordings()]);
      return payload;
    },
    [api, fetchIngestStreams, fetchRecordings],
  );

  const changeAccount = useCallback(
    async (payload: {
      username: string;
      currentPassword: string;
      newPassword?: string;
    }) => {
      const next = await api("/api/auth/account", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      localStorage.setItem("kte-auth-token", next.token);
      setAuth((prev) => ({ ...prev, token: next.token, user: next.user }));
      return next;
    },
    [api],
  );

  const updateSettings = useCallback(
    async (settings: AppSettings) => {
      const next = await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      dispatch({ type: "SET_SETTINGS", payload: next });
      return next;
    },
    [api],
  );

  const addChannel = useCallback(
    async (
      channelData: Omit<
        Channel,
        | "id"
        | "command"
        | "status"
        | "uptime"
        | "speed"
        | "speedHistory"
        | "outputLog"
      >,
    ) => {
      const id = uniqueId();
      const profile = state.profiles.find(
        (p) => p.id === channelData.profileId,
      );
      const baseChannel: Omit<Channel, "command"> = {
        ...channelData,
        id,
        status: ChannelStatus.Stopped,
        uptime: 0,
        speed: 0,
        speedHistory: [],
        outputLog: [],
      };
      const channel: Channel = {
        ...baseChannel,
        command: generateCommand(baseChannel, profile, state.settings),
      };
      dispatch({ type: "ADD_CHANNEL", payload: channel });
      await persistChannel(channel);
    },
    [persistChannel, state.profiles, state.settings],
  );

  const updateChannel = useCallback(
    async (channelData: Partial<Channel> & { id: string }) => {
      const existing = state.channels.find((c) => c.id === channelData.id);
      if (!existing) return;
      const nextData = { ...existing, ...channelData };
      const profile = state.profiles.find((p) => p.id === nextData.profileId);
      const next = {
        ...nextData,
        command: generateCommand(nextData, profile, state.settings),
      };
      dispatch({ type: "UPDATE_CHANNEL", payload: next });
      await persistChannel(next);
    },
    [persistChannel, state.channels, state.profiles, state.settings],
  );

  const removeChannel = useCallback(
    async (id: string) => {
      try {
        await api("/api/channels/stop", {
          method: "POST",
          body: JSON.stringify({ channelId: id }),
        });
      } catch {}
      await api(`/api/channels/${id}`, { method: "DELETE" });
      dispatch({ type: "REMOVE_CHANNEL", payload: { id } });
    },
    [api],
  );

  const clearChannels = useCallback(async () => {
    await api("/api/channels", { method: "DELETE" });
    dispatch({ type: "CLEAR_CHANNELS" });
  }, [api]);

  const startChannel = useCallback(
    async (id: string) => {
      const channel = state.channels.find((c) => c.id === id);
      if (!channel) return;
      if (auth.license?.status === "expired") {
        toast.error(
          `Cannot start "${channel.name}": License has expired. Please activate a valid license.`,
        );
        throw new Error("License expired");
      }
      if (auth.license?.status !== "activated") {
        toast.error(
          `Cannot start "${channel.name}": secure online license validation is required.`,
        );
        throw new Error("Secure license required");
      }
      const profile = state.profiles.find((p) => p.id === channel.profileId);
      const command = generateCommand(channel, profile, state.settings);

      // Save channel and generated command to database before sending start request
      try {
        await persistChannel({ ...channel, command });
        if (command !== channel.command) {
          dispatch({
            type: "UPDATE_CHANNEL",
            payload: { id: channel.id, command },
          });
        }
      } catch (persistErr) {
        console.warn("Persist channel before start warning:", persistErr);
      }

      try {
        await api("/api/channels/start", {
          method: "POST",
          body: JSON.stringify({
            channelId: channel.id,
            streamName: sanitizeName(channel.name),
          }),
        });
        dispatch({ type: "START_CHANNEL", payload: { id } });
        toast.success(`Started channel: ${channel.name}`);
      } catch (error) {
        toast.error(
          `Failed to start "${channel.name}": ${(error as Error).message}`,
        );
        throw error;
      }
    },
    [
      api,
      auth.license,
      persistChannel,
      state.channels,
      state.profiles,
      state.settings,
    ],
  );

  const stopChannel = useCallback(
    async (id: string) => {
      await api("/api/channels/stop", {
        method: "POST",
        body: JSON.stringify({ channelId: id }),
      });
      dispatch({ type: "STOP_CHANNEL", payload: { id } });
    },
    [api],
  );

  const startAllChannels = useCallback(async () => {
    if (auth.license?.status === "expired") {
      toast.error(
        "Cannot start streams: License has expired. Please activate a valid license.",
      );
      return;
    }
    if (auth.license?.status !== "activated") {
      toast.error(
        "Cannot start streams: secure online license validation is required.",
      );
      return;
    }
    for (const channel of state.channels.filter(
      (c) => c.status !== ChannelStatus.Running,
    )) {
      try {
        await startChannel(channel.id);
      } catch {}
    }
  }, [auth.license, startChannel, state.channels]);

  const stopAllChannels = useCallback(async () => {
    await Promise.all(
      state.channels
        .filter((c) => c.status === ChannelStatus.Running)
        .map((c) => stopChannel(c.id).catch(() => undefined)),
    );
  }, [state.channels, stopChannel]);

  const addProfile = useCallback(
    async (profileData: Omit<TranscodingProfile, "id">) => {
      const profile = { ...profileData, id: uniqueId() };
      dispatch({ type: "ADD_PROFILE", payload: profile });
      await api(`/api/profiles/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify(profile),
      });
    },
    [api],
  );

  const updateProfile = useCallback(
    async (profile: TranscodingProfile) => {
      dispatch({ type: "UPDATE_PROFILE", payload: profile });
      await api(`/api/profiles/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify(profile),
      });
    },
    [api],
  );

  const removeProfile = useCallback(
    async (id: string) => {
      dispatch({ type: "REMOVE_PROFILE", payload: { id } });
      await api(`/api/profiles/${id}`, { method: "DELETE" });
    },
    [api],
  );

  const getTsPrograms = useCallback(
    async (input: string): Promise<any[]> => {
      if (!input) return [];
      return api("/api/ffprobe-ts-programs", {
        method: "POST",
        body: JSON.stringify({ input }),
      });
    },
    [api],
  );

  return {
    state,
    auth,
    saveStatus,
    isHydrated,
    isAuthChecking,
    login,
    logout,
    activateLicense,
    resetLicense,
    changeAccount,
    updateSettings,
    addChannel,
    updateChannel,
    removeChannel,
    startChannel,
    stopChannel,
    clearChannels,
    addProfile,
    updateProfile,
    removeProfile,
    getTsPrograms,
    startAllChannels,
    stopAllChannels,
    fetchIngestStreams,
    fetchIngestHistory,
    fetchIngestProcesses,
    startSrtListener,
    startRtmpRelay,
    stopIngestProcess,
    fetchRecordings,
    startRecording,
    stopRecording,
    deleteRecording,
    api,
    ingestStreams: state.ingestStreams,
    ingestHistory: state.ingestHistory,
    recordings: state.recordings,
  };
};

export default useEngine;
