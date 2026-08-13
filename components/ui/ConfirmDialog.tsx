import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'danger', loading = false, onConfirm, onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 w-screen h-screen overflow-y-auto" role="dialog" aria-modal="true">
      <div className="fixed inset-0 w-screen h-screen bg-slate-950/60 backdrop-blur-xs transition-opacity" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#E8EDF5] bg-white p-6 shadow-2xl animate-[scale-in_0.2s_ease-out] dark:bg-[#190E28] dark:border-[#371F52]">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-[var(--danger)] hover:bg-red-700 shadow-sm shadow-red-200'
                : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
