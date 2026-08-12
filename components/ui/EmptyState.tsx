import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex min-h-[120px] flex-col items-center justify-center px-5 py-6 text-center">
    {icon && (
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-50)] text-[var(--primary)]">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export default EmptyState;
