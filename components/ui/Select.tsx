import React from 'react';
import { FiChevronDown } from 'react-icons/fi';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  error?: string;
  helperText?: string;
}

const Select: React.FC<SelectProps> = ({ label, options, error, helperText, className = '', ...props }) => (
  <div className={className}>
    {label && (
      <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">
        {label}
        {props.required && <span className="ml-1 text-[var(--danger)]">*</span>}
      </label>
    )}
    <div className="relative">
      <select
        className={`w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--surface)] px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] shadow-[var(--shadow-inner)] outline-none transition-all focus:ring-4 ${
          error
            ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-red-100'
            : 'border-[var(--border)] focus:border-[var(--primary)] focus:ring-[var(--primary)]/10'
        }`}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
    </div>
    {error && <p className="mt-1 text-xs font-medium text-[var(--danger)]">{error}</p>}
    {helperText && !error && <p className="mt-1 text-xs text-[var(--text-muted)]">{helperText}</p>}
  </div>
);

export default Select;
