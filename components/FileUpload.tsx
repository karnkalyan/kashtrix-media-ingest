import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import Button from './ui/Button';
import { UploadIcon } from './icons';

interface FileUploadProps {
  onFileUploaded: (serverFileName: string, originalName: string) => void;
  uploadButtonText: string;
  selectedFileName?: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded, uploadButtonText }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('vodFile', file);

    try {
      const response = await fetch('/api/vod/upload', {
        method: 'POST',
        body: formData,
      });
      const data: { fileName?: string; serverFileName?: string; originalName?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'File upload failed on the server.');

      const serverFileName = data.fileName || data.serverFileName;
      const originalName = data.originalName || file.name;
      if (!serverFileName) throw new Error('Upload succeeded but server did not return a file name.');

      setSelectedName(originalName);
      onFileUploaded(serverFileName, originalName);
      toast.success(`File "${originalName}" uploaded.`);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed.');
      setSelectedName(null);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="video/*,audio/*,.mkv,.ts,.mp4,.m3u8"
        disabled={isUploading}
        onChange={event => event.target.files?.[0] && uploadFile(event.target.files[0])}
      />
      <Button type="button" onClick={() => inputRef.current?.click()} className="w-full" variant="secondary" disabled={isUploading}>
        <UploadIcon className={`h-4 w-4 mr-2 ${isUploading ? 'animate-spin' : ''}`} />
        {isUploading ? 'Uploading...' : uploadButtonText}
      </Button>
      {selectedName && (
        <p className="mt-2 truncate text-center text-xs text-slate-500">
          Uploaded: <span className="font-mono text-slate-700">{selectedName}</span>
        </p>
      )}
    </div>
  );
};

export default FileUpload;
