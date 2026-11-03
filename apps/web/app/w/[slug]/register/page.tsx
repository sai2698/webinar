'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { CustomFieldsForm } from '@/components/CustomFieldsForm';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button, Input, Badge, Card } from '@/components/ui';
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
  if (!paise) return 'Free Entry';
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
        router.push(`/room/${slug}?pending=1`);
      } else if (res.requiresPayment) {
        router.push(`/w/${slug}/pay`);
      } else {
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
      <main className="grid min-h-screen place-items-center bg-surface text-fg">
        <div className="flex flex-col items-center gap-3">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand-500" />
          <p className="text-xs text-muted">Loading registration details…</p>
        </div>
      </main>
    );
  }

  if (error || !webinar) {
    return (
      <main className="grid min-h-screen place-items-center px-6 bg-surface text-fg">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-500/15 text-red-500">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5m0 3.5v.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-fg">Webinar not found</h1>
          <p className="mt-2 text-sm text-muted">{error ?? 'This webinar registration page is unavailable.'}</p>
          <div className="mt-6">
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const isLive = webinar.status === 'LIVE';
  const isEnded = webinar.status === 'ENDED';
  const startsInFuture = new Date(webinar.startsAt).getTime() > Date.now();
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <main className="relative min-h-screen bg-surface text-fg overflow-x-hidden transition-colors duration-200">
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
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/80 to-surface" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6 border-b border-line">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${webinar.slug}`}
            className="text-xs font-semibold text-muted hover:text-fg transition flex items-center gap-1"
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
            {webinar.bannerUrl && (
              <div className="relative overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-pop aspect-[16/9] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getBannerSrc(webinar.bannerUrl)}
                  alt={webinar.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {isLive ? (
                <Badge variant="live" dot>LIVE NOW</Badge>
              ) : isEnded ? (
                <Badge variant="default">Ended</Badge>
              ) : (
                <Badge variant="brand">Upcoming Live Session</Badge>
              )}

              <Badge variant="default">⏱️ {webinar.durationMins} minutes</Badge>
              <Badge variant="warning">{formatPrice(webinar.priceInPaise, webinar.currency)}</Badge>

              {webinar.seatsLeft !== null && webinar.seatsLeft <= 50 && (
                <Badge variant="danger">🔥 Only {webinar.seatsLeft} seats left</Badge>
              )}
            </div>

            {/* Title & Host Info */}
            <div>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-fg sm:text-4xl">
                {webinar.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
                <span className="inline-flex items-center gap-2 font-medium">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 2" strokeLinecap="round" />
                  </svg>
                  {formatDate(webinar.startsAt, webinar.timezone)}
                </span>
                <span className="inline-flex items-center gap-2 font-medium">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="8.5" r="3.5" />
                    <path d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" strokeLinecap="round" />
                  </svg>
                  Hosted by <strong className="text-fg">{webinar.hostName}</strong>
                </span>
              </div>
            </div>

            {/* Countdown timer */}
            {startsInFuture && !isEnded && (
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                  Starts In
                </p>
                <Countdown target={webinar.startsAt} />
              </Card>
            )}

            {/* Description */}
            {webinar.description && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  About this Live Webinar
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-fg">
                  {webinar.description}
                </p>
              </div>
            )}

            {/* Share Bar */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
                  <span>📢</span> Share this Webinar:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentUrl);
                    setCopiedShareLink(true);
                    setTimeout(() => setCopiedShareLink(false), 2500);
                  }}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {copiedShareLink ? '✓ Copied Link!' : '📋 Copy Link'}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join me for "${webinar.title}" live! Register here: ${currentUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl border border-line bg-panel-2 text-fg hover:bg-line transition flex items-center gap-1.5"
                >
                  <span>💬</span> WhatsApp
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl border border-line bg-panel-2 text-fg hover:bg-line transition flex items-center gap-1.5"
                >
                  <span>💼</span> LinkedIn
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Joining "${webinar.title}" live! Join here: ${currentUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl border border-line bg-panel-2 text-fg hover:bg-line transition flex items-center gap-1.5"
                >
                  <span>🐦</span> X / Twitter
                </a>
              </div>
            </Card>
          </div>

          {/* Right Column: Registration Form or Success Screen */}
          <div className="sticky top-6">
            <Card className="p-6 sm:p-7 shadow-pop">
              {registeredSuccess ? (
                <div className="text-center space-y-5 py-4 animate-fade-up">
                  <div className="mx-auto h-16 w-16 rounded-full bg-mint-500/15 text-mint-500 border border-mint-500/30 flex items-center justify-center text-3xl">
                    🎉
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-fg">You are Registered!</h2>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      Your seat is reserved. Click below to enter the live room directly.
                    </p>
                  </div>

                  <Link href={joinUrl}>
                    <Button variant="primary" className="w-full py-3 text-sm font-bold shadow-glow">
                      Enter Webinar Room Now →
                    </Button>
                  </Link>

                  <div className="pt-2">
                    <a
                      href={`${API_URL}/api/webinars/${slug}/calendar.ics`}
                      download
                      className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center justify-center gap-1.5"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      Add to Google / Apple Calendar
                    </a>
                  </div>
                </div>
              ) : isEnded ? (
                <div className="text-center space-y-4 py-6">
                  <div className="text-3xl">⏰</div>
                  <h2 className="text-lg font-bold text-fg">This session has concluded</h2>
                  <p className="text-xs text-muted">
                    This webinar has ended. You can check out our other live masterclasses.
                  </p>
                  <div className="pt-2">
                    <Link href="/">
                      <Button variant="outline" className="w-full">
                        Browse Other Webinars
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-5 pb-4 border-b border-line">
                    <h2 className="text-lg font-bold text-fg">Reserve Your Free Seat</h2>
                    <p className="text-xs text-muted mt-0.5">
                      Fast registration • Instant room access
                    </p>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-4">
                    <Input
                      label="Full Name"
                      id="name"
                      placeholder="e.g. Ada Lovelace"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={2}
                    />

                    {webinar.requireRegistration && (
                      <>
                        <Input
                          label="Email Address"
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />

                        <Input
                          label="Mobile Number"
                          id="phone"
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                          minLength={6}
                          maxLength={20}
                          pattern="[+]?[0-9\s\(\)\-]{6,20}"
                          helperText="Used only for event reminders and login link"
                        />
                      </>
                    )}

                    {webinar.passcodeRequired && (
                      <Input
                        label="Room Passcode"
                        id="passcode"
                        type="password"
                        placeholder="Enter passcode shared by host"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        required
                      />
                    )}

                    {webinar.requireRegistration && (
                      <CustomFieldsForm
                        slug={slug}
                        values={customResponses}
                        onChange={setCustomResponses}
                        disabled={submitting}
                      />
                    )}

                    {formError && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-500 dark:text-red-400">
                        {formError}
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={submitting}
                      className="w-full py-3 text-sm font-bold shadow-glow"
                    >
                      {webinar.requirePayment
                        ? `Pay ${formatPrice(webinar.priceInPaise, webinar.currency)} & Join`
                        : webinar.requireRegistration
                        ? 'Confirm Free Registration'
                        : 'Join Now'}
                    </Button>

                    <p className="text-[11px] text-center text-muted pt-1">
                      🔒 Your information is secure and private.
                    </p>
                  </form>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
