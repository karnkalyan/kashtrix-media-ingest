import React from 'react';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string | number;
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-1 scrollbar-hide ${className}`}
      role="tablist"
    >
      {options.map(opt => {
        const isActive = opt.value === value;
        const Icon = opt.icon;

        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={`flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 ${
              size === 'sm' ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]'
            } ${
              isActive
                ? 'bg-[#7C3AED] text-white font-semibold shadow-xs dark:bg-[#7C3AED] dark:text-white'
                : 'text-[#6F6078] hover:bg-[#F4EEFF]/60 hover:text-[#1B1024] dark:text-[#B9A5CD] dark:hover:bg-[#2D1A45] dark:hover:text-white'
            }`}
          >
            {Icon && <Icon size={size === 'sm' ? 13 : 14} className={isActive ? 'text-white' : 'text-[#6F6078] dark:text-[#B9A5CD]'} />}
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-[#E8DFF0] text-[#6F6078] dark:bg-[#371F59] dark:text-[#B9A5CD]'
              }`}>
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
