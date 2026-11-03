'use client';

import React from 'react';

export interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'live' | 'mint' | 'accent';
  className?: string;
}

const toneStyles = {
  default: 'bg-brand-500/15 text-brand-600 dark:text-brand-400',
  live: 'bg-red-500/15 text-red-600 dark:text-red-400',
  mint: 'bg-mint-500/15 text-mint-600 dark:text-mint-400',
  accent: 'bg-accent-500/15 text-accent-600 dark:text-accent-400',
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  className = '',
}: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-panel p-5 shadow-card transition-all duration-200 hover:border-brand-500/30 hover:shadow-pop ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-fg">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted truncate">{sub}</p>}
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneStyles[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

