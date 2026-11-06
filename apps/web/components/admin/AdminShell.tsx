'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ThemeProvider, useTheme } from '@/lib/theme';
import {
  IconChevron,
  IconClose,
  IconExternal,
  IconLogout,
  IconMenu,
  IconMoon,
  IconSun,
} from '@/components/admin/icons';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Small count pill rendered on the right of the nav row. */
  badge?: string | number;
  /**
   * Sidebar section this row belongs to. Purely presentational — rows keep
   * their original order inside a section, and sections render in the order
   * they are first encountered.
   */
  group?: string;
}

const FALLBACK_GROUP = 'Workspace';

interface AdminShellProps {
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  title: string;
  subtitle?: string;
  /** Right-hand side of the top bar — page-level actions. */
  actions?: React.ReactNode;
  user?: { name: string; role: string } | null;
  onSignOut: () => void;
  children: React.ReactNode;
}

/**
 * Console chrome: fixed left sidebar, sticky top bar, scrolling content.
 *
 * The theme class lives here rather than on `<html>` on purpose. The room,
 * replay and landing pages are dark-only, so scoping the light palette to this
 * subtree means a light console can never wash out a live webinar.
 */
export function AdminShell(props: AdminShellProps) {
  return (
    <ThemeProvider>
      <ShellBody {...props} />
    </ThemeProvider>
  );
}

function ShellBody({
  nav,
  active,
  onNavigate,
  title,
  subtitle,
  actions,
  user,
  onSignOut,
  children,
}: AdminShellProps) {
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Section label -> collapsed. Absent means expanded. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Close the mobile drawer whenever the route changes underneath it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [active]);

  // Escape closes the drawer, matching every other overlay in the app.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const initials = (user?.name ?? 'A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  // Group the flat nav list into sections, preserving first-seen order.
  const sections = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, NavItem[]>();
    for (const item of nav) {
      const group = item.group ?? FALLBACK_GROUP;
      if (!buckets.has(group)) {
        buckets.set(group, []);
        order.push(group);
      }
      buckets.get(group)!.push(item);
    }
    return order.map((group) => ({ group, items: buckets.get(group)! }));
  }, [nav]);

  const activeLabel = nav.find((item) => item.key === active)?.label ?? title;

  return (
    <div
      className={`${theme === 'light' ? 'theme-light' : 'dark'} min-h-screen bg-surface text-fg transition-colors duration-200`}
    >
      <div className="flex min-h-screen">
        {/* ── sidebar ─────────────────────────────────────────── */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-line bg-panel transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            drawerOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full'
          }`}
        >
          {/* Brand block */}
          <div className="flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4">
            <Logo href="/admin" />
            <button
              onClick={() => setDrawerOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-panel-2 hover:text-fg lg:hidden"
              aria-label="Close navigation"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          {/* Workspace switcher */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel-2/70 px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-[11px] font-bold text-white shadow-xs">
                {initials || 'A'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold leading-tight text-fg">
                  {user?.name ?? 'Admin'}
                </p>
                <p className="truncate text-[10px] uppercase tracking-wider text-subtle">
                  {user?.role ?? 'ADMIN'} workspace
                </p>
              </div>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint-500 shadow-[0_0_0_3px_rgba(34,201,138,0.16)]" />
            </div>
          </div>

          {/* Grouped navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {sections.map(({ group, items }) => {
              const isCollapsed = collapsed[group] ?? false;
              return (
                <div key={group} className="mb-1 last:mb-0">
                  <button
                    onClick={() =>
                      setCollapsed((prev) => ({ ...prev, [group]: !isCollapsed }))
                    }
                    className="group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-subtle transition hover:text-muted"
                    aria-expanded={!isCollapsed}
                  >
                    <span className="flex-1 text-left">{group}</span>
                    <IconChevron
                      className={`h-3 w-3 transition-transform duration-200 ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                    />
                  </button>

                  {!isCollapsed && (
                    <div className="mt-0.5 space-y-0.5">
                      {items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.key === active;
                        return (
                          <button
                            key={item.key}
                            onClick={() => onNavigate(item.key)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition ${
                              isActive
                                ? 'bg-brand-500/12 font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/25 dark:text-brand-200'
                                : 'text-muted hover:bg-panel-2 hover:text-fg'
                            }`}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-brand-500" />
                            )}
                            <Icon
                              className={`h-[17px] w-[17px] shrink-0 transition ${
                                isActive
                                  ? 'text-brand-600 dark:text-brand-300'
                                  : 'text-subtle group-hover:text-fg'
                              }`}
                            />
                            <span className="flex-1 truncate text-left">{item.label}</span>
                            {item.badge !== undefined && item.badge !== 0 && (
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                                  isActive
                                    ? 'bg-brand-500 text-white'
                                    : 'bg-panel-2 text-muted group-hover:bg-line'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="shrink-0 border-t border-line/70 p-3">
            <Link
              href="/"
              className="mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-muted transition hover:bg-panel-2 hover:text-fg"
            >
              <IconExternal className="h-[17px] w-[17px] text-subtle" />
              <span className="flex-1">Public site</span>
            </Link>
            <button
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-muted transition hover:bg-red-500/10 hover:text-red-500"
            >
              <IconLogout className="h-[17px] w-[17px]" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Backdrop for the mobile drawer */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            aria-hidden="true"
          />
        )}

        {/* ── main column ─────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-panel/80 backdrop-blur-xl">
            <div className="flex min-h-[68px] items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
              <button
                onClick={() => setDrawerOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:bg-panel-2 hover:text-fg lg:hidden"
                aria-label="Open navigation"
              >
                <IconMenu className="h-4 w-4" />
              </button>

              <div className="min-w-0 flex-1">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-subtle">
                  <span className="hidden sm:inline">Console</span>
                  <IconChevron className="hidden h-2.5 w-2.5 sm:inline" />
                  <span className="truncate text-muted">{activeLabel}</span>
                </div>
                <h1 className="mt-0.5 truncate text-[17px] font-bold leading-tight tracking-tight text-fg">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 hidden truncate text-[11.5px] text-subtle sm:block">
                    {subtitle}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {actions}
                <div className="mx-0.5 hidden h-6 w-px bg-line sm:block" />
                <button
                  onClick={toggle}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted shadow-xs transition hover:bg-panel-2 hover:text-fg"
                  aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                >
                  {theme === 'light' ? (
                    <IconMoon className="h-4 w-4 text-indigo-600" />
                  ) : (
                    <IconSun className="h-4 w-4 text-amber-300" />
                  )}
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
