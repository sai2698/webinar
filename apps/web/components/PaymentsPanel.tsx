'use client';

import { useCallback, useEffect, useState } from 'react';
import { endpoints, ApiError } from '@/lib/api';
import { Button, Badge, StatCard } from '@/components/ui';
import { IconCard, IconChart, IconUsers } from '@/components/admin/icons';

interface AdminPayment {
  id: string;
  amountPaise: number;
  status: string;
  createdAt: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  user: { id: string; name: string; email: string };
  webinar: { id: string; title: string; slug: string } | null;
  kind: 'webinar' | 'course';
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'default' => {
  if (status === 'PAID') return 'success';
  if (status === 'CREATED') return 'warning';
  if (status === 'FAILED') return 'danger';
  return 'default';
};

export function PaymentsPanel({ webinarId }: { webinarId: string }) {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.payments(webinarId);
      setPayments(res.payments as AdminPayment[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load payments');
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refund(payment: AdminPayment) {
    const label = `${rupees(payment.amountPaise)} to ${payment.user.name}`;
    if (!window.confirm(`Refund ${label}?\n\nThis cannot be undone.`)) return;

    setBusy(payment.id);
    setError(null);
    setNotice(null);
    try {
      const res = await endpoints.refundPayment(payment.id);
      setNotice(
        res.full
          ? `Refunded ${rupees(res.amountPaise)} — access revoked.`
          : `Partially refunded ${rupees(res.amountPaise)} — access kept.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Refund failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-500" />
      </div>
    );
  }

  const collected = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amountPaise, 0);
  const refunded = payments
    .filter((p) => p.status === 'REFUNDED')
    .reduce((sum, p) => sum + p.amountPaise, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Collected"
          value={rupees(collected)}
          sub="Gross ticket sales"
          icon={IconCard}
          tone="mint"
        />
        <StatCard
          label="Total Refunded"
          value={rupees(refunded)}
          sub="Processed refunds"
          icon={IconChart}
          tone="live"
        />
        <StatCard
          label="Transactions"
          value={String(payments.length)}
          sub="Payment orders created"
          icon={IconUsers}
          tone="default"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-xs font-semibold text-mint-600 dark:text-mint-400">
          ✓ {notice}
        </div>
      )}

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-xs text-muted">
          No transactions or payments recorded yet for this session.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-panel-2/60 text-[10px] uppercase tracking-wider text-subtle">
                <th className="p-3.5 font-bold">Buyer</th>
                <th className="p-3.5 font-bold">Amount</th>
                <th className="p-3.5 font-bold">Category</th>
                <th className="p-3.5 font-bold">Status</th>
                <th className="p-3.5 font-bold">Date</th>
                <th className="p-3.5 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {payments.map((p) => (
                <tr key={p.id} className="transition hover:bg-panel-2/40">
                  <td className="p-3.5">
                    <p className="font-semibold text-fg">{p.user.name}</p>
                    <p className="text-[11px] text-muted">{p.user.email}</p>
                  </td>
                  <td className="p-3.5 tabular-nums font-bold text-fg">
                    {rupees(p.amountPaise)}
                  </td>
                  <td className="p-3.5 text-muted capitalize">
                    {p.kind === 'course' ? 'Course Offer' : 'Webinar Admission'}
                  </td>
                  <td className="p-3.5">
                    <Badge size="sm" variant={statusBadgeVariant(p.status)}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-muted">{formatDate(p.createdAt)}</td>
                  <td className="p-3.5 text-right">
                    {p.status === 'PAID' && (
                      <Button
                        size="xs"
                        variant="danger"
                        onClick={() => refund(p)}
                        isLoading={busy === p.id}
                      >
                        Refund
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
