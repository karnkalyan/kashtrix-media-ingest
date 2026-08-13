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
    primary: 'border border-[#7C3AED] bg-[#7C3AED] text-white hover:bg-[#6D32D9] hover:border-[#6D32D9] dark:bg-[#6D32D9] dark:border-[#8B5CF6]/50 dark:hover:bg-[#7C3AED] focus-visible:ring-[#7C3AED]',
    secondary: 'bg-white border border-[#E8DFF0] text-[#1B1024] hover:bg-[#F8F7FA] hover:border-[#D8CBE4] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#E2D1F9] dark:hover:bg-[#2D1A45] focus-visible:ring-[#7C3AED]',
    ghost: 'text-[#7C3AED] hover:bg-[#F4EEFF] dark:text-[#A78BFA] dark:hover:bg-[#2D1A45] focus-visible:ring-[#7C3AED]',
    danger: 'bg-[#DC3545] border border-[#DC3545] text-white hover:bg-red-700 dark:bg-[#7F1D1D] dark:border-[#DC3545]/60 dark:text-[#FCA5A5] dark:hover:bg-[#991B1B] focus-visible:ring-red-500',
    success: 'bg-[#16A36A] border border-[#16A36A] text-white hover:bg-emerald-700 dark:bg-[#064E3B] dark:border-[#059669]/60 dark:text-[#34D399] dark:hover:bg-[#047857] focus-visible:ring-emerald-500',
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
