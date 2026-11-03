'use client';

import { useEffect, useState } from 'react';
import { endpoints, ApiError } from '@/lib/api';
import { Button, Input, Switch, Badge, Card } from '@/components/ui';

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
            <h3 className="text-sm font-bold text-fg">Razorpay Gateway Configuration</h3>
            <Badge
              variant={
                isDisabled
                  ? 'danger'
                  : isLive
                  ? 'success'
                  : isTest
                  ? 'warning'
                  : 'default'
              }
              dot
            >
              {isDisabled
                ? 'Payments Paused'
                : isLive
                ? 'Live Mode (Production)'
                : isTest
                ? 'Test Mode (Sandboxed)'
                : 'Mock Mode (Auto-Enroll)'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Configure your Razorpay Key ID and Secret to collect ticket fees and flash offers in real time.
          </p>
        </div>

        {gateway?.updatedAt && (
          <span className="text-[11px] text-subtle shrink-0">
            Updated: {new Date(gateway.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-mint-500/30 bg-mint-500/10 p-3 text-xs font-semibold text-mint-600 dark:text-mint-400">
          ✓ {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 max-w-xl">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="Enable Razorpay In-Stream Payments"
          description={
            enabled
              ? 'Attendees can purchase offers & enroll in paid sessions.'
              : 'Online checkouts are currently disabled for all attendees.'
          }
        />

        <Input
          label="Razorpay Key ID"
          id="rzp-key-id"
          type="text"
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          placeholder="rzp_test_... or rzp_live_..."
          helperText="Available in Razorpay Dashboard → Settings → API Keys"
        />

        <div>
          <Input
            label="Razorpay Key Secret"
            id="rzp-key-secret"
            type={showSecret ? 'text' : 'password'}
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            placeholder={gateway?.hasSecret ? '••••••••••••••••••••••••' : 'Paste Key Secret'}
            rightElement={
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="text-xs font-medium text-subtle hover:text-fg transition"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            }
            helperText={
              gateway?.hasSecret
                ? 'A secret is currently active. Enter a new secret only to replace it.'
                : 'Required to securely authenticate Razorpay webhook events.'
            }
          />
        </div>

        <div className="pt-2 flex items-center gap-3">
          <Button type="submit" variant="primary" isLoading={saving}>
            Save Razorpay Settings
          </Button>

          {gateway?.hasSecret && (
            <span className="text-xs text-mint-600 dark:text-mint-400 font-medium">
              ✓ Active secret verified
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
