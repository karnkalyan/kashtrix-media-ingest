import React from 'react';
import KashtrixMediaPlayer from './KashtrixMediaPlayer';

interface MediaPreviewProps {
  url?: string;
  poster?: string;
  title?: string;
  aspectRatio?: string;
  maxHeight?: number | string;
  autoPlay?: boolean;
  className?: string;
  showAudioMeter?: boolean;
  resolution?: string;
  framerate?: string | number;
  isLive?: boolean;
  isRecording?: boolean;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  url,
  poster,
  title = 'Live Stream',
  maxHeight = 360,
  autoPlay = true,
  aspectRatio = 'aspect-video',
  className = '',
  showAudioMeter = true,
  resolution,
  framerate,
  isLive,
  isRecording,
}) => {
  return (
    <KashtrixMediaPlayer
      src={url}
      poster={poster}
      title={title}
      maxHeight={maxHeight}
      aspectRatio={aspectRatio}
      autoPlay={autoPlay}
      className={className}
      showAudioMeter={showAudioMeter}
      resolution={resolution}
      framerate={framerate}
      isLive={isLive}
      isRecording={isRecording}
    />
  );
};

export default MediaPreview;
