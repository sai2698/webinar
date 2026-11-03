'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { IconMoon, IconSun } from '@/components/admin/icons';
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
      className={`${theme === 'light' ? 'theme-light' : 'dark'} relative flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12 text-fg sm:px-6`}
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-600/15 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[400px] w-[500px] rounded-full bg-accent-500/10 blur-[130px]" />

      {/* Theme switcher */}
      <button
        onClick={toggle}
        className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-xl border border-line bg-panel text-muted transition hover:bg-panel-2 hover:text-fg shadow-sm"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      >
        {theme === 'light' ? <IconMoon className="h-4 w-4" /> : <IconSun className="h-4 w-4" />}
      </button>

      <div className="relative w-full max-w-md">
        {/* Header Branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex justify-center">
            <Logo />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand-400">
            Enterprise Host & Admin Portal
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">
            Sign in to your Studio
          </h1>
        </div>

        {/* Card Box */}
        <div className="overflow-hidden rounded-2xl border border-line bg-panel p-7 shadow-pop sm:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="text-sm font-semibold text-fg">Console Access</h2>
              <p className="text-xs text-muted">Authenticate to manage webinars and stream</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-mint-500/30 bg-mint-500/10 px-2 py-0.5 text-[10px] font-bold text-mint-400">
              <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
              Secure
            </span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Host / Admin Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="admin@webinar.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="mb-1.5 text-xs text-subtle hover:text-fg transition"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400 flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary mt-2 w-full py-3 text-sm font-semibold shadow-glow"
              disabled={busy}
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Authenticating…
                </span>
              ) : (
                'Sign in to Console'
              )}
            </button>
          </form>

          {/* Quick Credential Presets for instant testing */}
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle text-center mb-2.5">
              Quick Test Credentials
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPreset('admin@webinar.local', 'Admin@12345')}
                className="rounded-lg border border-line bg-panel-2 p-2 text-left transition hover:border-brand-400/50 hover:bg-panel"
              >
                <p className="text-[11px] font-bold text-fg">Platform Admin</p>
                <p className="truncate text-[10px] text-muted">admin@webinar.local</p>
              </button>

              <button
                type="button"
                onClick={() => setPreset('host@webinar.local', 'Host@12345')}
                className="rounded-lg border border-line bg-panel-2 p-2 text-left transition hover:border-brand-400/50 hover:bg-panel"
              >
                <p className="text-[11px] font-bold text-fg">Lead Host</p>
                <p className="truncate text-[10px] text-muted">host@webinar.local</p>
              </button>
            </div>
          </div>

          <div className="mt-5 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition font-medium"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Return to Public Website
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
