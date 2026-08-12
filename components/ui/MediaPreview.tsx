import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Volume2, VolumeX, Maximize2, RefreshCw } from 'lucide-react';

interface MediaPreviewProps {
  url?: string;
  poster?: string;
  title?: string;
  aspectRatio?: string;
  maxHeight?: number;
  autoPlay?: boolean;
  className?: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  url,
  poster,
  title = 'Live Stream',
  maxHeight = 360,
  autoPlay = true,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    let hls: Hls | null = null;
    setError(false);
    setLoading(true);

    if (url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          if (autoPlay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setError(true);
            setLoading(false);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          setLoading(false);
          if (autoPlay) video.play().catch(() => {});
        });
      }
    } else {
      video.src = url;
      video.addEventListener('loadeddata', () => setLoading(false));
      video.addEventListener('error', () => {
        setError(true);
        setLoading(false);
      });
      if (autoPlay) video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [url, autoPlay]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[#E8DFF0] bg-black ${className}`}
      style={{ maxHeight }}
    >
      {!url || error ? (
        <div className="flex h-48 w-full flex-col items-center justify-center p-4 text-center text-slate-400">
          <Play size={28} className="opacity-40" />
          <p className="mt-2 text-[12px] font-semibold text-slate-300">
            {error ? 'Stream offline or unreachable' : 'No video source connected'}
          </p>
          <p className="text-[10px] text-slate-500">
            {error ? 'Check encoding pipeline and network output URL' : 'Select an active channel or stream source'}
          </p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            poster={poster}
            muted={muted}
            playsInline
            className="h-full w-full object-contain"
            style={{ maxHeight }}
          />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs">
              <RefreshCw size={22} className="animate-spin text-white opacity-80" />
            </div>
          )}

          {/* Minimal Controls Bar Overlay */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 text-white">
            <span className="truncate text-[11px] font-medium text-slate-200">{title}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="rounded p-1 text-slate-300 hover:bg-white/20 hover:text-white transition-colors"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded p-1 text-slate-300 hover:bg-white/20 hover:text-white transition-colors"
                title="Fullscreen"
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MediaPreview;
