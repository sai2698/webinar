'use client';

import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'brand' | 'live' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default:
    'bg-panel-2 text-muted border border-line',
  brand:
    'bg-brand-500/15 text-brand-600 dark:text-brand-300 border border-brand-500/30',
  live:
    'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-bold',
  success:
    'bg-mint-500/15 text-mint-600 dark:text-mint-400 border border-mint-500/30',
  warning:
    'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  danger:
    'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
  outline:
    'bg-transparent text-fg border border-line',
};

const dotColors: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-muted',
  brand: 'bg-brand-500',
  live: 'bg-red-500',
  success: 'bg-mint-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  outline: 'bg-fg',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
  ...props
}: BadgeProps) {
  const isLive = variant === 'live';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full select-none uppercase tracking-wider font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-0.5 text-[10px]'
      } ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {(dot || isLive) && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {isLive && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}

