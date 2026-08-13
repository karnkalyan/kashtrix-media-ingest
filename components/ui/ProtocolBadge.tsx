import React from 'react';

export type ProtocolType = 'hls' | 'dash' | 'rtmp' | 'srt' | 'udp' | 'http_ts' | 'youtube' | 'facebook' | 'recording' | 'file' | string;

interface ProtocolBadgeProps {
  protocol: ProtocolType;
  className?: string;
  size?: 'sm' | 'md';
}

export const ProtocolBadge: React.FC<ProtocolBadgeProps> = ({ protocol, className = '', size = 'md' }) => {
  const norm = String(protocol || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let label = String(protocol || '').toUpperCase();
  let styleClass = 'bg-[#F4EEFF] text-[#4A1B7A] border-[#D8C6E8]';

  if (norm.includes('mp4') || norm === 'file' || norm === 'recording') {
    label = 'MP4';
    styleClass = 'bg-violet-50 text-violet-700 border-violet-200';
  } else if (norm.includes('mkv')) {
    label = 'MKV';
    styleClass = 'bg-pink-50 text-pink-700 border-pink-200';
  } else if (norm.includes('mov')) {
    label = 'MOV';
    styleClass = 'bg-cyan-50 text-cyan-700 border-cyan-200';
  } else if (norm.includes('ts')) {
    label = 'TS';
    styleClass = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (norm.includes('flv')) {
    label = 'FLV';
    styleClass = 'bg-orange-50 text-orange-700 border-orange-200';
  } else if (norm.includes('hls')) {
    label = 'HLS';
    styleClass = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (norm.includes('dash')) {
    label = 'DASH';
    styleClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
  } else if (norm.includes('rtmp')) {
    label = 'RTMP';
    styleClass = 'bg-purple-50 text-purple-700 border-purple-200';
  } else if (norm.includes('srt')) {
    label = 'SRT';
    styleClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (norm.includes('udp')) {
    label = 'UDP';
    styleClass = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (norm.includes('youtube')) {
    label = 'YouTube';
    styleClass = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (norm.includes('facebook')) {
    label = 'Facebook';
    styleClass = 'bg-blue-50 text-blue-800 border-blue-300';
  }

  return (
    <span
      className={`inline-flex items-center rounded-md border font-mono font-bold uppercase tracking-wider ${
        size === 'sm' ? 'px-1.5 py-0.2 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${styleClass} ${className}`}
    >
      {label}
    </span>
  );
};

export default ProtocolBadge;
