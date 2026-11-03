'use client';

import React, { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-glow active:scale-[0.98]',
  secondary:
    'bg-panel-2 hover:bg-line text-fg border border-line active:scale-[0.98]',
  accent:
    'bg-gradient-to-b from-accent-400 to-accent-500 hover:from-accent-300 hover:to-accent-400 text-ink-950 font-bold shadow-md active:scale-[0.98]',
  ghost:
    'text-muted hover:text-fg hover:bg-panel-2 border border-transparent active:scale-[0.98]',
  outline:
    'border border-line bg-panel hover:bg-panel-2 text-fg hover:border-brand-500/40 active:scale-[0.98]',
  danger:
    'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20 active:scale-[0.98]',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'h-7 px-2.5 text-[11px] rounded-lg gap-1.5 font-medium',
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5 font-medium',
  md: 'h-9 px-4 text-xs font-semibold rounded-xl gap-2',
  lg: 'h-11 px-5 text-sm font-bold rounded-xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const base =
      'inline-flex items-center justify-center select-none transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer';

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${base} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';

