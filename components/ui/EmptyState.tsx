import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    {icon && (
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-50)] text-[var(--primary)]">
        {icon}
      </div>
    )}
    <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
    {description && <p className="mt-1.5 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
