'use client';

import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}: SwitchProps) {
  return (
    <label
      className={`group flex items-start justify-between gap-3 rounded-xl border border-line bg-panel-2/60 p-3.5 transition select-none ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:bg-panel-2 hover:border-line'
      } ${className}`}
    >
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && <p className="text-xs font-semibold text-fg">{label}</p>}
          {description && (
            <p className="mt-0.5 text-[11px] text-muted leading-relaxed">{description}</p>
          )}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
          checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/20'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${
            checked ? 'translate-x-4.5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

