'use client';

import React from 'react';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-line bg-panel-2/40 px-6 py-14 text-center ${className}`}
    >
      {Icon && (
        <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-500">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h4 className="text-sm font-bold text-fg">{title}</h4>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

