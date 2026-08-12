import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Channel, ChannelStatus, InputType, Protocol, TranscodingProfile, ChannelDestination } from '../types';
import { explainCommand } from '../services/geminiService';
import Button from './ui/Button';
import Card from './ui/Card';
import StatusBadge from './ui/StatusBadge';
import { FiPlay, FiSquare, FiTrash2, FiChevronDown, FiTerminal, FiZap, FiCopy, FiExternalLink } from 'react-icons/fi';

interface Props {
  channel: Channel;
  profile?: TranscodingProfile;
  username?: string;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
}

const inputLabel = {
  [InputType.URL]: 'URL',
  [InputType.VOD]: 'VOD',
  [InputType.DEVICE]: 'Device',
  [InputType.LIVE]: 'Live',
  [InputType.SRT]: 'SRT',
  [InputType.YOUTUBE]: 'YouTube',
};

const ChannelCard: React.FC<Props> = ({ channel, profile, username, onStart, onStop, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [copiedEmbedId, setCopiedEmbedId] = useState('');
  const [embedMode, setEmbedMode] = useState<'player' | 'iframe'>('player');
  const terminalRef = useRef<HTMLDivElement>(null);
  const isRunning = channel.status === ChannelStatus.Running;
  const destinations = channel.destinations?.length
    ? channel.destinations
    : [{ id: 'legacy', name: channel.outputProtocol, protocol: channel.outputProtocol, url: channel.outputUrl }];

  useEffect(() => {
    if (expanded && terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [channel.outputLog, expanded]);

  const uptime = new Date((channel.uptime || 0) * 1000).toISOString().slice(11, 19);

  const getVideoEmbedCode = (destination: ChannelDestination) => {
    const url = destination.playbackUrl || destination.url;
    if (!url || !url.startsWith('http')) return '';

    if (destination.protocol === Protocol.HLS) {
      return `<div id="hls-player-${destination.id}" style="width:100%;max-width:640px;min-height:360px;background:#000"></div>\n<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>\n<script>\n  const videoEl = document.createElement('video');\n  videoEl.controls = true;\n  videoEl.style.width = '100%';\n  videoEl.style.height = '100%';\n  const wrapper = document.getElementById('hls-player-${destination.id}');\n  if (!wrapper) throw new Error('Player element not found');\n  wrapper.appendChild(videoEl);\n  if (Hls.isSupported()) {\n    const hls = new Hls();\n    hls.loadSource('${url}');\n    hls.attachMedia(videoEl);\n  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {\n    videoEl.src = '${url}';\n  }\n<\/script>`;
    }

    const type = destination.protocol === Protocol.DASH ? 'application/dash+xml' : 'video/mp4';
    return `<video controls width="640" height="360"><source src="${url}" type="${type}" />Your browser does not support this player.</video>`;
  };

  const getIframeEmbedCode = (destination: ChannelDestination) => {
    const url = destination.playbackUrl || destination.url;
    if (!url || !url.startsWith('http')) return '';
    const type = destination.protocol === Protocol.HLS ? 'hls' : 'mp4';
    const baseUrl = window.location.origin;
    const iframeSrc = `${baseUrl}/iframe.html?url=${encodeURIComponent(url)}&type=${type}`;
    return `<iframe width="640" height="360" style="border:none;overflow:hidden;max-width:100%;aspect-ratio:16/9;" src="${iframeSrc}" allow="autoplay; fullscreen"></iframe>`;
  };

  const handleCopyEmbed = async (destinationId: string, code: string) => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedEmbedId(destinationId);
    setTimeout(() => setCopiedEmbedId(''), 1500);
    toast.success('Embed code copied');
  };

  const handleExplain = async () => {
    setIsExplaining(true);
    setExplanation(await explainCommand(channel.command));
    setIsExplaining(false);
  };

  return (
    <Card hover className="transition-all">
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <StatusBadge status={isRunning ? 'Running' : channel.status === ChannelStatus.Error ? 'Error' : 'Stopped'} />
              <h3 className="truncate text-base font-extrabold text-[var(--text-primary)]">{channel.name}</h3>
              <span className="rounded-full bg-[var(--surface-muted)] border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                {inputLabel[channel.inputType] || channel.inputType}
              </span>
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-[var(--text-muted)]">{channel.inputUrl}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant={isRunning ? 'danger' : 'success'} onClick={() => isRunning ? onStop(channel.id) : onStart(channel.id)}>
              {isRunning ? <FiSquare size={14} /> : <FiPlay size={14} />}
              {isRunning ? 'Stop' : 'Start'}
            </Button>
            <Button size="sm" variant="danger" className="!px-2.5" onClick={() => onRemove(channel.id)}>
              <FiTrash2 size={14} />
            </Button>
            <button className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] transition-colors" onClick={() => setExpanded(prev => !prev)}>
              <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}><FiChevronDown size={16} /></span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Profile</p>
            <p className="mt-1 truncate text-xs font-bold text-[var(--text-primary)]">{profile?.name || 'Default'}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Destinations</p>
            <p className="mt-1 text-xs font-bold text-[var(--text-primary)]">{destinations.length}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Uptime</p>
            <p className="mt-1 font-mono text-xs font-bold text-[var(--text-primary)]">{uptime}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Speed</p>
            <p className="mt-1 font-mono text-xs font-bold text-[var(--text-primary)]">{channel.speed.toFixed(2)}x</p>
          </div>
        </div>

        {/* Output URLs */}
        <div className="space-y-2">
          {destinations.map(destination => (
            <div key={`${destination.id}-url`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{destination.name || destination.protocol} Output Play URL</p>
              <p className="mt-1 break-all font-mono text-xs font-bold text-[var(--primary)]">{destination.playbackUrl || destination.url}</p>
            </div>
          ))}
        </div>

        {/* Expandable Details Log & Embed Codes */}
        {expanded && (
          <div className="mt-4 border-t border-[var(--border)] pt-4 space-y-4 animate-[fade-in_0.15s_ease-out]">
            {/* Command Explanation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-primary)]">FFmpeg Pipeline Command</span>
                <Button size="sm" variant="ghost" onClick={handleExplain} loading={isExplaining}>
                  <FiZap size={14} /> Explain with AI
                </Button>
              </div>
              <code className="block rounded-[var(--radius-md)] bg-slate-900 p-3 font-mono text-xs text-emerald-400 break-all leading-relaxed">
                {channel.command}
              </code>
              {explanation && (
                <div className="mt-2 rounded-[var(--radius-md)] border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 leading-relaxed">
                  {explanation}
                </div>
              )}
            </div>

            {/* Logs Window */}
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] mb-2">
                <FiTerminal size={14} /> Output Process Logs
              </div>
              <div ref={terminalRef} className="h-44 overflow-y-auto rounded-[var(--radius-md)] bg-slate-950 p-3 font-mono text-[11px] text-slate-300 scrollbar-hide">
                {channel.outputLog ? (
                  <pre className="whitespace-pre-wrap">{channel.outputLog}</pre>
                ) : (
                  <p className="text-slate-500 italic">No output logs recorded yet.</p>
                )}
              </div>
            </div>

            {/* Embed Code Snippets */}
            {destinations.filter(d => d.playbackUrl && d.playbackUrl.startsWith('http')).length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-primary)]">Embed Player Code</span>
                  <div className="flex gap-1">
                    <button onClick={() => setEmbedMode('player')} className={`px-2.5 py-1 text-xs font-bold rounded-[var(--radius-sm)] ${embedMode === 'player' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)]'}`}>HLS Player</button>
                    <button onClick={() => setEmbedMode('iframe')} className={`px-2.5 py-1 text-xs font-bold rounded-[var(--radius-sm)] ${embedMode === 'iframe' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)]'}`}>IFrame Embed</button>
                  </div>
                </div>

                {destinations.filter(d => d.playbackUrl && d.playbackUrl.startsWith('http')).map(d => {
                  const code = embedMode === 'player' ? getVideoEmbedCode(d) : getIframeEmbedCode(d);
                  return (
                    <div key={d.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--text-secondary)]">{d.name} ({d.protocol})</span>
                        <Button size="sm" variant="secondary" onClick={() => handleCopyEmbed(d.id, code)}>
                          <FiCopy size={12} /> {copiedEmbedId === d.id ? 'Copied!' : 'Copy Code'}
                        </Button>
                      </div>
                      <textarea readOnly value={code} className="w-full h-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-[10px] text-[var(--text-muted)] resize-none" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default ChannelCard;
