import React from 'react';
import {
  FiUploadCloud,
  FiFilm,
  FiFile,
  FiCheckCircle,
  FiAlertCircle,
  FiX,
  FiLoader,
} from 'react-icons/fi';

export interface UploadProgressState {
  fileName: string;
  fileSizeFormatted: string;
  loadedFormatted: string;
  totalFormatted: string;
  percent: number;
  speedFormatted: string;
  timeRemainingFormatted: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
}

interface UploadProgressBarProps {
  upload: UploadProgressState | null;
  onCancel?: () => void;
  onDismiss?: () => void;
}

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({
  upload,
  onCancel,
  onDismiss,
}) => {
  if (!upload) return null;

  const isVideo = /\.(mp4|mkv|mov|ts|mxf|flv|avi|webm)$/i.test(upload.fileName);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[92vw] animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="overflow-hidden rounded-2xl border border-purple-200/80 bg-white p-4 shadow-2xl backdrop-blur-xl dark:border-[#371F59] dark:bg-[#190E28] dark:shadow-purple-950/40">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-[#7C3AED] dark:bg-[#311754] dark:text-[#C4B5FD]">
              {upload.status === 'completed' ? (
                <FiCheckCircle size={18} className="text-emerald-500" />
              ) : upload.status === 'error' ? (
                <FiAlertCircle size={18} className="text-rose-500" />
              ) : isVideo ? (
                <FiFilm size={18} />
              ) : (
                <FiUploadCloud size={18} className="animate-bounce" />
              )}
            </div>

            <div className="overflow-hidden">
              <span
                className="block truncate text-xs font-bold text-slate-900 dark:text-white"
                title={upload.fileName}
              >
                {upload.fileName}
              </span>
              <span className="block text-[11px] text-slate-400">
                {upload.status === 'uploading' && (
                  <>
                    {upload.loadedFormatted} of {upload.totalFormatted} •{' '}
                    <strong className="text-purple-600 dark:text-purple-400">
                      {upload.speedFormatted}
                    </strong>
                  </>
                )}
                {upload.status === 'processing' && 'Processing & Verifying on Server...'}
                {upload.status === 'completed' && 'Upload Complete'}
                {upload.status === 'error' && (upload.errorMessage || 'Upload Failed')}
              </span>
            </div>
          </div>

          {/* Action button: Cancel or Dismiss */}
          {upload.status === 'uploading' ? (
            onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
                title="Cancel Upload"
              >
                <FiX size={15} />
              </button>
            )
          ) : (
            onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
                title="Dismiss"
              >
                <FiX size={15} />
              </button>
            )
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-3 space-y-1.5">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#211335]">
            <div
              className={`h-full transition-all duration-150 rounded-full ${
                upload.status === 'completed'
                  ? 'bg-emerald-500'
                  : upload.status === 'error'
                    ? 'bg-rose-500'
                    : 'bg-gradient-to-r from-[#7C3AED] via-purple-500 to-indigo-500 shadow-sm'
              }`}
              style={{ width: `${Math.max(2, upload.percent)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold">
            <span
              className={
                upload.status === 'completed'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : upload.status === 'error'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-[#7C3AED] dark:text-[#C4B5FD]'
              }
            >
              {upload.status === 'uploading' && `${upload.percent}% Uploaded`}
              {upload.status === 'processing' && (
                <span className="flex items-center gap-1">
                  <FiLoader className="animate-spin" size={11} /> Finalizing 100%
                </span>
              )}
              {upload.status === 'completed' && '100% Ready'}
              {upload.status === 'error' && 'Failed'}
            </span>

            {upload.status === 'uploading' && upload.timeRemainingFormatted && (
              <span className="text-slate-400 font-mono">
                {upload.timeRemainingFormatted}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadProgressBar;
