import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AudioCodec, TranscodingProfile, VideoCodec } from '../types';
import {
  AUDIO_CODEC_OPTIONS,
  FRAMERATE_OPTIONS,
  PIXEL_FORMAT_OPTIONS,
  PRESET_OPTIONS,
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
  videoBitrate: 4000,
  crf: 23,
  framerate: 30,
  audioCodec: AudioCodec.AAC,
  audioBitrate: 128,
  sampleRate: 48000,
  preset: 'medium',
  gopSize: 60,
  pixelFormat: 'yuv420p',
};

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={profile ? `Edit ${profile.name}` : 'Create Profile'}>
      <div className="space-y-5 text-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Profile Name</label>
            <input className={inputClass} value={form.name} onChange={event => setField('name', event.target.value)} placeholder="H.264 1080p Live" />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" checked={!!form.isAudioOnly} onChange={event => setField('isAudioOnly', event.target.checked)} />
            Audio-only profile
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select label="Video Codec" value={form.videoCodec} onChange={event => setField('videoCodec', event.target.value as VideoCodec)} options={VIDEO_CODEC_OPTIONS} disabled={!!form.isAudioOnly} />
          <Select label="Resolution" value={form.resolution} onChange={event => setField('resolution', event.target.value)} options={RESOLUTION_OPTIONS} disabled={videoDisabled} />
          <Select label="Frame Rate" value={String(form.framerate || '')} onChange={event => setField('framerate', Number(event.target.value))} options={FRAMERATE_OPTIONS} disabled={videoDisabled} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Video Bitrate (kbps)</label>
            <input className={inputClass} type="number" value={form.videoBitrate || ''} onChange={event => setField('videoBitrate', Number(event.target.value) || undefined)} disabled={videoDisabled} />
          </div>
          <Select label="Audio Codec" value={form.audioCodec} onChange={event => setField('audioCodec', event.target.value as AudioCodec)} options={AUDIO_CODEC_OPTIONS} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Audio Bitrate (kbps)</label>
            <input className={inputClass} type="number" value={form.audioBitrate || ''} onChange={event => setField('audioBitrate', Number(event.target.value) || undefined)} disabled={form.audioCodec === AudioCodec.Copy} />
          </div>
          <Select label="Sample Rate" value={String(form.sampleRate || '')} onChange={event => setField('sampleRate', Number(event.target.value))} options={SAMPLE_RATE_OPTIONS} disabled={form.audioCodec === AudioCodec.Copy} />
          <Select label="Preset" value={form.preset || ''} onChange={event => setField('preset', event.target.value)} options={PRESET_OPTIONS} disabled={videoDisabled} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">GOP Size</label>
            <input className={inputClass} type="number" value={form.gopSize || ''} onChange={event => setField('gopSize', Number(event.target.value) || undefined)} disabled={videoDisabled} />
          </div>
          <Select label="Pixel Format" value={form.pixelFormat || ''} onChange={event => setField('pixelFormat', event.target.value)} options={PIXEL_FORMAT_OPTIONS} disabled={videoDisabled} />
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save}>Save Profile</Button>
        </div>
      </div>
    </Modal>
  );
};

export default ProfileEditor;
