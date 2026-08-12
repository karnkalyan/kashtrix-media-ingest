import React, { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

const Accordion: React.FC<AccordionProps> = ({ title, children, defaultOpen = false, className = '' }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--surface-muted)]"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <FiChevronDown
          size={18}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-5 py-4 animate-[fade-in_0.15s_ease-out]">
          {children}
        </div>
      )}
    </div>
  );
};

export default Accordion;
