import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Disc, Pause } from 'lucide-react';

const getStartTime = (recording: any): number => {
  if (!recording) return 0;
  const raw = recording.startTime || recording.start_time || recording.started_at || recording.created_at;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw > 1e11 ? raw : raw * 1000;
  }
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const formatElapsed = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  return [hours, minutes, remainingSeconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
};

interface RecordingElapsedTimerProps {
  recordings?: any[];
  title?: string;
  compact?: boolean;
}

const RecordingElapsedTimer: React.FC<RecordingElapsedTimerProps> = ({
  recordings = [],
  title = 'Recording Timer & Details',
  compact = false,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const activeRecordings = useMemo(
    () => recordings.filter(recording => recording && recording.is_active !== false && getStartTime(recording) > 0),
    [recordings],
  );

  useEffect(() => {
    setNow(Date.now());
    if (activeRecordings.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [activeRecordings.length]);

  const primary = activeRecordings.reduce<any | null>((oldest, recording) => {
    if (!oldest) return recording;
    return getStartTime(recording) < getStartTime(oldest) ? recording : oldest;
  }, null);

  const isPaused = Boolean(primary?.is_paused || primary?.isPaused);
  const rawPauseStartedAt = primary?.pause_started_at ?? primary?.pauseStartedAt;
  const parsedPauseStartedAt = typeof rawPauseStartedAt === 'number'
    ? rawPauseStartedAt
    : rawPauseStartedAt ? new Date(rawPauseStartedAt).getTime() : 0;
  const totalPausedMs = Math.max(0, Number(primary?.total_paused_ms ?? primary?.totalPausedMs) || 0);
  const currentPauseMs = isPaused && Number.isFinite(parsedPauseStartedAt) && parsedPauseStartedAt > 0
    ? Math.max(0, now - parsedPauseStartedAt)
    : 0;
  const elapsed = primary
    ? Math.max(0, (now - getStartTime(primary) - totalPausedMs - currentPauseMs) / 1000)
    : 0;
  const format = String(primary?.format || primary?.profile?.extension || primary?.file_name?.split('.').pop() || 'MP4').toUpperCase();
  const encoder = primary?.encoder || primary?.profile?.videoCodec || 'Hardware';
  const bitrate = primary?.video_bitrate || primary?.videoBitrate || primary?.profile?.videoBitrate || '20 Mbps';
  const formattedBitrate = typeof bitrate === 'number'
    ? `${Math.round(bitrate >= 1000 ? bitrate / 1000 : bitrate)} Mbps`
    : String(bitrate);
  const size = Number(primary?.size || 0);
  const formattedSize = size > 0
    ? `${(size / (1024 ** (size >= 1024 ** 3 ? 3 : size >= 1024 ** 2 ? 2 : 1))).toFixed(1)} ${size >= 1024 ** 3 ? 'GB' : size >= 1024 ** 2 ? 'MB' : 'KB'}`
    : (primary ? 'Capturing…' : '0.0 MB');

  return (
    <section
      className={`w-full rounded-2xl border p-3.5 sm:p-4 transition-all ${
        primary
          ? 'border-rose-300 bg-gradient-to-br from-rose-50/90 via-white to-rose-50/60 shadow-sm dark:border-rose-900/70 dark:from-[#260D20] dark:via-[#1E1130] dark:to-[#260D20]'
          : 'border-[#E8DFF0] bg-white dark:border-[#371F59] dark:bg-[#1E1130]'
      }`}
    >
      <div className="flex flex-col gap-3 min-w-0">
        {/* Header and Live Digital Clock Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform ${
                primary
                  ? 'bg-rose-600 text-white shadow-sm ring-4 ring-rose-500/20 animate-pulse'
                  : 'bg-slate-100 text-slate-500 dark:bg-[#2A1744] dark:text-[#B9A5CD]'
              }`}
            >
              {primary
                ? isPaused
                  ? <Pause size={20} className="fill-current" />
                  : <Disc size={20} className="animate-spin" style={{ animationDuration: '3s' }} />
                : <Clock3 size={20} />}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-[11px] sm:text-[12px] font-extrabold uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100 truncate">
                  {title}
                </h2>
                {primary ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ring-1 ${isPaused
                    ? 'bg-amber-100 text-amber-800 ring-amber-500/30 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-rose-100 text-rose-700 ring-rose-500/30 dark:bg-rose-950 dark:text-rose-300'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isPaused ? 'bg-amber-600' : 'bg-rose-600 animate-ping'}`} />
                    {isPaused ? 'PAUSED' : 'LIVE'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:bg-[#2A1744] dark:text-[#B9A5CD]">
                    STANDBY
                  </span>
                )}
                {activeRecordings.length > 1 && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    {activeRecordings.length} active
                  </span>
                )}
              </div>
              <p
                className="mt-0.5 truncate text-[11px] font-medium text-slate-500 dark:text-[#B9A5CD]"
                title={
                  primary
                    ? (primary.fileName || primary.file_name || (primary.app && primary.stream ? `${primary.app}/${primary.stream}` : primary.stream) || 'Recording in progress')
                    : 'No recording is currently active'
                }
              >
                {primary
                  ? (primary.fileName || primary.file_name || (primary.app && primary.stream ? `${primary.app}/${primary.stream}` : primary.stream) || 'Recording in progress')
                  : 'Ready to capture device or ingest stream'}
              </p>
            </div>
          </div>

          {/* High-visibility Digital Clock Badge */}
          <div className="shrink-0 flex items-center justify-end">
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono font-black tabular-nums tracking-[0.06em] shadow-xs ${
                primary
                  ? 'bg-rose-600 text-white dark:bg-rose-600 dark:text-white ring-2 ring-rose-500/30'
                  : 'bg-slate-100 text-slate-400 dark:bg-[#25163C] dark:text-slate-500'
              }`}
            >
              {primary && <span className="h-2 w-2 rounded-full bg-white animate-ping shrink-0" />}
              <time
                className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px] md:text-[32px]'} leading-none`}
                dateTime={`PT${Math.floor(elapsed)}S`}
              >
                {formatElapsed(elapsed)}
              </time>
            </div>
          </div>
        </div>

        {/* Telemetry Metrics 4-Box Grid */}
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200/80 pt-2.5 sm:grid-cols-4 dark:border-[#371F59]/80">
          <div className="rounded-lg bg-slate-50/70 p-2 dark:bg-[#25163C]/50">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-[#8E78A6]">Format</span>
            <strong className="font-mono text-[11px] font-bold text-slate-800 dark:text-white truncate block">
              {format || 'MP4'}
            </strong>
          </div>
          <div className="rounded-lg bg-slate-50/70 p-2 dark:bg-[#25163C]/50">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-[#8E78A6]">Encoder</span>
            <strong className="font-mono text-[11px] font-bold text-slate-800 dark:text-white truncate block">
              {encoder || 'Auto'}
            </strong>
          </div>
          <div className="rounded-lg bg-slate-50/70 p-2 dark:bg-[#25163C]/50">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-[#8E78A6]">Video Rate</span>
            <strong className="font-mono text-[11px] font-bold text-slate-800 dark:text-white truncate block">
              {formattedBitrate}
            </strong>
          </div>
          <div className="rounded-lg bg-slate-50/70 p-2 dark:bg-[#25163C]/50">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-[#8E78A6]">Current Size</span>
            <strong className="font-mono text-[11px] font-bold text-slate-800 dark:text-white truncate block">
              {formattedSize}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RecordingElapsedTimer;
