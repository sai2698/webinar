'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { CustomFieldsForm } from '@/components/CustomFieldsForm';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { endpoints, ApiError, API_URL, type PublicWebinar } from '@/lib/api';
import { writeSession } from '@/lib/session';

function formatDate(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || 'Asia/Kolkata',
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function formatPrice(paise: number, currency: string) {
  if (!paise) return 'Free';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function getBannerSrc(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads/')) {
    const apiOrigin =
      typeof window !== 'undefined'
        ? window.location.origin.replace(':3000', ':4000')
        : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
    return `${apiOrigin}${url}`;
  }
  return url;
}

export default function DedicatedRegistrationPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [webinar, setWebinar] = useState<PublicWebinar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [passcode, setPasscode] = useState('');
  const [customResponses, setCustomResponses] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');

  useEffect(() => {
    if (!slug) return;
    endpoints
      .publicWebinar(slug)
      .then((res) => setWebinar(res.webinar))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load webinar'))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = webinar?.requireRegistration
        ? await endpoints.register(slug, {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            passcode: passcode.trim() || undefined,
            customResponses,
          })
        : await endpoints.guestJoin(slug, name.trim(), passcode.trim() || undefined);

      writeSession('participant', res.token, res.user);
      localStorage.setItem(`join:${slug}`, res.joinToken);

      const targetRoomUrl = `/room/${webinar?.slug || slug}`;
      setJoinUrl(targetRoomUrl);

      if ('pendingApproval' in res && res.pendingApproval) {
        router.push(`${targetRoomUrl}?pending=1`);
      } else if (res.requiresPayment) {
        router.push(`/w/${webinar?.slug || slug}/pay`);
      } else if (webinar?.status === 'LIVE') {
        // If live now, take them straight to the room
        router.push(targetRoomUrl);
      } else {
        // If scheduled for future, show clear confirmation with calendar download
        setRegisteredSuccess(true);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
          <p className="text-sm text-slate-400">Loading registration page…</p>
        </div>
      </main>
    );
  }

  if (error || !webinar) {
    return (
      <main className="grid min-h-screen place-items-center px-6 bg-slate-950 text-white">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center max-w-md shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/15 text-red-400">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 8v5m0 3.5v.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Webinar not found</h1>
          <p className="mt-2 text-sm text-slate-400">{error ?? 'This webinar link is invalid or expired.'}</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition">
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const isLive = webinar.status === 'LIVE';
  const isEnded = webinar.status === 'ENDED';
  const startsInFuture = new Date(webinar.startsAt).getTime() > Date.now();
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden opacity-25">
        {webinar.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getBannerSrc(webinar.bannerUrl)}
            alt=""
            className="h-full w-full scale-125 object-cover blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/80 to-slate-950" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6 border-b border-white/5">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${webinar.slug}`}
            className="text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1"
          >
            ← Overview
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Container */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8 md:py-12">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] items-start">
          
          {/* Left Column: Webinar Banner & Details */}
          <div className="space-y-6 animate-fade-up">
            {/* Prominent Foreground Banner */}
            {webinar.bannerUrl ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl aspect-[16/9] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getBannerSrc(webinar.bannerUrl)}
                  alt={webinar.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {isLive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                  </span>
                  LIVE NOW
                </span>
              ) : isEnded ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-400">
                  Ended
                </span>
              ) : (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                  Upcoming Live Session
                </span>
              )}

              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                ⏱️ {webinar.durationMins} minutes
              </span>

              <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400">
                {webinar.requirePayment ? formatPrice(webinar.priceInPaise, webinar.currency) : '🎉 Free Entry'}
              </span>

              {webinar.seatsLeft !== null && webinar.seatsLeft <= 50 && (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
                  🔥 Only {webinar.seatsLeft} seats left
                </span>
              )}
            </div>

            {/* Title & Host Info */}
            <div>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                {webinar.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 2" strokeLinecap="round" />
                  </svg>
                  {formatDate(webinar.startsAt, webinar.timezone)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <circle cx="12" cy="8.5" r="3.5" />
                    <path d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" strokeLinecap="round" />
                  </svg>
                  Hosted by <strong className="text-white">{webinar.hostName}</strong>
                </span>
              </div>
            </div>

            {/* Countdown timer */}
            {startsInFuture && !isEnded && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Starts In
                </p>
                <Countdown target={webinar.startsAt} />
              </div>
            )}

            {/* Description */}
            {webinar.description && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  About this Live Webinar
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
                  {webinar.description}
                </p>
              </div>
            )}

            {/* Share Bar for YouTube & Social Media */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>📢</span> Share this Webinar:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentUrl);
                    setCopiedShareLink(true);
                    setTimeout(() => setCopiedShareLink(false), 2500);
                  }}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
                >
                  {copiedShareLink ? '✓ Copied Link!' : '📋 Copy Link'}
                </button>
              </div>

              {/* Share links */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join me for "${webinar.title}" live! Register here: ${currentUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition flex items-center gap-1.5"
                >
                  <span>💬</span> WhatsApp
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition flex items-center gap-1.5"
                >
                  <span>💼</span> LinkedIn
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Register for "${webinar.title}" live webinar:`)}&url=${encodeURIComponent(currentUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition flex items-center gap-1.5"
                >
                  <span>🐦</span> Twitter / X
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Dedicated Registration Form */}
          <div className="sticky top-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
              {registeredSuccess ? (
                /* Success state after registering for future session */
                <div className="text-center space-y-4 py-4 animate-fade-in">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 text-3xl">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Your Seat is Reserved!</h3>
                    <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                      We look forward to seeing you at <strong>{webinar.title}</strong>.
                    </p>
                  </div>

                  <div className="pt-2 space-y-2.5">
                    <a
                      href={`${API_URL}/api/webinars/${webinar.slug}/calendar.ics`}
                      download
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 text-xs transition shadow-lg"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M8 3v4M16 3v4M3 11h18" strokeLinecap="round" />
                      </svg>
                      Add to Google / Apple Calendar
                    </a>

                    <Link
                      href={joinUrl || `/room/${webinar.slug}`}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold py-2.5 px-4 text-xs transition"
                    >
                      Go to Webinar Room →
                    </Link>
                  </div>
                </div>
              ) : (
                /* Normal Registration Form */
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="border-b border-white/10 pb-4">
                    <h2 className="text-xl font-bold text-white">Reserve Your Seat</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {webinar.requirePayment
                        ? `Secure your spot for ${formatPrice(webinar.priceInPaise, webinar.currency)}`
                        : 'Free instant access • No password needed'}
                    </p>
                  </div>

                  {formError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                      {formError}
                    </div>
                  )}

                  {/* Name field */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300" htmlFor="name">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                    />
                  </div>

                  {/* Email & Phone if registration required */}
                  {webinar.requireRegistration && (
                    <>
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-300" htmlFor="email">
                          Email Address <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="rahul@example.com"
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-300" htmlFor="phone">
                          Phone Number <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="phone"
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="10-digit mobile number"
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                        />
                      </div>
                    </>
                  )}

                  {/* Passcode if webinar requires one */}
                  {webinar.passcodeRequired && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-300" htmlFor="passcode">
                        Passcode <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="passcode"
                        type="password"
                        required
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Enter room passcode"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                      />
                    </div>
                  )}

                  {/* Custom Fields configured by host */}
                  {webinar.requireRegistration && (
                    <div className="pt-2 border-t border-white/10">
                      <CustomFieldsForm
                        slug={slug}
                        values={customResponses}
                        onChange={setCustomResponses}
                        disabled={submitting}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold py-3 px-4 text-sm transition shadow-xl disabled:opacity-60 cursor-pointer"
                  >
                    {submitting ? 'Registering...' : isLive ? 'Join Live Webinar Now →' : 'Register for Webinar →'}
                  </button>

                  <p className="text-center text-[11px] text-slate-500">
                    By registering you agree to receive webinar reminders and notifications.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
