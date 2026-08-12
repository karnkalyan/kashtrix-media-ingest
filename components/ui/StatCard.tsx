import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label?: string };
  loading?: boolean;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, loading = false, className = '' }) => {
  if (loading) {
    return (
      <div className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] ${className}`}>
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-24" />
            <div className="skeleton h-3 w-16" />
          </div>
          <div className="skeleton h-11 w-11 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className={`group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:border-[var(--primary-200)] ${className}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
          <p className="text-[26px] font-extrabold leading-tight text-[var(--text-primary)] tracking-tight">{value}</p>
          {trend && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className={`inline-flex items-center text-[11px] font-bold ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              {trend.label && <span className="text-[11px] text-[var(--text-muted)]">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] via-[var(--primary-light)] to-[var(--accent)] text-white shadow-[var(--shadow-brand)] transition-transform duration-200 group-hover:scale-110">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
