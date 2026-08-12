import React, { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

const Accordion: React.FC<AccordionProps> = ({ title, children, defaultOpen = false, className = '', icon }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">{icon}{title}</span>
        <FiChevronDown
          size={18}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3 animate-[fade-in_0.15s_ease-out]">
          {children}
        </div>
      )}
    </div>
  );
};

export default Accordion;
