import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary', size = 'md', loading = false,
  children, className = '', disabled, ...props
}) => {
  const base = 'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

  const variants: Record<string, string> = {
    primary: 'border border-[var(--primary-light)] bg-[var(--primary-light)] text-white hover:bg-[var(--primary)] hover:border-[var(--primary)] focus-visible:ring-[var(--primary)]',
    secondary: 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)] hover:border-[var(--border-strong)] focus-visible:ring-[var(--primary)]',
    ghost: 'text-[var(--primary)] hover:bg-[var(--primary-50)] focus-visible:ring-[var(--primary)]',
    danger: 'bg-[var(--danger)] text-white shadow-sm shadow-red-200 hover:bg-red-700 focus-visible:ring-[var(--danger)]',
    success: 'bg-[var(--success)] text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700 focus-visible:ring-[var(--success)]',
  };

  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-xs rounded-[var(--radius-sm)]',
    md: 'h-9 px-3.5 text-xs rounded-[var(--radius-sm)]',
    lg: 'h-11 px-5 text-sm rounded-[var(--radius-md)]',
    icon: 'h-10 w-10 rounded-[var(--radius-md)]',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;
