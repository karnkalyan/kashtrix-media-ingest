import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { subscribeRealtime } from '../../services/realtime';
import {
  FiPlay,
  FiPause,
  FiVolume2,
  FiVolumeX,
  FiMaximize,
  FiMinimize,
  FiRefreshCw,
  FiActivity,
  FiAlertCircle,
  FiTv,
  FiRadio
} from 'react-icons/fi';

export interface KashtrixMediaPlayerProps {
  src?: string;
  title?: string;
  poster?: string;
  isLive?: boolean;
  autoPlay?: boolean;
  maxHeight?: number | string;
  aspectRatio?: string;
  className?: string;
  showAudioMeter?: boolean;
  showInfoPill?: boolean;
  resolution?: string;
  framerate?: string | number;
  hasSignal?: boolean;
  signalLabel?: string;
  isRecording?: boolean;
  onRefresh?: () => void;
  onResolutionDetected?: (resolution: string, framerate: string) => void;
}

export const KashtrixMediaPlayer: React.FC<KashtrixMediaPlayerProps> = ({
  src,
  title = 'Live Broadcast Stream',
  poster,
  isLive = true,
  autoPlay = true,
  maxHeight,
  aspectRatio = 'aspect-video',
  className = '',
  showAudioMeter = true,
  showInfoPill = true,
  resolution: externalResolution,
  framerate: externalFramerate,
  hasSignal,
  signalLabel,
  isRecording = false,
  onRefresh,
  onResolutionDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const leftAnalyserRef = useRef<AnalyserNode | null>(null);
  const rightAnalyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedResolution, setDetectedResolution] = useState('');
  const [detectedFramerate, setDetectedFramerate] = useState('');
  const [audioMeterVisible, setAudioMeterVisible] = useState(showAudioMeter);
  const [realtimeRecording, setRealtimeRecording] = useState(false);

  useEffect(() => {
    if (showAudioMeter !== undefined) {
      setAudioMeterVisible(showAudioMeter);
    }
  }, [showAudioMeter]);

  const isLiveStream = isLive !== undefined ? isLive : (src ? src.includes('.m3u8') : false);

  // Audio level meters (0 to 100)
  const [audioLeft, setAudioLeft] = useState(0);
  const [audioRight, setAudioRight] = useState(0);
  const [audioPeak, setAudioPeak] = useState(false);

  const onResolutionDetectedRef = useRef(onResolutionDetected);
  onResolutionDetectedRef.current = onResolutionDetected;

  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  // Listen to realtime WebSocket messages for active recordings
  useEffect(() => {
    const checkIsRecording = (activeList?: any[], streamsObj?: any, devPreview?: any) => {
      const cleanTitle = (title || '').toLowerCase().trim();
      const cleanSrc = (src || '').toLowerCase().trim();

      // Check device preview state if this player is playing a device capture preview
      if (cleanSrc.includes('/device-preview/') || cleanTitle.includes('decklink') || cleanTitle.includes('capture') || cleanTitle.includes('received signal')) {
        if (devPreview?.isRecording) return true;
        if (activeList?.some((r: any) => r.sourceType === 'device' || r.app === 'device' || (r.stream && cleanTitle.includes(r.stream.toLowerCase())))) {
          return true;
        }
      }

      // Check active recordings list from dashboard overview / server broadcasts
      if (Array.isArray(activeList) && activeList.length > 0) {
        const matched = activeList.some((rec: any) => {
          const recStream = String(rec.stream || '').toLowerCase();
          const recApp = String(rec.app || '').toLowerCase();
          const recKey = `${recApp}/${recStream}`;
          return (
            (recStream && cleanTitle.includes(recStream)) ||
            (cleanTitle && recStream.includes(cleanTitle)) ||
            (recKey && cleanSrc.includes(recKey)) ||
            (recStream && cleanSrc.includes(recStream)) ||
            (rec.sourceType === 'device' && (cleanSrc.includes('device-preview') || cleanTitle.includes('decklink') || cleanTitle.includes('capture')))
          );
        });
        if (matched) return true;
      }

      // Check streams object
      if (streamsObj && typeof streamsObj === 'object') {
        for (const [key, val] of Object.entries<any>(streamsObj)) {
          if (val?.isRecording) {
            const streamName = String(val.name || key.split('/')[1] || key).toLowerCase();
            if (cleanTitle.includes(streamName) || cleanSrc.includes(streamName) || cleanSrc.includes(key.toLowerCase())) {
              return true;
            }
          }
        }
      }

      return false;
    };

    const unsubscribe = subscribeRealtime((msg) => {
      if (msg.type === 'recording_started' || msg.type === 'recording_stopped') {
        const payload = msg.payload;
        if (msg.type === 'recording_stopped') {
          setRealtimeRecording(false);
        } else if (msg.type === 'recording_started' && payload) {
          const cleanTitle = (title || '').toLowerCase().trim();
          const cleanSrc = (src || '').toLowerCase().trim();
          const pStream = String(payload.stream || '').toLowerCase();
          const pApp = String(payload.app || '').toLowerCase();
          const pKey = `${pApp}/${pStream}`;
          if (
            (pStream && cleanTitle.includes(pStream)) ||
            (cleanTitle && pStream.includes(cleanTitle)) ||
            (pKey && cleanSrc.includes(pKey)) ||
            (pStream && cleanSrc.includes(pStream)) ||
            (payload.options?.sourceType === 'device' && (cleanSrc.includes('device-preview') || cleanTitle.includes('decklink') || cleanTitle.includes('capture')))
          ) {
            setRealtimeRecording(true);
          }
        }
      }

      if (msg.type === 'device_preview_state' && msg.payload) {
        const cleanSrc = (src || '').toLowerCase().trim();
        const cleanTitle = (title || '').toLowerCase().trim();
        if (cleanSrc.includes('device-preview') || cleanTitle.includes('decklink') || cleanTitle.includes('capture')) {
          if (msg.payload.isRecording !== undefined) {
            setRealtimeRecording(Boolean(msg.payload.isRecording));
          }
        }
      }

      if (msg.type === 'dashboard_overview' && msg.payload) {
        const isRec = checkIsRecording(msg.payload.activeRecordingsList, msg.payload.streams);
        setRealtimeRecording(isRec);
      }

      if (msg.type === 'ingest_stats' && msg.payload) {
        const isRec = checkIsRecording(undefined, msg.payload);
        setRealtimeRecording(isRec);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [src, title]);

  // Update volume and mute without rebuilding audio graph or reloading stream
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = muted ? 0 : volume;
    }
    if (!muted && volume > 0 && audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, [muted, volume]);

  // Setup Web Audio API with stereo separation & continuous meter analysis
  const initAudioAnalyser = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const leftAnalyser = ctx.createAnalyser();
        leftAnalyser.fftSize = 64;
        leftAnalyser.smoothingTimeConstant = 0.6;
        leftAnalyserRef.current = leftAnalyser;

        const rightAnalyser = ctx.createAnalyser();
        rightAnalyser.fftSize = 64;
        rightAnalyser.smoothingTimeConstant = 0.6;
        rightAnalyserRef.current = rightAnalyser;

        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);
        const gainNode = ctx.createGain();
        gainNode.gain.value = muted ? 0 : volume;
        gainNodeRef.current = gainNode;

        if (!sourceNodeRef.current) {
          try {
            sourceNodeRef.current = ctx.createMediaElementSource(video);
          } catch {}
        }

        if (sourceNodeRef.current) {
          sourceNodeRef.current.connect(splitter);
          splitter.connect(leftAnalyser, 0);
          splitter.connect(rightAnalyser, 1 > splitter.numberOfOutputs - 1 ? 0 : 1);

          leftAnalyser.connect(merger, 0, 0);
          rightAnalyser.connect(merger, 0, 1);
          merger.connect(gainNode);
          gainNode.connect(ctx.destination);
        }
      }

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const leftBuffer = new Uint8Array(leftAnalyserRef.current?.frequencyBinCount || 32);
      const rightBuffer = new Uint8Array(rightAnalyserRef.current?.frequencyBinCount || 32);

      const renderMeter = () => {
        if (leftAnalyserRef.current && rightAnalyserRef.current) {
          leftAnalyserRef.current.getByteFrequencyData(leftBuffer);
          rightAnalyserRef.current.getByteFrequencyData(rightBuffer);

          let leftSum = 0;
          let rightSum = 0;
          const count = leftBuffer.length;

          for (let i = 0; i < count; i++) {
            leftSum += leftBuffer[i];
            rightSum += rightBuffer[i];
          }

          const avgLeft = leftSum / (count * 255);
          const avgRight = rightSum / (count * 255);

          // Logarithmic audio perception curve
          const leftPercent = Math.min(100, Math.round(Math.pow(avgLeft, 0.7) * 115));
          const rightPercent = Math.min(100, Math.round(Math.pow(avgRight, 0.7) * 115));

          setAudioLeft(leftPercent);
          setAudioRight(rightPercent);
          setAudioPeak(leftPercent > 92 || rightPercent > 92);
        }

        animationFrameRef.current = requestAnimationFrame(renderMeter);
      };

      animationFrameRef.current = requestAnimationFrame(renderMeter);
    } catch {
      // AudioContext policy handled on user gesture
    }
  }, []);

  const loadStream = useCallback(() => {
    const video = videoRef.current;
    if (!video || !src) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setLoading(false);
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setError(null);
    setLoading(true);

    if (src.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls(isLiveStream ? {
          enableWorker: true,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 6,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          liveDurationInfinity: true,
          highBufferWatchdogPeriod: 1,
          backBufferLength: 0,
          lowLatencyMode: true,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 15,
          maxFragLookUpTolerance: 0.25,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 30,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 30,
          fragLoadingTimeOut: 15000,
          fragLoadingMaxRetry: 30,
        } : {
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 120,
          backBufferLength: 30,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 5,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 6,
          levelLoadingTimeOut: 15000,
          fragLoadingTimeOut: 15000,
          fragLoadingMaxRetry: 6,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRef.current = hls;

        const onPlayingOrCanPlay = () => {
          setLoading(false);
          setError(null);
        };
        video.addEventListener('playing', onPlayingOrCanPlay);
        video.addEventListener('canplay', onPlayingOrCanPlay);
        video.addEventListener('loadeddata', onPlayingOrCanPlay);
        video.addEventListener('timeupdate', onPlayingOrCanPlay);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          initAudioAnalyser();
          if (autoPlayRef.current) {
            video.muted = true;
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          setLoading(false);
          if (autoPlayRef.current && video.paused) {
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
          setLoading(false);
          if (hls.levels?.[0]) {
            const lvl = hls.levels[0];
            let res = '';
            let fps = '';
            if (lvl.width && lvl.height) {
              res = `${lvl.width}x${lvl.height}`;
              setDetectedResolution(res);
            }
            if (lvl.frameRate) {
              fps = `${Math.round(lvl.frameRate)} fps`;
              setDetectedFramerate(fps);
            }
            if (onResolutionDetectedRef.current && (res || fps)) {
              onResolutionDetectedRef.current(res, fps);
            }
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setTimeout(() => {
                if (hlsRef.current) {
                  hlsRef.current.loadSource(src);
                  hlsRef.current.startLoad();
                }
              }, 1000);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setTimeout(() => {
                if (hlsRef.current && videoRef.current) {
                  hlsRef.current.loadSource(src);
                  hlsRef.current.attachMedia(videoRef.current);
                }
              }, 1000);
            }
          } else if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL ||
            data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
          ) {
            if (!isLiveStream) return;
            if (video.buffered.length > 0) {
              const liveEdge = video.buffered.end(video.buffered.length - 1);
              if (Math.abs(video.currentTime - liveEdge) > 1.5) {
                video.currentTime = Math.max(0, liveEdge - 0.2);
              }
            }
            if (video.paused && autoPlayRef.current) {
              video.play().catch(() => {});
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.addEventListener('loadedmetadata', () => {
          setLoading(false);
          initAudioAnalyser();
        });
        if (autoPlayRef.current) video.play().catch(() => {});
      } else {
        setError('HLS playback is not supported by your browser');
      }
    } else {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const onLoaded = () => {
        setLoading(false);
        setError(null);
        initAudioAnalyser();
        if (video.videoWidth && video.videoHeight) {
          const res = `${video.videoWidth}x${video.videoHeight}`;
          setDetectedResolution(res);
          if (onResolutionDetectedRef.current) {
            onResolutionDetectedRef.current(res, '');
          }
        }
      };
      const onErr = () => {
        setError('Unable to load video file (file format unsupported or corrupted)');
        setLoading(false);
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('canplay', onLoaded, { once: true });
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('playing', onLoaded, { once: true });
      video.addEventListener('error', onErr, { once: true });

      video.src = src;
      video.load();
      if (autoPlayRef.current) {
        video.muted = muted;
        video.play().catch(() => {});
      }
    }
  }, [src, initAudioAnalyser, isLiveStream, muted]);

  useEffect(() => {
    loadStream();
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [loadStream]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        initAudioAnalyser();
      }).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextMuted ? 0 : volume;
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    initAudioAnalyser();
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && muted) {
      setMuted(false);
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (newVol > 0 && !muted) ? newVol : 0;
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    initAudioAnalyser();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    loadStream();
  };

  const currentRes = externalResolution || detectedResolution;
  const currentFps = externalFramerate || detectedFramerate;
  const isSignalActive = hasSignal !== undefined ? hasSignal : (!!src && !error);

  return (
    <div
      ref={containerRef}
      onClick={() => {
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      }}
      className={`group relative overflow-hidden bg-[#0E0616] text-white shadow-2xl transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] h-screen w-screen max-h-none rounded-none border-none'
          : `rounded-xl border border-[#3B1F64] ${aspectRatio} ${className}`
      }`}
      style={isFullscreen ? { maxHeight: 'none', width: '100vw', height: '100vh' } : { maxHeight }}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        muted={muted}
        autoPlay={autoPlay}
        crossOrigin="anonymous"
        onLoadedMetadata={e => {
          setLoading(false);
          setError(null);
          const v = e.currentTarget;
          if (v.duration && isFinite(v.duration)) setDuration(v.duration);
          if (v.videoWidth && v.videoHeight) {
            const res = `${v.videoWidth}x${v.videoHeight}`;
            setDetectedResolution(res);
            onResolutionDetected?.(res, detectedFramerate);
          }
          initAudioAnalyser();
        }}
        onLoadedData={() => {
          setLoading(false);
          setError(null);
          initAudioAnalyser();
        }}
        onCanPlay={() => {
          setLoading(false);
          setError(null);
        }}
        onTimeUpdate={e => {
          const v = e.currentTarget;
          setCurrentTime(v.currentTime);
          if (v.duration && isFinite(v.duration)) setDuration(v.duration);
        }}
        onPlay={() => {
          setLoading(false);
          setIsPlaying(true);
          initAudioAnalyser();
        }}
        onPlaying={() => {
          setLoading(false);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        className={`w-full bg-black object-contain ${isFullscreen ? 'h-full max-h-screen' : 'h-full'}`}
        style={isFullscreen ? { maxHeight: '100vh', height: '100vh' } : { maxHeight }}
      />

      {/* Top Header Bar Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent px-3.5 py-2.5 opacity-90 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-2.5 truncate">
          {isLiveStream && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ring-1 ring-red-400/40">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
              LIVE
            </span>
          )}
          {!isLiveStream && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-700/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              ARCHIVE
            </span>
          )}

          {/* Realtime Signal Status Badge (for live) or Storage Status Badge (for archive) */}
          {isLiveStream ? (
            isSignalActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 px-2 py-0.5 text-[10px] font-bold text-emerald-300 shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {signalLabel || 'Received Signal'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 border border-rose-500/50 px-2 py-0.5 text-[10px] font-bold text-rose-300 shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Loss Signal
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 border border-sky-500/50 px-2 py-0.5 text-[10px] font-bold text-sky-300 shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Direct Storage File
            </span>
          )}

          {/* Realtime REC Badge */}
          {(isRecording || realtimeRecording) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 border border-rose-400/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm ring-2 ring-rose-500/30 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-white animate-ping" />
              REC
            </span>
          )}

          <span className="truncate text-xs font-semibold text-white/90 drop-shadow-xs">{title}</span>
        </div>

        <div className="flex items-center gap-2">
          {showInfoPill && (currentRes || currentFps) && (
            <div className="flex items-center gap-1.5 rounded-md bg-purple-950/80 px-2 py-0.5 text-[10px] font-mono font-medium text-purple-200 border border-purple-800/40 shadow-xs">
              {currentRes && <span>{currentRes}</span>}
              {currentRes && currentFps && <span>•</span>}
              {currentFps && <span>{currentFps}</span>}
            </div>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-md bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
            title="Reload video"
          >
            <FiRefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Realtime Stereo Audio Level VU Meter (Right Side - Attached within player) */}
      {audioMeterVisible && (
        <div className="absolute right-2.5 top-11 bottom-11 z-20 flex flex-col items-center justify-between rounded-lg bg-black/85 px-1.5 py-2 border border-[#7C3AED]/30 backdrop-blur-md shadow-2xl pointer-events-none select-none">
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono font-black tracking-wider text-purple-300">AUDIO</span>
            {audioPeak && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />}
          </div>

          <div className="flex items-stretch gap-1 flex-1 my-1">
            {/* Decibel scale labels */}
            <div className="flex flex-col justify-between text-[7px] font-mono text-slate-400 select-none py-0.5 leading-none">
              <span>0dB</span>
              <span>-6</span>
              <span>-12</span>
              <span>-24</span>
              <span>-∞</span>
            </div>

            {/* Left Channel Bar */}
            <div className="relative w-2 h-full bg-slate-950 rounded-xs overflow-hidden flex flex-col-reverse p-[1px] border border-white/10 shadow-inner">
              <div
                className={`w-full rounded-xs transition-all duration-75 ${
                  audioLeft > 85 ? 'bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500' :
                  audioLeft > 60 ? 'bg-gradient-to-t from-emerald-500 to-amber-400' : 'bg-emerald-500'
                }`}
                style={{ height: `${Math.max(3, audioLeft)}%` }}
              />
            </div>

            {/* Right Channel Bar */}
            <div className="relative w-2 h-full bg-slate-950 rounded-xs overflow-hidden flex flex-col-reverse p-[1px] border border-white/10 shadow-inner">
              <div
                className={`w-full rounded-xs transition-all duration-75 ${
                  audioRight > 85 ? 'bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500' :
                  audioRight > 60 ? 'bg-gradient-to-t from-emerald-500 to-amber-400' : 'bg-emerald-500'
                }`}
                style={{ height: `${Math.max(3, audioRight)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between w-full px-0.5 text-[8px] font-mono font-bold text-slate-400">
            <span>L</span>
            <span>R</span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
          <div className="relative flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            <FiTv className="absolute text-purple-300" size={16} />
          </div>
          <p className="mt-3 text-xs font-semibold text-purple-200">
            {isLiveStream ? 'Connecting video stream…' : 'Loading media file…'}
          </p>
        </div>
      )}

      {/* Error / Offline Overlay */}
      {(!src || error) && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#13091F]/90 p-4 text-center backdrop-blur-sm">
          <div className="rounded-full bg-purple-950/80 p-3 ring-1 ring-purple-500/30">
            {error ? <FiAlertCircle size={24} className="text-amber-400" /> : <FiRadio size={24} className="text-purple-400" />}
          </div>
          <p className="mt-3 text-xs font-bold text-white">
            {error ? error : 'No active video feed selected'}
          </p>
          <p className="mt-1 max-w-xs text-[10px] text-slate-300">
            {error ? 'Please verify your source device signal or network ingest.' : 'Click "Preview source" to open live device monitor.'}
          </p>
          {error && (
            <button
              type="button"
              onClick={handleRefresh}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#7C3AED] px-3 py-1.5 text-[11px] font-semibold text-white shadow-md hover:bg-[#6D28D9] transition"
            >
              <FiRefreshCw size={12} /> Retry Connection
            </button>
          )}
        </div>
      )}

      {/* Bottom Glassmorphic Control Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3.5 py-2.5 opacity-90 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-3">
          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-full bg-white/15 p-2 text-white transition hover:bg-[#7C3AED] hover:scale-105 active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <FiPause size={14} /> : <FiPlay size={14} className="ml-0.5" />}
          </button>

          {/* Volume / Mute Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-md p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
              title={muted || volume === 0 ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <FiVolumeX size={15} /> : <FiVolume2 size={15} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-[#7C3AED] bg-white/20 rounded-lg"
              title="Volume"
            />
          </div>
        </div>

        {/* Progress / Timeline Bar (for Recorded VODs) */}
        {!isLiveStream && duration > 0 && (
          <div className="flex items-center gap-2 flex-1 max-w-xs mx-3">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={e => {
                const t = parseFloat(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = t;
                setCurrentTime(t);
              }}
              className="h-1 flex-1 cursor-pointer accent-[#7C3AED] bg-white/25 rounded-lg"
            />
            <span className="text-[9px] font-mono text-slate-300 whitespace-nowrap">
              {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Audio Meter Toggle */}
          <button
            type="button"
            onClick={() => setAudioMeterVisible(!audioMeterVisible)}
            className={`rounded-md p-1.5 transition ${audioMeterVisible ? 'bg-purple-900/60 text-purple-300 ring-1 ring-purple-500/40' : 'text-white/70 hover:bg-white/15 hover:text-white'}`}
            title="Toggle Audio Level Meter"
          >
            <FiActivity size={14} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KashtrixMediaPlayer;
