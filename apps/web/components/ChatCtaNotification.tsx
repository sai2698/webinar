'use client';

import { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/roomStore';
import { endpoints } from '@/lib/api';
import { currentSocket } from '@/lib/socket';
import { formatPrice, loadRazorpay } from '@/components/CtaOverlay';
import { getUser } from '@/lib/session';
import type { CtaFormField } from '@webinar/shared';

export function ChatCtaNotification() {
  const cta = useRoomStore((s) => s.activeCta);
  const role = useRoomStore((s) => s.role);
  const selfName = useRoomStore((s) => s.name);

  const [step, setStep] = useState<'review' | 'details'>('review');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasMockOrder, setWasMockOrder] = useState(false);
  const [isBigView, setIsBigView] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Participant details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  // Auto-sync known contact details with custom form fields matching name, email, phone
  useEffect(() => {
    const fields: CtaFormField[] = cta?.form?.fields || [];
    if (fields.length > 0) {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const f of fields) {
          if (next[f.id] === undefined || next[f.id] === '') {
            if (/email/i.test(f.label) || f.type === 'email') {
              if (email) next[f.id] = email;
            } else if (/phone|mobile/i.test(f.label) || f.type === 'phone') {
              if (phone) next[f.id] = phone;
            } else if (/name/i.test(f.label)) {
              if (name) next[f.id] = name;
            }
          }
        }
        return next;
      });
    }
  }, [cta?.id, email, phone, name]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isStaff = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';

  // Initialize or reset when CTA changes
  useEffect(() => {
    if (cta) {
      setIsMinimized(false);
      setDone(false);
      setStep('review');
      setIsBigView(Boolean(cta.expanded));
      setError(null);
      setFieldErrors({});

      // Pre-fill user details if available
      const user = getUser('participant') || getUser('admin');
      setName(selfName || user?.name || '');
      setEmail(user?.email || '');
      setPhone('');
      setAnswers({});
    }
  }, [cta?.id, selfName]);

  // When the host expands or collapses the offer at the participant end
  useEffect(() => {
    if (cta?.expanded !== undefined) {
      setIsBigView(Boolean(cta.expanded));
      if (cta.expanded) {
        setIsMinimized(false);
        setStep('review');
      }
    }
  }, [cta?.expanded]);

  if (!cta || isStaff) return null;

  function reportClick(responses?: Record<string, unknown>) {
    currentSocket()?.emit('ctaClick', { ctaId: cta!.id, responses }, () => {});
  }

  function handleOpenBig() {
    reportClick();
    setStep('review');
    setIsBigView(true);
  }

  function handleCloseBig() {
    setIsBigView(false);
    setError(null);
  }

  // Calculate pricing breakdown with GST (18%)
  const totalRupees = cta.priceInPaise > 0 ? cta.priceInPaise / 100 : 0;
  const isFree = totalRupees <= 0;
  const basePriceRupees = isFree ? 0 : Math.round((totalRupees / 1.18) * 100) / 100;
  const gstRupees = isFree ? 0 : Math.round((totalRupees - basePriceRupees) * 100) / 100;

  function formatInr(val: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: cta?.currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  }

  function validateDetails(): boolean {
    const errs: Record<string, string> = {};
    const fields: CtaFormField[] = cta?.form?.fields || [];

    const hasCustomName = fields.some((f: CtaFormField) => /name/i.test(f.label));
    const hasCustomEmail = fields.some((f: CtaFormField) => f.type === 'email' || /email/i.test(f.label));
    const hasCustomPhone = fields.some((f: CtaFormField) => f.type === 'phone' || /phone|mobile/i.test(f.label));

    // Validate standard name if not asked in custom fields
    if (!hasCustomName) {
      if (!name.trim()) errs.name = 'Full name is required';
    }

    // Validate standard email if not asked in custom fields
    if (!hasCustomEmail) {
      if (!email.trim()) {
        errs.email = 'Email address is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errs.email = 'Enter a valid email address';
      }
    }

    // Validate standard phone if not asked in custom fields
    if (!hasCustomPhone && phone.trim()) {
      if (!/^[+]?[\d\s()-]{6,20}$/.test(phone.trim())) {
        errs.phone = 'Enter a valid phone number';
      }
    }

    // Validate custom fields per offer
    for (const field of fields) {
      let val = answers[field.id];
      // Fallback sync with prefill contact info
      if (val === undefined || val === null || val === '') {
        if (/email/i.test(field.label) || field.type === 'email') val = email.trim();
        else if (/phone|mobile/i.test(field.label) || field.type === 'phone') val = phone.trim();
        else if (/name/i.test(field.label)) val = name.trim();
      }

      const empty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        val === false ||
        (Array.isArray(val) && val.length === 0);

      if (field.isRequired && empty) {
        errs[field.id] = `${field.label} is required`;
        continue;
      }
      if (empty) continue;

      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) {
        errs[field.id] = 'Enter a valid email address';
      }
      if (field.type === 'phone' && !/^[+]?[\d\s()-]{6,20}$/.test(String(val).trim())) {
        errs[field.id] = 'Enter a valid phone number';
      }
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleProceedToPayment() {
    if (!validateDetails()) return;

    const fields: CtaFormField[] = cta?.form?.fields || [];
    const finalAnswers: Record<string, unknown> = { ...answers };

    // Ensure all contact fields are mapped to custom fields
    for (const f of fields) {
      if (finalAnswers[f.id] === undefined || finalAnswers[f.id] === '') {
        if (/email/i.test(f.label) || f.type === 'email') {
          finalAnswers[f.id] = email.trim();
        } else if (/phone|mobile/i.test(f.label) || f.type === 'phone') {
          finalAnswers[f.id] = phone.trim();
        } else if (/name/i.test(f.label)) {
          finalAnswers[f.id] = name.trim();
        }
      }
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      ...finalAnswers,
    };

    reportClick(finalAnswers);
    void enroll(payload);
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

      let order: any;
      try {
        order = await endpoints.createOrder({ ctaId: cta.id, responses });
      } catch (err: any) {
        setError(err instanceof Error ? err.message : 'Online checkout is currently unavailable');
        setBusy(false);
        return;
      }

      if (order.mock) {
        setWasMockOrder(true);
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
        prefill: {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          contact: phone.trim() || undefined,
        },
        notes: Object.fromEntries(
          Object.entries(responses).map(([k, v]) => [k, String(v)])
        ),
        theme: { color: '#f59e0b' },
        modal: {
          ondismiss: () => {
            setBusy(false);
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await endpoints.verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setDone(true);
          } catch (err: any) {
            setError(err instanceof Error ? err.message : 'Could not verify payment');
          } finally {
            setBusy(false);
          }
        },
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment checkout');
      setBusy(false);
    }
  }

  const form = cta.form;
  const customFields = form?.fields || [];

  /* ─────────────────────────────────────────────────────────────
   * 1. BIG VIEW (Opens in place of chat window)
   * ───────────────────────────────────────────────────────────── */
  if (isBigView) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-ink-950 text-slate-900 dark:text-white animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-4 py-3 bg-slate-50 dark:bg-ink-900/80 shrink-0">
          <button
            onClick={() => {
              if (step === 'details' && !done) {
                setStep('review');
              } else {
                handleCloseBig();
              }
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {step === 'details' && !done ? 'Back to price' : 'Back to chat'}
          </button>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/15 dark:bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              {isFree ? 'FREE' : formatPrice(cta.priceInPaise, cta.currency)}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {done ? (
            <div className="py-8 text-center space-y-3">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-mint-500/20 text-mint-500 text-3xl">
                ✓
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                You&apos;re enrolled! 🎉
              </h3>
              {wasMockOrder && (
                <div className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20">
                  🧪 Demo Mock Order (Host Razorpay Keys Not Configured)
                </div>
              )}
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
          ) : step === 'review' ? (
            /* STEP 1: Title, Description, Base Price, GST, Total */
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/20 text-amber-500 text-sm">
                    🎓
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Course Offer
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
              </div>

              {/* Price Breakdown Card */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Price Breakdown
                </h4>

                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Base Price</span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {isFree ? '₹0.00' : formatInr(basePriceRupees)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>GST (18%)</span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {isFree ? '₹0.00' : formatInr(gstRupees)}
                  </span>
                </div>

                <div className="border-t border-slate-200 dark:border-white/10 pt-2 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">
                  <span>Total (incl. GST)</span>
                  <span className="text-base text-amber-600 dark:text-amber-400">
                    {isFree ? 'Free' : formatInr(totalRupees)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 2: Ask for Details */
            <div className="space-y-4">
              <div className="border-b border-slate-200 dark:border-white/10 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Enter Your Details
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Please provide your contact information to receive your course access and invoice.
                </p>
              </div>

              <div className="space-y-3">
                {/* Standard Full Name (shown if not asked in customFields) */}
                {!customFields.some((f) => /name/i.test(f.label)) && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="input w-full py-2 text-xs rounded-xl"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (fieldErrors.name) setFieldErrors((fe) => ({ ...fe, name: '' }));
                      }}
                    />
                    {fieldErrors.name && (
                      <p className="text-[10px] font-medium text-red-500">{fieldErrors.name}</p>
                    )}
                  </div>
                )}

                {/* Standard Email Address (shown if not asked in customFields) */}
                {!customFields.some((f) => f.type === 'email' || /email/i.test(f.label)) && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      className="input w-full py-2 text-xs rounded-xl"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((fe) => ({ ...fe, email: '' }));
                      }}
                    />
                    {fieldErrors.email && (
                      <p className="text-[10px] font-medium text-red-500">{fieldErrors.email}</p>
                    )}
                  </div>
                )}

                {/* Standard Phone Number (shown if not asked in customFields) */}
                {!customFields.some((f) => f.type === 'phone' || /phone|mobile/i.test(f.label)) && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      className="input w-full py-2 text-xs rounded-xl"
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (fieldErrors.phone) setFieldErrors((fe) => ({ ...fe, phone: '' }));
                      }}
                    />
                    {fieldErrors.phone && (
                      <p className="text-[10px] font-medium text-red-500">{fieldErrors.phone}</p>
                    )}
                  </div>
                )}

                {/* Offer-specific custom form fields configured by host */}
                {customFields.map((field) => {
                  const isPhoneField = field.type === 'phone' || /phone|mobile/i.test(field.label);
                  const isEmailField = field.type === 'email' || /email/i.test(field.label);
                  const isNameField = /name/i.test(field.label);
                  const currentValue = String(
                    answers[field.id] ?? (isPhoneField ? phone : isEmailField ? email : isNameField ? name : '')
                  );

                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {field.label}
                        {field.isRequired && <span className="ml-0.5 text-red-500">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={2}
                          className="input w-full py-2 text-xs rounded-xl"
                          placeholder={field.placeholder ?? undefined}
                          value={currentValue}
                          onChange={(e) => {
                            setAnswers((a) => ({ ...a, [field.id]: e.target.value }));
                            if (fieldErrors[field.id]) setFieldErrors((fe) => ({ ...fe, [field.id]: '' }));
                          }}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          className="input w-full py-2 text-xs rounded-xl"
                          value={currentValue}
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
                          type={isPhoneField ? 'tel' : isEmailField ? 'email' : field.type === 'number' ? 'number' : 'text'}
                          className="input w-full py-2 text-xs rounded-xl"
                          placeholder={field.placeholder ?? (isPhoneField ? 'Enter mobile number' : isEmailField ? 'Enter email address' : undefined)}
                          value={currentValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnswers((a) => ({ ...a, [field.id]: val }));
                            if (isPhoneField) setPhone(val);
                            if (isEmailField) setEmail(val);
                            if (isNameField) setName(val);
                            if (fieldErrors[field.id]) setFieldErrors((fe) => ({ ...fe, [field.id]: '' }));
                          }}
                        />
                      )}
                      {fieldErrors[field.id] && (
                        <p className="text-[10px] font-medium text-red-500">{fieldErrors[field.id]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!done && (
          <div className="border-t border-slate-200 dark:border-white/10 p-3 sm:p-4 bg-slate-50 dark:bg-ink-900/90 shrink-0 space-y-2">
            {error && (
              <p className="text-center text-xs font-semibold text-red-500 bg-red-500/10 rounded-lg py-1.5 px-2">
                {error}
              </p>
            )}

            {step === 'review' ? (
              <button
                onClick={() => setStep('details')}
                className="btn-accent w-full py-2.5 sm:py-3 text-sm font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <span>Continue</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleProceedToPayment}
                disabled={busy}
                className="btn-accent w-full py-2.5 sm:py-3 text-sm font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
                ) : (
                  <>
                    <span>
                      {isFree ? 'Complete Free Enrollment' : `Proceed to Pay · ${formatInr(totalRupees)}`}
                    </span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
            )}

            <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">
              🔒 Instant access &amp; secure Razorpay checkout
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
          Enroll Now
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

      {/* Clean "Enroll Now" Button (No price, no "Fill details and enroll", just Enroll Now) */}
      <div className="mt-2.5">
        <button
          onClick={handleOpenBig}
          className="btn-accent w-full py-2 text-xs font-bold shadow-sm hover:shadow transition flex items-center justify-center gap-1.5"
        >
          <span>Enroll Now</span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 ml-0.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
