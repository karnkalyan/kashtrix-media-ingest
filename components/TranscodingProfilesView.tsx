import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiSliders,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiCheck,
  FiCpu,
  FiVideo,
  FiVolume2,
  FiLayers,
  FiArrowLeft,
  FiSave,
  FiInfo,
  FiZap,
} from 'react-icons/fi';
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
import Select from './ui/Select';
import Button from './ui/Button';
import ConfirmDialog from './ui/ConfirmDialog';

interface Props {
  profiles: TranscodingProfile[];
  addProfile: (profile: Omit<TranscodingProfile, 'id'>) => Promise<any> | void;
  updateProfile: (profile: TranscodingProfile) => Promise<any> | void;
  removeProfile: (id: string) => Promise<any> | void;
  userRole?: string;
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

const inputClass =
  'w-full rounded-lg border border-[#D5CBE5] bg-white px-3 py-2 text-xs text-[#1B1024] shadow-2xs outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 dark:bg-[#1E1130] dark:border-[#371F59] dark:text-white transition-colors';
const labelClass = 'mb-1 block text-xs font-bold text-[#4A3B59] dark:text-[#D1C2E6]';

export const TranscodingProfilesView: React.FC<Props> = ({
  profiles,
  addProfile,
  updateProfile,
  removeProfile,
  userRole,
}) => {
  const [editingProfileId, setEditingProfileId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Omit<TranscodingProfile, 'id'>>({ ...blankProfile });
  const [saving, setSaving] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateNew = () => {
    setForm({ ...blankProfile, name: 'New Broadcast Profile' });
    setEditingProfileId('new');
  };

  const handleEdit = (profile: TranscodingProfile) => {
    setForm({ ...blankProfile, ...profile });
    setEditingProfileId(profile.id);
  };

  const handleDuplicate = (profile: TranscodingProfile) => {
    const { id, ...rest } = profile;
    setForm({ ...rest, name: `${profile.name} (Copy)` });
    setEditingProfileId('new');
  };

  const confirmDeleteProfile = async () => {
    if (!deletingProfile) return;
    setDeleteLoading(true);
    try {
      await removeProfile(deletingProfile.id);
      toast.success(`Profile "${deletingProfile.name}" deleted`);
      if (editingProfileId === deletingProfile.id) setEditingProfileId(null);
      setDeletingProfile(null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete profile');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      return toast.error('Profile Name is required');
    }
    setSaving(true);
    try {
      if (editingProfileId === 'new') {
        await addProfile(form);
        toast.success('New transcoding profile created!');
      } else if (editingProfileId) {
        await updateProfile({ ...form, id: editingProfileId });
        toast.success('Transcoding profile updated!');
      }
      setEditingProfileId(null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const isVideoDisabled = !form.videoEnabled || form.isAudioOnly || form.videoCodec === VideoCodec.Copy;
  const isAudioDisabled = !form.audioEnabled || form.audioCodec === AudioCodec.Copy;

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] pb-4 dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <FiSliders size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1B1024] dark:text-white">
                Transcoding Profiles
              </h1>
              <p className="text-xs text-[#6F6078] dark:text-[#B9A5CD]">
                Configure broadcast DVB, IPTV & OTT multi-codec video and audio encoding presets
              </p>
            </div>
          </div>
        </div>

        {editingProfileId ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingProfileId(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-4 text-xs font-bold text-[#6F6078] hover:bg-[#F8F7FA] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
            >
              <FiArrowLeft size={14} /> Back to Profiles
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <FiSave size={14} /> {saving ? 'Saving Profile…' : 'Save Profile'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-violet-700 transition-colors"
          >
            <FiPlus size={15} /> Create Transcoding Profile
          </button>
        )}
      </div>

      {/* Editor View (Full In-Page Mode) */}
      {editingProfileId ? (
        <div className="space-y-6">
          {/* 1. Profile Identity & Master Settings */}
          <div className="rounded-2xl border border-[#E0D7ED] bg-white p-5 shadow-xs dark:bg-[#1A0E2B] dark:border-[#351957] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#351957]">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD] flex items-center gap-1.5">
                <FiZap size={14} /> Profile Identity & Baseband Configuration
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                {editingProfileId === 'new' ? 'NEW PROFILE' : `ID: ${editingProfileId}`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Profile Name <span className="text-rose-500">*</span>
                </label>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="e.g. DVB-T2 Broadcast Master (H.264 1080i50 CBR MP2 48k)"
                />
              </div>

              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 text-xs font-bold text-[#1B1024] dark:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#D5CBE5] text-[#7C3AED] focus:ring-[#7C3AED]"
                    checked={!!form.isAudioOnly}
                    onChange={(e) => setField('isAudioOnly', e.target.checked)}
                  />
                  <span>Audio-Only Feed</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-[#1B1024] dark:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#D5CBE5] text-[#7C3AED] focus:ring-[#7C3AED]"
                    checked={!!form.interlaced}
                    onChange={(e) => setField('interlaced', e.target.checked)}
                  />
                  <span>Interlaced Video (Upper/BFF)</span>
                </label>
              </div>
            </div>
          </div>

          {/* 2. Video Encoder Section (Single Full Option Panel) */}
          <div className="rounded-2xl border border-[#E0D7ED] bg-white p-5 shadow-xs dark:bg-[#1A0E2B] dark:border-[#351957] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8DFF0] pb-3 dark:border-[#351957]">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <FiVideo size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1B1024] dark:text-white">Video Encoder</h3>
                  <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Broadcast Elementary Stream (VES) Engine & Scaling Parameters
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-bold text-[#1B1024] dark:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#D5CBE5] text-blue-600 focus:ring-blue-500"
                    checked={!!form.videoEnabled && !form.isAudioOnly}
                    onChange={(e) => setField('videoEnabled', e.target.checked)}
                    disabled={form.isAudioOnly}
                  />
                  <span>Enable Video</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[#D5CBE5] text-amber-600 focus:ring-amber-500"
                    checked={!!form.accelerate}
                    onChange={(e) => setField('accelerate', e.target.checked)}
                  />
                  <span>Hardware Acceleration (GPU NVENC/QSV)</span>
                </label>
              </div>
            </div>

            <div className={`space-y-4 ${isVideoDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* Row 1: Codec, Track, Profile, Preset, Tune, Level */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Select
                  label="Codec"
                  value={form.videoCodec}
                  onChange={(e) => setField('videoCodec', e.target.value as VideoCodec)}
                  options={VIDEO_CODEC_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Track Selection"
                  value={form.videoTrack || 'first'}
                  onChange={(e) => setField('videoTrack', e.target.value)}
                  options={VIDEO_TRACK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Profile (H.264/HEVC)"
                  value={form.avcProfile || 'main'}
                  onChange={(e) => setField('avcProfile', e.target.value)}
                  options={AVC_PROFILE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Preset (Speed/Quality)"
                  value={form.preset || 'medium'}
                  onChange={(e) => setField('preset', e.target.value)}
                  options={PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Tune"
                  value={form.tune || 'hq'}
                  onChange={(e) => setField('tune', e.target.value)}
                  options={TUNE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Level"
                  value={form.avcLevel || 'auto'}
                  onChange={(e) => setField('avcLevel', e.target.value)}
                  options={AVC_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>

              {/* Row 2: Scale, Interpolation, Pixel Format, Aspect Ratio, Frame Rate, FPS Mode */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Select
                  label="Scale / Resolution"
                  value={form.resolution || 'source'}
                  onChange={(e) => setField('resolution', e.target.value)}
                  options={RESOLUTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Scaling Interpolation"
                  value={form.scaleInterpolation || 'default'}
                  onChange={(e) => setField('scaleInterpolation', e.target.value as any)}
                  options={INTERPOLATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Pixel Format"
                  value={form.pixelFormat || 'default'}
                  onChange={(e) => setField('pixelFormat', e.target.value)}
                  options={PIXEL_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Aspect Ratio"
                  value={form.aspectRatio || 'original'}
                  onChange={(e) => setField('aspectRatio', e.target.value)}
                  options={ASPECT_RATIO_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Frame Rate"
                  value={String(form.framerate || 0)}
                  onChange={(e) => setField('framerate', Number(e.target.value))}
                  options={FRAMERATE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />

                <Select
                  label="FPS Mode"
                  value={form.fpsMode || 'auto'}
                  onChange={(e) => setField('fpsMode', e.target.value as any)}
                  options={FPS_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>

              {/* Row 3: Bitrate Control, Target Bitrate, Buffer, GOP, B-Frames, CRF */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Select
                  label="Bitrate Control"
                  value={form.rateControl || 'cbr'}
                  onChange={(e) => setField('rateControl', e.target.value as any)}
                  options={RATE_CONTROL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <div>
                  <label className={labelClass}>Target Bitrate (Kbps)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.videoBitrate || 4000}
                    onChange={(e) => {
                      const val = Number(e.target.value);
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
                    onChange={(e) => setField('bufsize', Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className={labelClass}>GOP (Keyframe Interval)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.gopSize ?? 50}
                    onChange={(e) => setField('gopSize', Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className={labelClass}>B-Frames (bf)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.bFrames ?? 2}
                    onChange={(e) => setField('bFrames', Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className={labelClass}>CRF Constant Quality</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.crf ?? 23}
                    onChange={(e) => setField('crf', Number(e.target.value))}
                    disabled={form.rateControl === 'cbr'}
                  />
                </div>
              </div>

              {/* Row 4: Subtitles & Advanced Video Arguments */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  label="Subtitle Overlay"
                  value={form.subtitleOverlay || 'off'}
                  onChange={(e) => setField('subtitleOverlay', e.target.value as any)}
                  options={SUBTITLE_OVERLAY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <div>
                  <label className={labelClass}>Subtitle Custom Position</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.subtitlePosition || ''}
                    onChange={(e) => setField('subtitlePosition', e.target.value)}
                    placeholder="e.g. x=10:y=h-th-20"
                  />
                </div>

                <div>
                  <label className={labelClass}>Advanced Video FFmpeg Arguments</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.advancedVideoFlags || ''}
                    onChange={(e) => setField('advancedVideoFlags', e.target.value)}
                    placeholder="e.g. -x264opts keyint=50:scenecut=0 -flags +ilme+ildct"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Audio Encoder Section (Single Full Option Panel) */}
          <div className="rounded-2xl border border-[#E0D7ED] bg-white p-5 shadow-xs dark:bg-[#1A0E2B] dark:border-[#351957] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8DFF0] pb-3 dark:border-[#351957]">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <FiVolume2 size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1B1024] dark:text-white">Audio Encoder</h3>
                  <p className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">
                    Broadcast DVB MPEG-1 Layer II, Dolby AC-3 & High-Fidelity AAC Audio Engine
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-[#1B1024] dark:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#D5CBE5] text-emerald-600 focus:ring-emerald-500"
                  checked={!!form.audioEnabled}
                  onChange={(e) => setField('audioEnabled', e.target.checked)}
                />
                <span>Enable Audio</span>
              </label>
            </div>

            <div className={`space-y-4 ${isAudioDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* Audio Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Select
                  label="Audio Codec"
                  value={form.audioCodec}
                  onChange={(e) => setField('audioCodec', e.target.value as AudioCodec)}
                  options={AUDIO_CODEC_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Audio Track"
                  value={form.audioTrack || 'all'}
                  onChange={(e) => setField('audioTrack', e.target.value)}
                  options={AUDIO_TRACK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Sampling Rate (48kHz DVB Standard)"
                  value={String(form.sampleRate || 48000)}
                  onChange={(e) => setField('sampleRate', Number(e.target.value))}
                  options={SAMPLE_RATE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />

                <Select
                  label="Audio Channels"
                  value={form.audioChannels || 'all'}
                  onChange={(e) => setField('audioChannels', e.target.value)}
                  options={AUDIO_CHANNELS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />

                <Select
                  label="Audio Bitrate (192k DVB)"
                  value={String(form.audioBitrate || 192)}
                  onChange={(e) => setField('audioBitrate', Number(e.target.value))}
                  options={AUDIO_BITRATE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[#4A3B59] dark:text-[#D1C2E6]">
                      Volume Gain
                    </label>
                    <span className="font-mono text-[11px] font-extrabold text-[#7C3AED] dark:text-[#C4B5FD]">
                      {(form.volumeGainPercent || 0) > 0 ? `+${form.volumeGainPercent}%` : `${form.volumeGainPercent || 0}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="100"
                    step="5"
                    className="w-full h-2 rounded-lg bg-gray-200 accent-[#7C3AED] dark:bg-gray-700 cursor-pointer"
                    value={form.volumeGainPercent || 0}
                    onChange={(e) => setField('volumeGainPercent', Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Advanced Audio Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Upmix / Matrix Downmix</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.audioUpmix || ''}
                    onChange={(e) => setField('audioUpmix', e.target.value)}
                    placeholder="e.g. FL,FR,FC,LFE,BL,BR or 5.1 to Stereo"
                  />
                </div>

                <div>
                  <label className={labelClass}>Sync to Timestamp / Resample</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.audioSync || 'default'}
                    onChange={(e) => setField('audioSync', e.target.value)}
                    placeholder="default or aresample=async=1000"
                  />
                </div>

                <div>
                  <label className={labelClass}>Advanced Audio FFmpeg Arguments</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.advancedAudioFlags || ''}
                    onChange={(e) => setField('advancedAudioFlags', e.target.value)}
                    placeholder="e.g. -af loudnorm=I=-24:LRA=7:TP=-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingProfileId(null)}
              className="h-10 rounded-xl border border-[#E8DFF0] bg-white px-6 text-xs font-bold text-[#6F6078] hover:bg-[#F8F7FA] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-7 text-xs font-bold text-white shadow-md hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <FiCheck size={16} /> {saving ? 'Saving Profile…' : 'Save Transcoding Profile'}
            </button>
          </div>
        </div>
      ) : (
        /* Profiles Listing View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {profiles.map((p) => {
            const isDvb =
              p.name.toLowerCase().includes('dvb') ||
              p.videoCodec === VideoCodec.MPEG2 ||
              p.audioCodec === AudioCodec.MP2;

            return (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-2xl border border-[#E8DFF0] bg-white p-4 shadow-xs hover:border-[#7C3AED]/40 dark:bg-[#190E28] dark:border-[#311B4E] transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-[#1B1024] dark:text-white" title={p.name}>
                        {p.name}
                      </h3>
                      <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD] mt-0.5">
                        {p.resolution || '1080p'} • {p.videoBitrate || 4000} kbps • {p.framerate ? `${p.framerate} fps` : 'Source FPS'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {isDvb && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-purple-800 dark:bg-purple-950 dark:text-purple-200">
                          DVB
                        </span>
                      )}
                      {p.accelerate && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          GPU
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Specifications Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#F8F7FA] dark:bg-[#211335] p-2.5 rounded-xl border border-[#E8DFF0] dark:border-[#371F59]">
                    <div>
                      <span className="text-[9px] font-bold uppercase text-[#6F6078] dark:text-[#A898BC] block">
                        Video Codec
                      </span>
                      <span className="font-bold text-[#1B1024] dark:text-white truncate block">
                        {p.videoCodec.toUpperCase()} ({p.rateControl?.toUpperCase() || 'CBR'})
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold uppercase text-[#6F6078] dark:text-[#A898BC] block">
                        Audio Codec
                      </span>
                      <span className="font-bold text-[#1B1024] dark:text-white truncate block">
                        {p.audioCodec.toUpperCase()} • {p.audioBitrate || 192}k
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold uppercase text-[#6F6078] dark:text-[#A898BC] block">
                        Preset / Tune
                      </span>
                      <span className="text-[#1B1024] dark:text-[#E2D1F9] capitalize truncate block">
                        {p.preset || 'medium'} / {p.tune || 'hq'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold uppercase text-[#6F6078] dark:text-[#A898BC] block">
                        GOP / Interlace
                      </span>
                      <span className="text-[#1B1024] dark:text-[#E2D1F9] truncate block">
                        GOP {p.gopSize || 50} • {p.interlaced ? 'Interlaced' : 'Progressive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between border-t border-[#E8DFF0] pt-3 mt-4 dark:border-[#311B4E]">
                  <span className="font-mono text-[9px] text-[#6F6078] dark:text-[#8E78A6]">
                    Preset ID: {p.id.slice(0, 14)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(p)}
                      className="rounded-lg p-1.5 text-[#6F6078] hover:bg-violet-50 hover:text-violet-700 dark:text-[#B9A5CD] dark:hover:bg-violet-950"
                      title="Duplicate Profile"
                    >
                      <FiCopy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(p)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#F8F7FA] px-2.5 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100 dark:bg-[#211335] dark:text-violet-300 dark:hover:bg-[#2D1648]"
                    >
                      <FiEdit2 size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingProfile({ id: p.id, name: p.name })}
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      title="Delete Profile"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Confirmation Dialog for Profile Deletion */}
      <ConfirmDialog
        open={!!deletingProfile}
        title="Delete Transcoding Profile"
        message={`Are you sure you want to permanently delete profile "${deletingProfile?.name}"? Any channel using this profile may fail to encode.`}
        confirmLabel="Delete Profile"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDeleteProfile}
        onCancel={() => setDeletingProfile(null)}
      />
    </div>
  );
};

export default TranscodingProfilesView;
