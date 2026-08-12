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
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] ${paddings[padding]} ${hover ? 'transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:border-[var(--primary-200)]' : ''} ${className}`}>
      {children}
    </div>
  );
};

export default Card;
