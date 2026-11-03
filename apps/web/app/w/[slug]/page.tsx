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
    const apiOrigin = typeof window !== 'undefined'
      ? window.location.origin.replace(':3000', ':4000')
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
    return `${apiOrigin}${url}`;
  }
  return url;
}

export default function WebinarLandingPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [webinar, setWebinar] = useState<PublicWebinar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [passcode, setPasscode] = useState('');
  const [customResponses, setCustomResponses] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

      if ('pendingApproval' in res && res.pendingApproval) {
        router.push(`/room/${slug}?pending=1`);
      } else if (res.requiresPayment) {
        router.push(`/w/${slug}/pay`);
      } else {
        router.push(`/room/${slug}`);
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
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand-500" />
          <p className="text-sm text-muted">Loading webinar details…</p>
        </div>
      </main>
    );
  }

  if (error || !webinar) {
    return (
      <main className="grid min-h-screen place-items-center px-6 bg-surface text-fg">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-500/15 text-red-500">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 8v5m0 3.5v.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-fg">Webinar unavailable</h1>
          <p className="mt-2 text-sm text-muted leading-relaxed">{error ?? 'This webinar does not exist or has been removed.'}</p>
          <div className="mt-6">
            <Link href="/">
              <Button variant="outline">Back to Homepage</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const isLive = webinar.status === 'LIVE';
  const isEnded = webinar.status === 'ENDED';
  const startsInFuture = new Date(webinar.startsAt).getTime() > Date.now();

  return (
    <main className="relative min-h-screen bg-surface text-fg transition-colors duration-200">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] overflow-hidden opacity-25">
        {webinar.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getBannerSrc(webinar.bannerUrl)}
            alt=""
            className="h-full w-full scale-110 object-cover blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/80 to-surface" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <Link href="/admin/login">
            <Button size="xs" variant="ghost">Host sign in</Button>
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-4 lg:grid-cols-[1.35fr_1fr]">
        {/* ── left: details ─────────────────────────────── */}
        <div className="animate-fade-up">
          {/* Prominent Foreground Banner Image */}
          {webinar.bannerUrl && (
            <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-pop aspect-[16/9] w-full max-h-[400px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getBannerSrc(webinar.bannerUrl)}
                alt={webinar.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isLive ? (
              <Badge variant="live" dot>Live now</Badge>
            ) : isEnded ? (
              <Badge variant="default">Ended</Badge>
            ) : (
              <Badge variant="brand">Upcoming</Badge>
            )}
            <Badge variant="default">{webinar.durationMins} min</Badge>
            {webinar.requirePayment && (
              <Badge variant="warning">
                {formatPrice(webinar.priceInPaise, webinar.currency)}
              </Badge>
            )}
            {webinar.seatsLeft !== null && webinar.seatsLeft <= 50 && (
              <Badge variant="danger">{webinar.seatsLeft} seats left</Badge>
            )}
          </div>

          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-fg sm:text-4xl lg:text-[2.75rem]">
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
              Hosted by {webinar.hostName}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                const regUrl = typeof window !== 'undefined'
                  ? `${window.location.origin}/w/${slug}/register`
                  : `/w/${slug}/register`;
                navigator.clipboard.writeText(regUrl);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2500);
              }}
              title="Copy registration link to share"
            >
              {copiedLink ? '✓ Link Copied!' : '🔗 Copy Registration Link'}
            </Button>
          </div>

          {startsInFuture && !isEnded && (
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Starts in</p>
              <Countdown target={webinar.startsAt} />
              <a
                href={`${API_URL}/api/webinars/${slug}/calendar.ics`}
                download
                className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 11h18" strokeLinecap="round" />
                </svg>
                Add to calendar (.ics)
              </a>
            </div>
          )}

          {webinar.description && (
            <div className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
                About this session
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg">
                {webinar.description}
              </p>
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['HD WebRTC Video', 'Adaptive up to 1080p60'],
              ['Interactive Chat', 'Real-time moderated questions'],
              ['Timed Quizzes', 'Live polls with instant scoreboards'],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
                <div className="text-xs font-bold text-fg">{title}</div>
                <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── right: registration card ──────────────────── */}
        <div className="animate-fade-up animate-delay-200">
          <Card className="sticky top-6 overflow-hidden p-6 sm:p-7">
            <h2 className="text-lg font-bold text-fg">
              {isEnded ? 'This session has ended' : 'Reserve your seat'}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {webinar.requirePayment
                ? `Secure checkout · ${formatPrice(webinar.priceInPaise, webinar.currency)} via Razorpay`
                : 'Free to attend · instant room access'}
            </p>

            {isEnded ? (
              <div className="mt-6">
                <Link href="/">
                  <Button variant="outline" className="w-full">
                    Browse other live sessions
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
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
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-600 dark:text-red-400">
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
                    ? 'Register & Join Room'
                    : 'Join Now'}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
