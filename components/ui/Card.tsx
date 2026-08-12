import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', hover = false }) => {
  const paddings: Record<string, string> = {
    none: '',
    sm: 'p-3.5',
    md: 'p-4',
    lg: 'p-4',
  };

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] ${paddings[padding]} ${hover ? 'transition-colors duration-150 hover:border-[var(--primary-200)]' : ''} ${className}`}>
      {children}
    </div>
  );
};

export default Card;
