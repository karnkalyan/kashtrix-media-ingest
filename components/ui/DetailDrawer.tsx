import React from 'react';
import { FiX } from 'react-icons/fi';

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open, onClose, title, subtitle, children, footer, width = 'max-w-[520px]',
}) => {
  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className={`fixed right-0 top-0 z-50 flex h-full w-full ${width} flex-col border-l border-[#E8DFF0] bg-white dark:bg-[#160C24] dark:border-[#311B4E] shadow-2xl animate-[slide-in-right_0.3s_ease-out]`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close drawer"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-[var(--border)] px-6 py-4 bg-[var(--surface-muted)]">
            {footer}
          </div>
        )}
      </div>
    </>
  );
};

export const Drawer = DetailDrawer;
export default DetailDrawer;
