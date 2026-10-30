'use client';

import { useEffect, useState } from 'react';
import { endpoints, ApiError } from '@/lib/api';

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
      <div className="rounded-2xl border border-line bg-panel p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-500" />
          <span className="text-xs text-muted">Loading Razorpay settings…</span>
        </div>
      </div>
    );
  }

  const isLive = gateway?.mode === 'live' && gateway?.enabled;
  const isTest = gateway?.mode === 'test' && gateway?.enabled;
  const isDisabled = !gateway?.enabled;

  return (
    <div className={`rounded-2xl border border-line bg-panel shadow-card space-y-4 sm:space-y-5 ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-semibold text-fg">Razorpay Gateway Configuration</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                isDisabled
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/20'
                  : isLive
                  ? 'bg-mint-500/15 text-mint-600 dark:text-mint-400 ring-1 ring-mint-500/20'
                  : isTest
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20'
                  : 'bg-panel-2 text-muted ring-1 ring-inset ring-line'
              }`}
            >
              {isDisabled
                ? '🔴 Payments Disabled'
                : isLive
                ? '🟢 Live Mode (Real Payments)'
                : isTest
                ? '🟡 Test Mode (Razorpay Test Keys)'
                : '⚪ Mock Mode (Auto-Enrolls)'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Enter your Razorpay Key ID and Key Secret to capture attendee payments. Each webinar gets its own unique webhook.
          </p>
        </div>

        {gateway?.updatedAt && (
          <span className="text-[11px] text-subtle shrink-0">
            Updated: {new Date(gateway.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-mint-500/20 bg-mint-500/10 p-3 text-xs font-semibold text-mint-600 dark:text-mint-400">
          ✓ {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 max-w-xl">
        {/* Enable / Disable Gateway Toggle */}
        <div className="rounded-xl border border-line bg-panel-2 p-3 sm:p-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-fg">Enable Razorpay Payments</p>
            <p className="text-[11px] text-muted">
              {enabled
                ? 'Attendees can purchase offers & enroll in paid webinars.'
                : 'Online checkout is currently paused for all attendees.'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 dark:bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>

        {/* Key ID */}
        <div>
          <label className="label text-xs font-semibold" htmlFor="rzp-key-id">
            Razorpay Key ID
          </label>
          <input
            id="rzp-key-id"
            type="text"
            className="input w-full py-2 text-xs font-mono"
            placeholder="rzp_test_... or rzp_live_..."
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-subtle">
            Found in{' '}
            <a
              href="https://dashboard.razorpay.com/#/app/keys"
              target="_blank"
              rel="noreferrer"
              className="text-amber-500 hover:underline"
            >
              Razorpay Dashboard → Settings → API Keys
            </a>
            .
          </p>
        </div>

        {/* Key Secret */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label text-xs font-semibold" htmlFor="rzp-key-secret">
              Razorpay Key Secret
            </label>
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="text-[11px] text-amber-500 hover:underline"
            >
              {showSecret ? 'Hide secret' : 'Show secret'}
            </button>
          </div>
          <input
            id="rzp-key-secret"
            type={showSecret ? 'text' : 'password'}
            className="input w-full py-2 text-xs font-mono"
            placeholder={
              gateway?.hasSecret
                ? '•••••••••••••••• (Leave blank to keep existing secret)'
                : 'Enter your Razorpay Key Secret'
            }
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-subtle">
            Used to securely verify payment signatures and webhook events.
          </p>
        </div>

        {/* Webhook Notice */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
          <p className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <span>🔗</span> Per-Webinar Webhooks
          </p>
          <p>
            Each webinar generates its own dedicated Webhook URL so you can track sales and view live payments directly inside the host room.
          </p>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary py-2 px-4 text-xs font-semibold shadow-sm"
          >
            {saving ? 'Saving changes…' : 'Save Razorpay Credentials'}
          </button>
          {gateway?.configured && (
            <span className="text-xs text-muted flex items-center gap-1">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-mint-500" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Configured
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
