'use client';

import { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/roomStore';
import { endpoints } from '@/lib/api';
import { currentSocket } from '@/lib/socket';
import { formatPrice, loadRazorpay } from '@/components/CtaOverlay';
import type { CtaFormField } from '@webinar/shared';

export function ChatCtaNotification() {
  const cta = useRoomStore((s) => s.activeCta);
  const role = useRoomStore((s) => s.role);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBigView, setIsBigView] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isStaff = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';

  // Whenever a new offer is launched, show it and reset state
  useEffect(() => {
    if (cta) {
      setIsMinimized(false);
      setDone(false);
      setIsBigView(Boolean(cta.expanded));
      setError(null);
      setAnswers({});
      setFieldErrors({});
    }
  }, [cta?.id]);

  // When the host expands or collapses the offer at the participant end
  useEffect(() => {
    if (cta?.expanded !== undefined) {
      setIsBigView(Boolean(cta.expanded));
      if (cta.expanded) {
        setIsMinimized(false);
      }
    }
  }, [cta?.expanded]);

  if (!cta || isStaff) return null;

  function reportClick(responses?: Record<string, unknown>) {
    currentSocket()?.emit('ctaClick', { ctaId: cta!.id, responses }, () => {});
  }

  function handleOpenBig() {
    reportClick();
    setIsBigView(true);
  }

  function handleCloseBig() {
    setIsBigView(false);
    setError(null);
  }

  function validate(): boolean {
    const form = cta!.form;
    if (!form) return true;

    const errs: Record<string, string> = {};
    for (const field of form.fields) {
      const value = answers[field.id];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        value === false;

      if (field.isRequired && empty) {
        errs[field.id] = 'This field is required';
        continue;
      }
      if (empty) continue;

      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        errs[field.id] = 'Enter a valid email address';
      }
      if (field.type === 'phone' && !/^[+]?[\d\s()-]{6,20}$/.test(String(value))) {
        errs[field.id] = 'Enter a valid phone number';
      }
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function onSubmit() {
    if (cta!.form && cta!.form.fields.length > 0) {
      if (!validate()) return;
    }
    reportClick(answers);
    void enroll(answers);
  }

  async function enroll(responses: Record<string, unknown>) {
    if (!cta) return;
    setBusy(true);
    setError(null);
    try {
      if (cta.externalUrl) {
        window.open(cta.externalUrl, '_blank', 'noopener');
        setDone(true);
        return;
      }

      const order = await endpoints.createOrder({ ctaId: cta.id });

      if (order.mock) {
        await endpoints.verifyPayment({
          razorpayOrderId: order.orderId,
          razorpayPaymentId: `pay_mock_${Date.now()}`,
          razorpaySignature: `mock_${order.orderId}`,
        });
        setDone(true);
        return;
      }

      await loadRazorpay();
      const RazorpayCtor = window.Razorpay;
      if (!RazorpayCtor) throw new Error('Razorpay checkout failed to load');

      const rzp = new RazorpayCtor({
        key: order.keyId!,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'NexaLive',
        description: cta.title,
        notes: Object.fromEntries(
          Object.entries(responses).map(([k, v]) => [k, String(v)])
        ),
        theme: { color: '#f59e0b' },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          await endpoints.verifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setDone(true);
        },
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout');
    } finally {
      setBusy(false);
    }
  }

  const form = cta.form;
  const hasForm = Boolean(form && form.fields.length > 0);

  /* ─────────────────────────────────────────────────────────────
   * 1. BIG VIEW (opens in place of the chat window on click)
   * ───────────────────────────────────────────────────────────── */
  if (isBigView) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-ink-950 text-slate-900 dark:text-white animate-fade-in overflow-hidden">
        {/* Big View Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-4 py-3 bg-slate-50 dark:bg-ink-900/80 shrink-0">
          <button
            onClick={handleCloseBig}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to chat
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/15 dark:bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              {cta.priceInPaise > 0 ? formatPrice(cta.priceInPaise, cta.currency) : 'FREE'}
            </span>
            <button
              onClick={handleCloseBig}
              aria-label="Close offer view"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Big View Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {done ? (
            <div className="py-8 text-center space-y-3">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint-500/20 text-mint-500 text-3xl">
                ✓
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                You&apos;re enrolled! 🎉
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs mx-auto">
                Congratulations! You now have access to <span className="font-semibold text-slate-800 dark:text-slate-200">{cta.title}</span>.
              </p>
              <button
                onClick={handleCloseBig}
                className="btn-primary mt-4 px-6 py-2 text-xs font-semibold"
              >
                Return to Live Chat
              </button>
            </div>
          ) : (
            <>
              {/* Offer Header Card */}
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/20 text-amber-500 text-sm">
                    🎁
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Featured Webinar Offer
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  {cta.title}
                </h3>
                {cta.description && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
                    {cta.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-amber-500/20">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Offer Price:</span>
                  <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                    {cta.priceInPaise > 0 ? formatPrice(cta.priceInPaise, cta.currency) : 'Free'}
                  </span>
                </div>
              </div>

              {/* Form Fields (if host enabled pre-payment form) */}
              {hasForm && form && (
                <div className="space-y-3 pt-1">
                  <div className="border-b border-slate-200 dark:border-white/10 pb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Participant Details
                    </h4>
                    {form.intro && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {form.intro}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    {form.fields.map((field) => (
                      <div key={field.id} className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {field.label}
                          {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            className="input w-full py-2 text-xs rounded-xl"
                            placeholder={field.placeholder ?? undefined}
                            value={String(answers[field.id] ?? '')}
                            onChange={(e) => {
                              setAnswers((a) => ({ ...a, [field.id]: e.target.value }));
                              if (fieldErrors[field.id]) setFieldErrors((fe) => ({ ...fe, [field.id]: '' }));
                            }}
                          />
                        ) : field.type === 'select' ? (
                          <select
                            className="input w-full py-2 text-xs rounded-xl"
                            value={String(answers[field.id] ?? '')}
                            onChange={(e) => {
                              setAnswers((a) => ({ ...a, [field.id]: e.target.value }));
                              if (fieldErrors[field.id]) setFieldErrors((fe) => ({ ...fe, [field.id]: '' }));
                            }}
                          >
                            <option value="">{field.placeholder ?? 'Select an option'}</option>
                            {field.options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : field.type === 'checkbox' ? (
                          <label className="flex items-center gap-2 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 dark:border-white/20 text-amber-500 focus:ring-amber-500"
                              checked={Boolean(answers[field.id])}
                              onChange={(e) => {
                                setAnswers((a) => ({ ...a, [field.id]: e.target.checked }));
                                if (fieldErrors[field.id]) setFieldErrors((fe) => ({ ...fe, [field.id]: '' }));
                              }}
                            />
                            <span>{field.placeholder ?? field.label}</span>
                          </label>
                        ) : (
                          <input
                            type={
                              field.type === 'number'
                                ? 'number'
                                : field.type === 'email'
                                ? 'email'
                                : field.type === 'phone'
                                ? 'tel'
                                : 'text'
                            }
                            className="input w-full py-2 text-xs rounded-xl"
                            placeholder={field.placeholder ?? undefined}
                            value={String(answers[field.id] ?? '')}
                            onChange={(e) => {
                              setAnswers((a) => ({ ...a, [field.id]: e.target.value }));
                              if (fieldErrors[field.id]) setFieldErrors((fe) => ({ ...fe, [field.id]: '' }));
                            }}
                          />
                        )}
                        {fieldErrors[field.id] && (
                          <p className="text-[10px] font-medium text-red-500">{fieldErrors[field.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Big View Footer Actions */}
        {!done && (
          <div className="border-t border-slate-200 dark:border-white/10 p-3 sm:p-4 bg-slate-50 dark:bg-ink-900/90 shrink-0 space-y-2">
            {error && (
              <p className="text-center text-xs font-semibold text-red-500 bg-red-500/10 rounded-lg py-1.5 px-2">
                {error}
              </p>
            )}
            <button
              onClick={onSubmit}
              disabled={busy}
              className="btn-accent w-full py-2.5 sm:py-3 text-sm font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
              ) : (
                <>
                  <span>
                    {hasForm && form?.submitText
                      ? form.submitText
                      : cta.buttonText || 'Enroll Now'}
                  </span>
                  {cta.priceInPaise > 0 && (
                    <span className="opacity-90 font-medium">
                      · {formatPrice(cta.priceInPaise, cta.currency)}
                    </span>
                  )}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
            <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">
              🔒 Instant confirmation &amp; access
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
   * 2. MINIMIZED STATE (compact 1-line top banner)
   * ───────────────────────────────────────────────────────────── */
  if (isMinimized) {
    return (
      <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 flex items-center justify-between text-xs animate-fade-in">
        <div
          onClick={handleOpenBig}
          className="flex items-center gap-1.5 min-w-0 cursor-pointer hover:opacity-80 transition"
        >
          <span className="text-sm">🎁</span>
          <span className="truncate font-semibold text-slate-800 dark:text-amber-200">
            {cta.title}
          </span>
          {cta.priceInPaise > 0 && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              {formatPrice(cta.priceInPaise, cta.currency)}
            </span>
          )}
        </div>
        <button
          onClick={handleOpenBig}
          className="ml-2 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
        >
          View offer
        </button>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
   * 3. DEFAULT BANNER NOTIFICATION (pinned at top of chat window)
   * ───────────────────────────────────────────────────────────── */
  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-gradient-to-br from-amber-50 via-orange-50/50 to-white dark:from-amber-950/40 dark:via-ink-900/90 dark:to-ink-950 p-3 shadow-sm transition-all animate-fade-in relative z-10">
      {/* Top Header Badge */}
      <div className="flex items-center justify-between gap-2">
        <div
          onClick={handleOpenBig}
          className="flex items-center gap-1.5 min-w-0 cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Special Offer
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-amber-500/15 dark:bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            {cta.priceInPaise > 0 ? formatPrice(cta.priceInPaise, cta.currency) : 'FREE'}
          </span>
          <button
            onClick={() => setIsMinimized(true)}
            aria-label="Minimize offer banner"
            title="Minimize"
            className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Title & Description Clickable to Open Big View */}
      <div
        onClick={handleOpenBig}
        className="mt-1.5 cursor-pointer group"
      >
        <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
          {cta.title}
        </h4>
        {cta.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2">
            {cta.description}
          </p>
        )}
      </div>

      {/* Button to Open Big View / Fill Form */}
      <div className="mt-2.5">
        <button
          onClick={handleOpenBig}
          className="btn-accent w-full py-2 text-xs font-bold shadow-sm hover:shadow transition flex items-center justify-center gap-1.5"
        >
          <span>{hasForm ? 'Fill Details & Enroll' : (cta.buttonText || 'Claim Offer')}</span>
          {cta.priceInPaise > 0 && (
            <span className="opacity-90 font-medium">
              · {formatPrice(cta.priceInPaise, cta.currency)}
            </span>
          )}
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 ml-0.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
