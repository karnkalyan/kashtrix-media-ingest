import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
  type?: 'table' | 'cards' | 'form';
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 5, type = 'table' }) => {
  if (type === 'cards') {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-7 w-24" />
                <div className="skeleton h-3 w-16" />
              </div>
              <div className="skeleton h-11 w-11 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className="space-y-6">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-3.5 w-24" />
            <div className="skeleton h-10 w-full rounded-[var(--radius-md)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3">
        <div className="flex gap-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-3 w-20" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-8 border-b border-[var(--border)] px-5 py-4 last:border-0">
          <div className="skeleton h-3.5 w-32" />
          <div className="skeleton h-3.5 w-24" />
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-3.5 w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;
