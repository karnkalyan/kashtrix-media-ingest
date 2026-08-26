import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AudioCodec, TranscodingProfile, VideoCodec } from '../types';
import {
  AUDIO_BITRATE_OPTIONS,
  AUDIO_CHANNELS_OPTIONS,
  AUDIO_CODEC_OPTIONS,
  AUDIO_TRACK_OPTIONS,
  AVC_LEVEL_OPTIONS,
  AVC_PROFILE_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  FPS_MODE_OPTIONS,
  FRAMERATE_OPTIONS,
  INTERPOLATION_OPTIONS,
  PIXEL_FORMAT_OPTIONS,
  PRESET_OPTIONS,
  RATE_CONTROL_OPTIONS,
  RESOLUTION_OPTIONS,
  SAMPLE_RATE_OPTIONS,
  SUBTITLE_OVERLAY_OPTIONS,
  TUNE_OPTIONS,
  VIDEO_CODEC_OPTIONS,
  VIDEO_TRACK_OPTIONS,
} from '../constants';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Select from './ui/Select';
import { Sliders, Volume2, Video, Cpu, Sparkles, Check, X } from 'lucide-react';

interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: TranscodingProfile | Omit<TranscodingProfile, 'id'>) => void | Promise<void>;
  profile: TranscodingProfile | null;
}

const blankProfile: Omit<TranscodingProfile, 'id'> = {
  name: '',
  isAudioOnly: false,
  accelerate: true,
  videoEnabled: true,
  videoCodec: VideoCodec.H264,
  videoTrack: 'first',
  resolution: 'source',
  videoQualityMode: 'cbr',
  rateControl: 'cbr',
  avcProfile: 'main',
  avcLevel: 'auto',
  preset: 'medium',
  tune: 'hq',
  scaleInterpolation: 'default',
  aspectRatio: 'original',
  framerate: 0,
  fpsMode: 'auto',
  gopSize: 50,
  bFrames: 2,
  cabac: true,
  videoBitrate: 4000,
  minrate: 4000,
  maxrate: 4000,
  bufsize: 6000,
  crf: 23,
  pixelFormat: 'default',
  interlaced: false,
  subtitleOverlay: 'off',
  subtitlePosition: '',
  subtitleTrack: 'first',
  advancedVideoFlags: '',
  
  audioEnabled: true,
  audioCodec: AudioCodec.AAC,
  audioTrack: 'all',
  sampleRate: 48000,
  audioChannels: 'all',
  audioUpmix: '',
  audioBitrate: 192,
  audioSync: 'default',
  volumeGainPercent: 0,
  advancedAudioFlags: '',
};

