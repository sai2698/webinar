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

/* ── Branded SVG Icons ────────────────────────────────────────── */

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.06c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a7.99 7.99 0 0 1-1.22-4.29c0-4.41 3.59-8 8.01-8 2.14 0 4.15.83 5.66 2.34a7.97 7.97 0 0 1 2.35 5.66c0 4.41-3.59 8-8.01 8zm4.39-6.02c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" />
    </svg>
  );
}

function LinkedInIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

function TwitterIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  );
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
            name: name.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
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
              <Button variant="outline">Browse Other Webinars</Button>
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

  const whatsappCommunityUrl = webinar.whatsappGroupUrl || undefined;
  const collectPhone = webinar.collectPhone !== false;
  const requirePhone = webinar.requirePhone !== false;
  const regFields = webinar.registrationFields || {
    name: { enabled: true, label: 'Full Name', placeholder: 'e.g. Ada Lovelace', required: true },
    email: { enabled: true, label: 'Email Address', placeholder: 'you@company.com', required: true },
    phone: { enabled: collectPhone, label: 'Mobile Number', placeholder: '+91 98765 43210', required: requirePhone },
  };

  /* ── Social Share Card Component ───────────────────────────── */
  const renderSocialShareCard = () => (
    <Card className="p-4 sm:p-5 space-y-3.5 border-line shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 text-xs">
            📢
          </span>
          <span className="text-xs font-bold text-fg tracking-tight">Share with Your Network</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (navigator?.clipboard) {
              navigator.clipboard.writeText(currentUrl);
              setCopiedShareLink(true);
              setTimeout(() => setCopiedShareLink(false), 2500);
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 hover:bg-brand-500/15 transition border border-brand-500/20"
        >
          {copiedShareLink ? (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy Link</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {/* WhatsApp */}
        <a
          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join me for "${webinar.title}" live! Register here: ${currentUrl}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition font-medium group"
        >
          <WhatsAppIcon className="h-4 w-4 fill-current group-hover:scale-110 transition-transform" />
          <span>WhatsApp</span>
        </a>

        {/* LinkedIn */}
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#0A66C2]/30 bg-[#0A66C2]/10 text-[#0A66C2] hover:bg-[#0A66C2]/20 transition font-medium group"
        >
          <LinkedInIcon className="h-4 w-4 fill-current group-hover:scale-110 transition-transform" />
          <span>LinkedIn</span>
        </a>

        {/* Twitter / X */}
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Joining "${webinar.title}" live! Join here: ${currentUrl}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-line bg-panel-2 text-fg hover:bg-line transition font-medium group"
        >
          <TwitterIcon className="h-4 w-4 fill-current group-hover:scale-110 transition-transform" />
          <span>X / Twitter</span>
        </a>

        {/* Telegram */}
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(`Join me for "${webinar.title}" live!`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#229ED9]/30 bg-[#229ED9]/10 text-[#229ED9] hover:bg-[#229ED9]/20 transition font-medium group"
        >
          <TelegramIcon className="h-4 w-4 fill-current group-hover:scale-110 transition-transform" />
          <span>Telegram</span>
        </a>
      </div>
    </Card>
  );

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

            {/* WhatsApp Community Callout Banner (if configured) */}
            {whatsappCommunityUrl && (
              <div className="rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#25D366]">
                    <WhatsAppIcon className="h-5 w-5 fill-current" />
                    Official WhatsApp Community
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    Join for session slides, resources, speaker updates, and networking.
                  </p>
                </div>
                <a
                  href={whatsappCommunityUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#25D366] hover:bg-[#20ba59] transition shadow-md active:scale-95"
                >
                  <WhatsAppIcon className="h-4 w-4 fill-current" />
                  Join WhatsApp Community
                </a>
              </div>
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

            {/* Desktop Share Bar (Rendered here only on lg+ screens) */}
            <div className="hidden lg:block">
              {renderSocialShareCard()}
            </div>
          </div>

          {/* Right Column: Registration Form or Success Screen */}
          <div className="sticky top-6 space-y-6">
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

                  {/* WhatsApp Community Button on Success Screen */}
                  {whatsappCommunityUrl && (
                    <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 space-y-2 text-center">
                      <p className="text-xs font-bold text-[#25D366] flex items-center justify-center gap-1.5">
                        <WhatsAppIcon className="h-4 w-4 fill-current" />
                        Join WhatsApp Community
                      </p>
                      <p className="text-[11px] text-muted">
                        Get event reminders, presentation decks, and connect with attendees.
                      </p>
                      <a
                        href={whatsappCommunityUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-bold text-white bg-[#25D366] hover:bg-[#20ba59] transition shadow-md"
                      >
                        <WhatsAppIcon className="h-4 w-4 fill-current" />
                        Join WhatsApp Group →
                      </a>
                    </div>
                  )}

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
                    {/* Full Name input (if enabled by host) */}
                    {regFields.name?.enabled !== false && (
                      <Input
                        label={
                          regFields.name?.required
                            ? (regFields.name?.label || 'Full Name')
                            : `${regFields.name?.label || 'Full Name'} (Optional)`
                        }
                        id="name"
                        placeholder={regFields.name?.placeholder || 'e.g. Ada Lovelace'}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required={regFields.name?.required ?? true}
                        minLength={regFields.name?.required ? 2 : undefined}
                      />
                    )}

                    {/* Email Address input (if enabled by host) */}
                    {webinar.requireRegistration && regFields.email?.enabled !== false && (
                      <Input
                        label={
                          regFields.email?.required
                            ? (regFields.email?.label || 'Email Address')
                            : `${regFields.email?.label || 'Email Address'} (Optional)`
                        }
                        id="email"
                        type="email"
                        placeholder={regFields.email?.placeholder || 'you@company.com'}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={regFields.email?.required ?? true}
                      />
                    )}

                    {/* Mobile Number input (if enabled by host) */}
                    {webinar.requireRegistration && regFields.phone?.enabled !== false && (
                      <Input
                        label={
                          regFields.phone?.required
                            ? (regFields.phone?.label || 'Mobile Number')
                            : `${regFields.phone?.label || 'Mobile Number'} (Optional)`
                        }
                        id="phone"
                        type="tel"
                        placeholder={regFields.phone?.placeholder || '+91 98765 43210'}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required={regFields.phone?.required ?? false}
                        minLength={regFields.phone?.required ? 6 : undefined}
                        maxLength={20}
                        pattern={regFields.phone?.required || phone ? '[+]?[0-9\\s\\(\\)\\-]{6,20}' : undefined}
                        helperText={
                          regFields.phone?.required
                            ? 'Used only for event reminders and login link'
                            : 'Optional: Used for event reminders'
                        }
                      />
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

            {/* Mobile Share Bar (Rendered here below the registration form only on screens < lg) */}
            <div className="block lg:hidden">
              {renderSocialShareCard()}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
