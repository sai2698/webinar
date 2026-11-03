'use client';

import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number | string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
  variant?: 'pill' | 'underline';
}

export function Tabs<T extends string = string>({
  tabs,
  active,
  onChange,
  className = '',
  variant = 'pill',
}: TabsProps<T>) {
  if (variant === 'underline') {
    return (
      <div className={`flex border-b border-line gap-4 ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition -mb-px ${
                isActive
                  ? 'border-brand-500 text-brand-600 dark:text-brand-300'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                    isActive ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300' : 'bg-panel-2 text-subtle'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel p-1 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isActive
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-muted hover:bg-panel-2 hover:text-fg'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-line text-subtle'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

