'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 opacity-0 ${className}`}
        aria-hidden="true"
      />
    );
  }

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggle}
      className={`relative grid h-8 w-8 place-items-center rounded-xl border transition-all duration-200 active:scale-95 ${
        isLight
          ? 'border-line bg-panel text-amber-500 shadow-sm hover:bg-panel-2 hover:border-brand-300'
          : 'border-white/10 bg-white/5 text-amber-300 hover:border-white/20 hover:bg-white/10 hover:text-amber-200'
      } ${className}`}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {isLight ? (
        // Moon icon when light to switch to dark
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-indigo-600 transition-transform duration-200 group-hover:rotate-12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun icon when dark to switch to light
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-amber-300 transition-transform duration-200 group-hover:rotate-45"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </button>
  );
}

