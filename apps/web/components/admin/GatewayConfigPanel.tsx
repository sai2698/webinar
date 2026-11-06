'use client';

import { useEffect, useState } from 'react';
import { endpoints, ApiError } from '@/lib/api';
import { Switch } from '@/components/ui';

export interface GatewayStatus {
  configured: boolean;
  enabled: boolean;
  active: boolean;
  keyId: string;
  maskedKeyId: string;
  hasSecret: boolean;
  mode: 'mock' | 'test' | 'live';
  updatedAt?: string;
}

interface GatewayConfigPanelProps {
  onSaved?: () => void;
  compact?: boolean;
}

export function GatewayConfigPanel({ onSaved, compact = false }: GatewayConfigPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.paymentGateway();
      const gw = res.gateway as GatewayStatus;
      setGateway(gw);
      setKeyId(gw.keyId || '');
      setEnabled(gw.enabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load payment gateway settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await endpoints.savePaymentGateway({
        keyId: keyId.trim(),
        keySecret: keySecret.trim(),
        enabled,
      });
      const gw = res.gateway as GatewayStatus;
      setGateway(gw);
      setKeySecret(''); // Clear secret input after save for security
      setSuccess('Razorpay settings saved successfully!');
      if (onSaved) onSaved();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save payment gateway configuration');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2.5">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-brand-500" />
          <span className="text-[11px] text-slate-500">Loading Razorpay settings…</span>
        </div>
      </div>
    );
  }

  const isLive = gateway?.mode === 'live' && gateway?.enabled;
  const isTest = gateway?.mode === 'test' && gateway?.enabled;
  const isDisabled = !gateway?.enabled;

  const statusLabel = isDisabled
    ? 'Payments paused'
    : isLive
      ? 'Live mode'
      : isTest
        ? 'Test mode'
        : 'Mock mode';
  const statusTone = isDisabled
    ? 'bg-red-500/15 text-red-600 ring-red-500/25 dark:text-red-400'
    : isLive
      ? 'bg-mint-500/15 text-mint-600 ring-mint-500/25 dark:text-mint-400'
      : isTest
        ? 'bg-amber-500/15 text-amber-600 ring-amber-500/25 dark:text-amber-400'
        : 'bg-slate-500/15 text-slate-600 ring-slate-500/25 dark:text-slate-300';

  return (
    <div className={`space-y-4 rounded-lg border border-white/[0.08] bg-white/[0.02] ${compact ? 'p-3.5' : 'p-4 sm:p-5'}`}>
      <div className="flex flex-col justify-between gap-2.5 border-b border-white/[0.07] pb-3.5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Razorpay gateway configuration
            </h3>
            <span
              className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ring-1 ${statusTone}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            Configure your Razorpay Key ID and Secret to collect ticket fees and flash offers in real time.
          </p>
        </div>

        {gateway?.updatedAt && (
          <span className="shrink-0 text-[9px] tabular-nums text-slate-500">
            Updated {new Date(gateway.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/25 bg-red-500/[0.08] px-2.5 py-1.5 text-[10px] font-medium text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-1.5 rounded-md border border-mint-500/25 bg-mint-500/[0.08] px-2.5 py-1.5 text-[10px] font-semibold text-mint-600 dark:text-mint-400">
          <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-xl space-y-3.5">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="Enable Razorpay in-stream payments"
          description={
            enabled
              ? 'Attendees can purchase offers & enroll in paid sessions.'
              : 'Online checkouts are currently disabled for all attendees.'
          }
        />

        <div>
          <label
            htmlFor="rzp-key-id"
            className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500"
          >
            Razorpay Key ID
          </label>
          <input
            id="rzp-key-id"
            type="text"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="rzp_test_... or rzp_live_..."
            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Available in Razorpay Dashboard → Settings → API Keys
          </p>
        </div>

        <div>
          <label
            htmlFor="rzp-key-secret"
            className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500"
          >
            Razorpay Key Secret
          </label>
          <div className="relative">
            <input
              id="rzp-key-secret"
              type={showSecret ? 'text' : 'password'}
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              placeholder={gateway?.hasSecret ? '••••••••••••••••••••••••' : 'Paste Key Secret'}
              className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-14 font-mono text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-[10px] font-semibold tracking-tight text-slate-500 transition hover:bg-white/[0.08] hover:text-slate-700 dark:hover:text-slate-200"
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {gateway?.hasSecret
              ? 'A secret is currently active. Enter a new secret only to replace it.'
              : 'Required to securely authenticate Razorpay webhook events.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-brand-400 to-brand-600 px-3 py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            Save Razorpay settings
          </button>

          {gateway?.hasSecret && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-mint-600 dark:text-mint-400">
              <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Active secret verified
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
