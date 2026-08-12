import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  className?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = '',
}: TabsProps<T>) {
  return (
    <div className={`flex border-b border-[#E8DFF0] ${className}`}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative flex h-[38px] items-center gap-2 border-b-2 px-4 text-[13px] font-medium transition-colors ${
              isActive
                ? 'border-[#6D32D9] text-[#351147] font-semibold'
                : 'border-transparent text-[#6F6078] hover:text-[#1B1024]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                isActive ? 'bg-[#F4EEFF] text-[#4A1B7A]' : 'bg-[#F8F7FA] text-[#6F6078]'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
