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
      className={`group flex items-start justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 transition select-none ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]'
      } ${className}`}
    >
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && (
            <p className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {label}
            </p>
          )}
          {description && (
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
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
          checked
            ? 'bg-brand-500 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]'
            : 'bg-slate-300 dark:bg-white/20'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-4.5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

