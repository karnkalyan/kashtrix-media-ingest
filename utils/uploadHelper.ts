import { UploadProgressState } from '../components/ui/UploadProgressBar';

export const formatUploadBytes = (bytes: number, decimals = 1): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatSpeed = (bytesPerSec: number): string => {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
  }
  return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
};

export const formatTimeRemaining = (seconds: number): string => {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
  if (seconds < 60) return `${seconds}s left`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s left`;
};

export interface XhrUploadOptions {
  url: string;
  formData: FormData;
  fileName: string;
  headers?: Record<string, string>;
  onProgress: (state: UploadProgressState) => void;
}

export const uploadWithProgress = ({
  url,
  formData,
  fileName,
  headers = {},
  onProgress,
}: XhrUploadOptions): { promise: Promise<any>; abort: () => void } => {
  const xhr = new XMLHttpRequest();
  const startTime = Date.now();
  let lastLoaded = 0;
  let lastTime = startTime;
  let speedSmoothed = 0;

  const promise = new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const now = Date.now();
        const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
        const timeDiff = (now - lastTime) / 1000;

        if (timeDiff >= 0.25) {
          const instantSpeed = (e.loaded - lastLoaded) / timeDiff;
          speedSmoothed = speedSmoothed === 0 ? instantSpeed : speedSmoothed * 0.7 + instantSpeed * 0.3;
          lastLoaded = e.loaded;
          lastTime = now;
        }

        const remainingBytes = e.total - e.loaded;
        const timeRemaining = speedSmoothed > 0 ? Math.ceil(remainingBytes / speedSmoothed) : 0;

        onProgress({
          fileName,
          fileSizeFormatted: formatUploadBytes(e.total),
          loadedFormatted: formatUploadBytes(e.loaded),
          totalFormatted: formatUploadBytes(e.total),
          percent,
          speedFormatted: formatSpeed(speedSmoothed),
          timeRemainingFormatted: formatTimeRemaining(timeRemaining),
          status: 'uploading',
        });
      }
    });

    xhr.upload.addEventListener('load', () => {
      onProgress({
        fileName,
        fileSizeFormatted: '',
        loadedFormatted: '',
        totalFormatted: '',
        percent: 100,
        speedFormatted: '0 B/s',
        timeRemainingFormatted: '',
        status: 'processing',
      });
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          onProgress({
            fileName,
            fileSizeFormatted: '',
            loadedFormatted: '',
            totalFormatted: '',
            percent: 100,
            speedFormatted: '',
            timeRemainingFormatted: '',
            status: 'completed',
          });
          resolve(data);
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        let errMsg = `Upload failed (Status ${xhr.status})`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) errMsg = data.error;
        } catch (_) {}

        onProgress({
          fileName,
          fileSizeFormatted: '',
          loadedFormatted: '',
          totalFormatted: '',
          percent: 0,
          speedFormatted: '',
          timeRemainingFormatted: '',
          status: 'error',
          errorMessage: errMsg,
        });
        reject(new Error(errMsg));
      }
    });

    xhr.addEventListener('error', () => {
      const errMsg = 'Network error during file upload';
      onProgress({
        fileName,
        fileSizeFormatted: '',
        loadedFormatted: '',
        totalFormatted: '',
        percent: 0,
        speedFormatted: '',
        timeRemainingFormatted: '',
        status: 'error',
        errorMessage: errMsg,
      });
      reject(new Error(errMsg));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled by user'));
    });

    xhr.open('POST', url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.send(formData);
  });

  return {
    promise,
    abort: () => xhr.abort(),
  };
};
