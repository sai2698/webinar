'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { IconCheck, IconLock, IconMail, IconMoon, IconSun } from '@/components/admin/icons';
import { Button, Input } from '@/components/ui';
import { endpoints, ApiError } from '@/lib/api';
import { getToken, writeSession } from '@/lib/session';

export default function AdminLoginPage() {
  return (
    <ThemeProvider>
      <LoginBody />
    </ThemeProvider>
  );
}

function LoginBody() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('admin@webinar.local');
  const [password, setPassword] = useState('Admin@12345');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken('admin');
    if (token) {
      setSignedIn(true);
      router.replace('/admin');
      return;
    }
    setSignedIn(false);
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.login(email.trim(), password);
      writeSession('admin', res.token, res.user);
      router.push('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  function setPreset(presetEmail: string, presetPass: string) {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError(null);
  }

  if (signedIn !== false) {
    return (
      <main
        className={`${theme === 'light' ? 'theme-light' : 'dark'} grid min-h-screen place-items-center bg-surface text-fg`}
      >
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-500" />
          {signedIn ? 'Entering console…' : 'Validating session…'}
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${theme === 'light' ? 'theme-light' : 'dark'} relative flex min-h-screen items-center justify-center bg-surface px-4 py-10 text-fg sm:px-6`}
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-600/15 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[400px] w-[500px] rounded-full bg-accent-500/10 blur-[130px]" />

      {/* Theme switcher */}
      <button
        onClick={toggle}
        className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-xl border border-line bg-panel text-muted shadow-sm transition hover:bg-panel-2 hover:text-fg"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      >
        {theme === 'light' ? <IconMoon className="h-4 w-4" /> : <IconSun className="h-4 w-4" />}
      </button>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-panel shadow-pop lg:grid-cols-[1.05fr_1fr]">
        {/* ── Brand panel ─────────────────────────────────── */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-ink-950 p-9 text-white lg:flex">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent-500/20 blur-3xl" />

          <div className="relative">
            <Logo />
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">
              Enterprise Host &amp; Admin Portal
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
              Run every webinar
              <br />
              from one console.
            </h1>
            <p className="mt-3 max-w-xs text-[12.5px] leading-relaxed text-brand-100/80">
              Schedule sessions, manage registrations, moderate the live room and read the
              numbers afterwards — without leaving the dashboard.
            </p>
          </div>

          <ul className="relative mt-10 space-y-2.5">
            {[
              'Live SFU streaming with co-host controls',
              'Registration, approvals and paid ticketing',
              'Replays, analytics and webhook automation',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[12px] text-brand-100/90">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/15">
                  <IconCheck className="h-2.5 w-2.5" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Form panel ──────────────────────────────────── */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 lg:hidden">
            <Logo />
          </div>

          <div className="mb-6 flex items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-fg">Sign in to your Studio</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Authenticate to manage webinars and stream
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-mint-500/30 bg-mint-500/10 px-2 py-0.5 text-[10px] font-bold text-mint-600 dark:text-mint-400">
              <span className="h-1.5 w-1.5 rounded-full bg-mint-500" />
              Secure
            </span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Host / Admin email"
              placeholder="admin@webinar.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<IconMail className="h-4 w-4" />}
              required
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  className="block text-xs font-semibold uppercase tracking-wider text-muted"
                  htmlFor="password"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-semibold text-subtle transition hover:text-fg"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<IconLock className="h-4 w-4" />}
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11.5px] text-red-600 dark:text-red-400">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={busy}
              className="mt-1 w-full"
            >
              {busy ? 'Authenticating…' : 'Sign in to Console'}
            </Button>
          </form>

          {/* Quick Credential Presets for instant testing */}
          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
              Quick test credentials
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPreset('admin@webinar.local', 'Admin@12345')}
                className="rounded-xl border border-line bg-panel-2/70 p-2.5 text-left transition hover:border-brand-400/50 hover:bg-panel-2"
              >
                <p className="text-[11px] font-bold text-fg">Platform Admin</p>
                <p className="truncate text-[10px] text-muted">admin@webinar.local</p>
              </button>

              <button
                type="button"
                onClick={() => setPreset('host@webinar.local', 'Host@12345')}
                className="rounded-xl border border-line bg-panel-2/70 p-2.5 text-left transition hover:border-brand-400/50 hover:bg-panel-2"
              >
                <p className="text-[11px] font-bold text-fg">Lead Host</p>
                <p className="truncate text-[10px] text-muted">host@webinar.local</p>
              </button>
            </div>
          </div>

          <div className="mt-5 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted transition hover:text-fg"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Return to public website
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