const inputClass = 'w-full rounded-lg border border-[#D5CBE5] bg-white px-2.5 py-1.5 text-xs text-[#1B1024] shadow-2xs outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 dark:bg-[#1E1130] dark:border-[#371F59] dark:text-white';
const labelClass = 'mb-1 block text-[11px] font-semibold text-[#4A3B59] dark:text-[#D1C2E6]';

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ isOpen, onClose, onSave, profile }) => {
  const [form, setForm] = useState<Omit<TranscodingProfile, 'id'>>({ ...blankProfile });

  useEffect(() => {
    if (isOpen) {
      setForm(profile ? { ...blankProfile, ...profile } : { ...blankProfile });
    }
  }, [isOpen, profile]);

  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Profile name is required.');
    await onSave(profile ? { ...form, id: profile.id } : form);
    toast.success('Transcoding profile saved successfully.');
    onClose();
  };

  const isVideoDisabled = !form.videoEnabled || form.isAudioOnly || form.videoCodec === VideoCodec.Copy;
  const isAudioDisabled = !form.audioEnabled || form.audioCodec === AudioCodec.Copy;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={profile ? `Edit Profile — ${profile.name}` : 'Transcoding Profile'}>
      <div className="space-y-4 max-h-[82vh] overflow-y-auto pr-1 text-[#1B1024] dark:text-[#E2D1F9]">
        {/* Profile Header */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 bg-[#F4F1F8] dark:bg-[#1A0E2B] p-3.5 rounded-xl border border-[#E0D7ED] dark:border-[#351957]">
          <div className="sm:col-span-2">
            <label className={labelClass}>Profile Name <span className="text-rose-500">*</span></label>
            <input
              className={inputClass}
              value={form.name}
              onChange={event => setField('name', event.target.value)}
              placeholder="e.g. DVB-T2 Broadcast Master (H.264 1080i50 + MP2 48k)"
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#D5CBE5] text-[#7C3AED] focus:ring-[#7C3AED]"
                checked={!!form.isAudioOnly}
                onChange={event => setField('isAudioOnly', event.target.checked)}
              />
              <span>Audio-only</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#D5CBE5] text-[#7C3AED] focus:ring-[#7C3AED]"
                checked={!!form.interlaced}
                onChange={event => setField('interlaced', event.target.checked)}
              />
              <span>Interlaced</span>
            </label>
          </div>
        </div>

        {/* Video Encoder Section (Single Full Option Panel) */}
        <div className="rounded-xl border border-[#D5CBE5] bg-white p-4 shadow-2xs dark:bg-[#160B24] dark:border-[#311754] space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8DFF0] pb-2.5 dark:border-[#311754]">
            <div className="flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Video size={13} />
              </div>
              <span className="text-xs font-bold text-[#1B1024] dark:text-white">Video Encoder</span>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-[#D5CBE5] text-blue-600 focus:ring-blue-500"
                  checked={!!form.videoEnabled && !form.isAudioOnly}
                  onChange={e => setField('videoEnabled', e.target.checked)}
                  disabled={form.isAudioOnly}
                />
                <span>Enable Video</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-[#D5CBE5] text-amber-600 focus:ring-amber-500"
                  checked={!!form.accelerate}
                  onChange={e => setField('accelerate', e.target.checked)}
                />
                <span>Hardware Acceleration</span>
              </label>
            </div>
          </div>

          <div className={`space-y-3 ${isVideoDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <Select
                label="Codec"
                value={form.videoCodec}
                onChange={event => setField('videoCodec', event.target.value as VideoCodec)}
                options={VIDEO_CODEC_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Track"
                value={form.videoTrack || 'first'}
                onChange={event => setField('videoTrack', event.target.value)}
                options={VIDEO_TRACK_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Profile (H.264/HEVC)"
                value={form.avcProfile || 'main'}
                onChange={event => setField('avcProfile', event.target.value)}
                options={AVC_PROFILE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Preset"
                value={form.preset || 'medium'}
                onChange={event => setField('preset', event.target.value)}
                options={PRESET_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Tune"
                value={form.tune || 'hq'}
                onChange={event => setField('tune', event.target.value)}
                options={TUNE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Level"
                value={form.avcLevel || 'auto'}
                onChange={event => setField('avcLevel', event.target.value)}
                options={AVC_LEVEL_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <Select
                label="Scale / Resolution"
                value={form.resolution || 'source'}
                onChange={event => setField('resolution', event.target.value)}
                options={RESOLUTION_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Interpolation"
                value={form.scaleInterpolation || 'default'}
                onChange={event => setField('scaleInterpolation', event.target.value as any)}
                options={INTERPOLATION_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Pixel Format"
                value={form.pixelFormat || 'default'}
                onChange={event => setField('pixelFormat', event.target.value)}
                options={PIXEL_FORMAT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Aspect Ratio"
                value={form.aspectRatio || 'original'}
                onChange={event => setField('aspectRatio', event.target.value)}
                options={ASPECT_RATIO_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Frame Rate"
                value={String(form.framerate || 0)}
                onChange={event => setField('framerate', Number(event.target.value))}
                options={FRAMERATE_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))}
              />
              <Select
                label="FPS Mode"
                value={form.fpsMode || 'auto'}
                onChange={event => setField('fpsMode', event.target.value as any)}
                options={FPS_MODE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <Select
                label="Bitrate Control"
                value={form.rateControl || 'cbr'}
                onChange={event => setField('rateControl', event.target.value as any)}
                options={RATE_CONTROL_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <div>
                <label className={labelClass}>Target Bitrate (Kbps)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.videoBitrate || 4000}
                  onChange={event => {
                    const val = Number(event.target.value);
                    setField('videoBitrate', val);
                    if (form.rateControl === 'cbr') {
                      setField('minrate', val);
                      setField('maxrate', val);
                      setField('bufsize', Math.round(val * 1.5));
                    }
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>VBV Buffer Size (Kbps)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.bufsize || 6000}
                  onChange={event => setField('bufsize', Number(event.target.value))}
                />
              </div>
              <div>
                <label className={labelClass}>GOP (Keyframe Interval)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.gopSize ?? 50}
                  onChange={event => setField('gopSize', Number(event.target.value))}
                />
              </div>
              <div>
                <label className={labelClass}>B-Frames (bf)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.bFrames ?? 2}
                  onChange={event => setField('bFrames', Number(event.target.value))}
                />
              </div>
              <Select
                label="Subtitle Overlay"
                value={form.subtitleOverlay || 'off'}
                onChange={event => setField('subtitleOverlay', event.target.value as any)}
                options={SUBTITLE_OVERLAY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
            </div>

            <div>
              <label className={labelClass}>Advanced Video FFmpeg Arguments</label>
              <input
                type="text"
                className={inputClass}
                value={form.advancedVideoFlags || ''}
                onChange={event => setField('advancedVideoFlags', event.target.value)}
                placeholder="e.g. -x264opts keyint=50:scenecut=0 -flags +ilme+ildct"
              />
            </div>
          </div>
        </div>

        {/* Audio Encoder Section (Single Full Option Panel) */}
        <div className="rounded-xl border border-[#D5CBE5] bg-white p-4 shadow-2xs dark:bg-[#160B24] dark:border-[#311754] space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8DFF0] pb-2.5 dark:border-[#311754]">
            <div className="flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <Volume2 size={13} />
              </div>
              <span className="text-xs font-bold text-[#1B1024] dark:text-white">Audio Encoder (DVB MPEG-1 Layer II & AAC)</span>
            </div>

            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-[#D5CBE5] text-emerald-600 focus:ring-emerald-500"
                checked={!!form.audioEnabled}
                onChange={e => setField('audioEnabled', e.target.checked)}
              />
              <span>Enable Audio</span>
            </label>
          </div>

          <div className={`space-y-3 ${isAudioDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <Select
                label="Audio Codec"
                value={form.audioCodec}
                onChange={event => setField('audioCodec', event.target.value as AudioCodec)}
                options={AUDIO_CODEC_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Audio Track"
                value={form.audioTrack || 'all'}
                onChange={event => setField('audioTrack', event.target.value)}
                options={AUDIO_TRACK_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Sampling Rate"
                value={String(form.sampleRate || 48000)}
                onChange={event => setField('sampleRate', Number(event.target.value))}
                options={SAMPLE_RATE_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))}
              />
              <Select
                label="Audio Channels"
                value={form.audioChannels || 'all'}
                onChange={event => setField('audioChannels', event.target.value)}
                options={AUDIO_CHANNELS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <Select
                label="Audio Bitrate"
                value={String(form.audioBitrate || 192)}
                onChange={event => setField('audioBitrate', Number(event.target.value))}
                options={AUDIO_BITRATE_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))}
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#4A3B59] dark:text-[#D1C2E6]">Volume Gain</label>
                  <span className="font-mono text-[10px] font-bold text-[#7C3AED] dark:text-[#C4B5FD]">
                    {(form.volumeGainPercent || 0) > 0 ? `+${form.volumeGainPercent}%` : `${form.volumeGainPercent || 0}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="100"
                  step="5"
                  className="w-full h-1.5 rounded-lg bg-gray-200 accent-[#7C3AED] dark:bg-gray-700 cursor-pointer"
                  value={form.volumeGainPercent || 0}
                  onChange={e => setField('volumeGainPercent', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className={labelClass}>Upmix / Matrix Downmix</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.audioUpmix || ''}
                  onChange={event => setField('audioUpmix', event.target.value)}
                  placeholder="e.g. FL,FR,FC,LFE,BL,BR or 5.1 to Stereo"
                />
              </div>
              <div>
                <label className={labelClass}>Advanced Audio Arguments</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.advancedAudioFlags || ''}
                  onChange={event => setField('advancedAudioFlags', event.target.value)}
                  placeholder="e.g. -af loudnorm=I=-24:LRA=7"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311754]">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save Transcoding Profile</Button>
        </div>
      </div>
    </Modal>
  );
};

export default ProfileEditor;
