import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  inlineTarget?: HTMLElement | null;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-[520px]",
  inlineTarget,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || inlineTarget) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, inlineTarget]);

  if (!open) return null;

  if (inlineTarget) {
    return createPortal(
      <section
        role="region"
        aria-label={title}
        className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-xs dark:border-[#371F59] dark:bg-[#1E1130]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-[var(--text-primary)]">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close inline panel"
          >
            <FiX size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && (
          <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
            {footer}
          </div>
        )}
      </section>,
      inlineTarget,
    );
  }

  return (
    <>
      <div className="drawer-overlay backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed right-0 top-0 z-50 flex h-full w-full ${width} flex-col border-l border-[#E8DFF0] bg-white dark:bg-[#160C24] dark:border-[#311B4E] shadow-[-24px_0_70px_rgba(15,8,23,.24)] animate-[slide-in-right_0.3s_ease-out]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
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
      </aside>
    </>
  );
};

export const Drawer = DetailDrawer;
export default DetailDrawer;
