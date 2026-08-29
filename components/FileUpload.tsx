import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import Button from './ui/Button';
import { UploadIcon } from './icons';
import UploadProgressBar, { UploadProgressState } from './ui/UploadProgressBar';
import { uploadWithProgress } from '../utils/uploadHelper';

interface FileUploadProps {
  onFileUploaded: (serverFileName: string, originalName: string) => void;
  uploadButtonText: string;
  selectedFileName?: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded, uploadButtonText }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [uploadProgressState, setUploadProgressState] = useState<UploadProgressState | null>(null);
  const uploadAbortRef = useRef<(() => void) | null>(null);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('vodFile', file);

    try {
      const token = localStorage.getItem('kte-auth-token') || localStorage.getItem('token') || localStorage.getItem('jwt');
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const { promise, abort } = uploadWithProgress({
        url: '/api/vod/upload',
        formData,
        fileName: file.name,
        headers,
        onProgress: (state) => setUploadProgressState(state),
      });

      uploadAbortRef.current = abort;
      const data: any = await promise;

      const serverFileName = data.fileName || data.serverFileName;
      const originalName = data.originalName || file.name;
      if (!serverFileName) throw new Error('Upload succeeded but server did not return a file name.');

      setSelectedName(originalName);
      onFileUploaded(serverFileName, originalName);
      toast.success(`File "${originalName}" uploaded.`);
      setTimeout(() => setUploadProgressState(null), 3000);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed.');
      setSelectedName(null);
    } finally {
      setIsUploading(false);
      uploadAbortRef.current = null;
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
        {isUploading ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin text-[#4A1B7A] dark:text-[#A78BFA]" />
        ) : (
          <UploadIcon className="h-4 w-4 mr-2" />
        )}
        {isUploading ? 'Uploading...' : uploadButtonText}
      </Button>
      {selectedName && (
        <p className="mt-2 truncate text-center text-xs text-slate-500">
          Uploaded: <span className="font-mono text-slate-700 dark:text-slate-300">{selectedName}</span>
        </p>
      )}

      {/* Real-time File Upload Progress Bar Card */}
      <UploadProgressBar
        upload={uploadProgressState}
        onCancel={() => {
          if (uploadAbortRef.current) {
            uploadAbortRef.current();
            uploadAbortRef.current = null;
            toast('Upload cancelled');
          }
        }}
        onDismiss={() => setUploadProgressState(null)}
      />
    </div>
  );
};

export default FileUpload;
