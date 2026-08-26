import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AudioCodec, TranscodingProfile, VideoCodec } from '../types';
import {
  AUDIO_CODEC_OPTIONS,
  AVC_LEVEL_OPTIONS,
  AVC_PROFILE_OPTIONS,
  FRAMERATE_OPTIONS,
  PIXEL_FORMAT_OPTIONS,
  PRESET_OPTIONS,
  RATE_CONTROL_OPTIONS,
  RESOLUTION_OPTIONS,
  SAMPLE_RATE_OPTIONS,
  VIDEO_CODEC_OPTIONS,
} from '../constants';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Select from './ui/Select';

interface ProfileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: TranscodingProfile | Omit<TranscodingProfile, 'id'>) => void | Promise<void>;
  profile: TranscodingProfile | null;
}

const blankProfile: Omit<TranscodingProfile, 'id'> = {
  name: '',
  isAudioOnly: false,
  videoCodec: VideoCodec.H264,
  resolution: '1920x1080',
  videoQualityMode: 'bitrate',
  rateControl: 'cbr',
  avcProfile: 'high',
  avcLevel: '4.1',
  bFrames: 2,
  cabac: true,
  videoBitrate: 4000,
  minrate: 4000,
  maxrate: 4000,
  bufsize: 8000,
  crf: 23,
  framerate: 25,
  audioCodec: AudioCodec.AAC,
  audioBitrate: 128,
  audioChannels: 2,
  sampleRate: 48000,
  preset: 'medium',
  gopSize: 50,
  pixelFormat: 'yuv420p',
  interlaced: false,
};

const inputClass = 'w-full rounded-md border border-[#E8DFF0] bg-white px-3 py-2 text-sm text-[#1B1024] shadow-2xs outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 dark:bg-[#1E1130] dark:border-[#371F59] dark:text-white';

