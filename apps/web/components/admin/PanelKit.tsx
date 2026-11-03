'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { Button, EmptyState, Switch } from '@/components/ui';

/**
 * Shared furniture for all parity panels.
 * Standardized on our modern UI framework for consistent aesthetics in light & dark themes.
 */

export function PanelSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function PanelNote({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: React.ReactNode;
}) {
  const tones = {
    info: 'border-line bg-panel-2 text-muted',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
    success: 'border-mint-500/30 bg-mint-500/10 text-mint-600 dark:text-mint-300',
  } as const;

  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed font-medium ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  if (typeof children === 'string') {
    return <EmptyState title={children} className="py-8" />;
  }
  return <div className="py-8 text-center text-xs text-muted">{children}</div>;
}

export function PanelButton({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const vMap = {
    primary: 'primary',
    ghost: 'secondary',
    danger: 'danger',
  } as const;

  return (
    <Button
      type={type}
      size="sm"
      variant={vMap[variant] || 'secondary'}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  );
}

export function PanelInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`h-8.5 rounded-xl border border-line bg-panel px-3 text-xs text-fg outline-none transition placeholder:text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${className}`}
    />
  );
}

export function PanelToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      label={label}
      description={hint}
    />
  );
}

/**
 * Fetch-on-mount with a manual refresh.
 *
 * `reload` is returned so a mutation can re-read the server's view rather than
 * patching local state — the server is the source of truth for derived fields
 * like counts and hints, and guessing them locally drifts.
 */
export function usePanelData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await run();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this panel');
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** Turns an unknown thrown value into something worth showing a human. */
export function errorText(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Copies text to the clipboard, tolerating a browser that refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