const ProfileEditor: React.FC<ProfileEditorProps> = ({ isOpen, onClose, onSave, profile }) => {
  const [form, setForm] = useState<Omit<TranscodingProfile, 'id'>>({ ...blankProfile });

  useEffect(() => {
    if (isOpen) setForm(profile ? { ...blankProfile, ...profile } : { ...blankProfile });
  }, [isOpen, profile]);

  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Profile name is required.');
    await onSave(profile ? { ...form, id: profile.id } : form);
    toast.success('Profile saved.');
    onClose();
  };

  const videoDisabled = form.isAudioOnly || form.videoCodec === VideoCodec.Copy;
  const isH264 = [VideoCodec.H264, VideoCodec.H264_NVENC, VideoCodec.H264_AMF, VideoCodec.H264_VIDEOTOOLBOX, 'libx264'].includes(form.videoCodec);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={profile ? `Edit Profile — ${profile.name}` : 'Create Transcoding Profile'}>
      <div className="space-y-5 text-[#1B1024] dark:text-[#E2D1F9]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">Profile Name</label>
            <input className={inputClass} value={form.name} onChange={event => setField('name', event.target.value)} placeholder="H.264 1080i50 Broadcast" />
          </div>
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]" checked={!!form.isAudioOnly} onChange={event => setField('isAudioOnly', event.target.checked)} />
              Audio-only profile
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]" checked={!!form.interlaced} onChange={event => setField('interlaced', event.target.checked)} />
              Interlaced (Upper Field)
            </label>
          </div>
        </div>

        {/* Video Settings Section */}
        <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-3 dark:bg-[#150B20] dark:border-[#311754]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD]">
            Video Encoding & MPEG-4 AVC Parameters
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Select label="Video Codec" value={form.videoCodec} onChange={event => setField('videoCodec', event.target.value as VideoCodec)} options={VIDEO_CODEC_OPTIONS} disabled={!!form.isAudioOnly} />
            <Select label="Resolution" value={form.resolution || 'source'} onChange={event => setField('resolution', event.target.value)} options={RESOLUTION_OPTIONS} disabled={videoDisabled} />
            <Select label="Frame Rate" value={String(form.framerate ?? 0)} onChange={event => setField('framerate', Number(event.target.value))} options={FRAMERATE_OPTIONS} disabled={videoDisabled} />
            
            {isH264 && (
              <>
                <Select label="AVC Profile" value={form.avcProfile || 'high'} onChange={event => setField('avcProfile', event.target.value as any)} options={AVC_PROFILE_OPTIONS} disabled={videoDisabled} />
                <Select label="AVC Level" value={form.avcLevel || '4.1'} onChange={event => setField('avcLevel', event.target.value as any)} options={AVC_LEVEL_OPTIONS} disabled={videoDisabled} />
                <Select label="Rate Control Mode" value={form.rateControl || 'cbr'} onChange={event => setField('rateControl', event.target.value as any)} options={RATE_CONTROL_OPTIONS} disabled={videoDisabled} />
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">Target Bitrate (kbps)</label>
              <input className={inputClass} type="number" value={form.videoBitrate || ''} onChange={event => setField('videoBitrate', Number(event.target.value) || undefined)} disabled={videoDisabled} placeholder="4000" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">Max Bitrate / Peak (kbps)</label>
              <input className={inputClass} type="number" value={form.maxrate || ''} onChange={event => setField('maxrate', Number(event.target.value) || undefined)} disabled={videoDisabled} placeholder="4500" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">VBV Buffer Size (kbps)</label>
              <input className={inputClass} type="number" value={form.bufsize || ''} onChange={event => setField('bufsize', Number(event.target.value) || undefined)} disabled={videoDisabled} placeholder="8000" />
            </div>

            <Select label="Encoder Preset" value={form.preset || ''} onChange={event => setField('preset', event.target.value)} options={PRESET_OPTIONS} disabled={videoDisabled} />
            
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">GOP Keyframe Interval</label>
              <input className={inputClass} type="number" value={form.gopSize || ''} onChange={event => setField('gopSize', Number(event.target.value) || undefined)} disabled={videoDisabled} placeholder="50" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">B-Frames Count</label>
              <input className={inputClass} type="number" min={0} max={16} value={form.bFrames ?? 2} onChange={event => setField('bFrames', Number(event.target.value))} disabled={videoDisabled} placeholder="2" />
            </div>

            <Select label="Pixel Format" value={form.pixelFormat || 'yuv420p'} onChange={event => setField('pixelFormat', event.target.value)} options={PIXEL_FORMAT_OPTIONS} disabled={videoDisabled} />

            <div className="flex items-center gap-2 pt-6">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#1B1024] dark:text-white cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]" checked={form.cabac !== false} onChange={event => setField('cabac', event.target.checked)} disabled={videoDisabled} />
                <span>Enable CABAC Entropy Coding</span>
              </label>
            </div>
          </div>
        </div>

        {/* Audio Settings Section */}
        <div className="rounded-xl border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-3 dark:bg-[#150B20] dark:border-[#311754]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD]">
            Audio Stream Parameters
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select label="Audio Codec" value={form.audioCodec} onChange={event => setField('audioCodec', event.target.value as AudioCodec)} options={AUDIO_CODEC_OPTIONS} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1B1024] dark:text-white">Audio Bitrate (kbps)</label>
              <input className={inputClass} type="number" value={form.audioBitrate || ''} onChange={event => setField('audioBitrate', Number(event.target.value) || undefined)} disabled={form.audioCodec === AudioCodec.Copy} placeholder="128" />
            </div>
            <Select label="Sample Rate" value={String(form.sampleRate || 48000)} onChange={event => setField('sampleRate', Number(event.target.value))} options={SAMPLE_RATE_OPTIONS} disabled={form.audioCodec === AudioCodec.Copy} />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#E8DFF0] pt-4 dark:border-[#311754]">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save}>Save Transcoding Profile</Button>
        </div>
      </div>
    </Modal>
  );
};

export default ProfileEditor;
