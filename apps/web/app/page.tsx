'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ConsoleLink } from '@/components/ConsoleLink';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'offer' | 'quiz'>('offer');
  const [offerSeconds, setOfferSeconds] = useState(284);
  const [copiedLink, setCopiedLink] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Timer countdown for the interactive demo offer
  useEffect(() => {
    const timer = setInterval(() => {
      setOfferSeconds((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCopyDemoLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(`${window.location.origin}/w/live-product-teardown`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-surface text-fg selection:bg-brand-500/25 selection:text-brand-600 transition-colors duration-200">
      {/* ── Ambient background glows ─────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[550px] w-[950px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-500/15 via-brand-500/5 to-transparent blur-[140px]" />
        <div className="absolute right-[-10%] top-[35%] h-[450px] w-[450px] rounded-full bg-accent-500/10 blur-[150px]" />
        <div className="absolute left-[-10%] top-[65%] h-[550px] w-[550px] rounded-full bg-brand-600/10 blur-[160px]" />
      </div>

      {/* ── Floating Navigation Header with Top Space ─────────────── */}
      <div className="sticky top-0 z-50 px-4 pt-4 sm:pt-6 pb-2 pointer-events-none transition-all">
        <header className="pointer-events-auto mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl border border-line bg-panel/85 px-4 sm:px-6 shadow-card backdrop-blur-xl transition-all">
          <div className="flex items-center gap-4 sm:gap-6">
            <Logo />
            <span className="hidden items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300 md:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
              v2.0 Enterprise
            </span>
          </div>

          <nav className="hidden items-center gap-7 text-xs font-semibold text-muted md:flex">
            <a href="#features" className="transition hover:text-fg">
              Features
            </a>
            <a href="#studio-demo" className="transition hover:text-fg">
              Live Studio
            </a>
            <a href="#architecture" className="transition hover:text-fg">
              Architecture
            </a>
            <a href="#pricing" className="transition hover:text-fg">
              Pricing
            </a>
            <a href="#faq" className="transition hover:text-fg">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <ThemeToggle />
            <ConsoleLink
              className="btn-ghost hidden px-3.5 py-2 text-xs sm:inline-flex"
              signedInLabel="Admin Console"
              signedOutLabel="Host Sign In"
            />
            <Link
              href="/w/live-product-teardown"
              className="btn-primary px-3.5 py-2 text-xs font-semibold sm:px-4 sm:py-2.5"
            >
              Watch Demo
            </Link>
          </div>
        </header>
      </div>

      {/* ── Hero Section ─────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-fg shadow-xs backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-mint-500" />
            </span>
            <span className="font-semibold text-brand-600 dark:text-brand-300">Mediasoup SFU 3.0</span>
            <span className="text-subtle">•</span>
            <span className="text-muted">Under 180ms Global WebRTC Latency</span>
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-fg sm:text-6xl sm:leading-[1.12] lg:text-7xl">
            Live Webinars Built for{' '}
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 dark:from-brand-300 dark:via-brand-400 dark:to-accent-400 bg-clip-text text-transparent">
              High-Yield Conversions
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-xl sm:leading-relaxed">
            The self-hosted, enterprise live broadcasting engine. One host stream routes to thousands of
            attendees with sub-second WebRTC latency, in-stream Razorpay checkouts, timed interactive
            quizzes, and strict server-enforced role privacy.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/w/live-product-teardown"
              className="btn-primary group px-6 py-3.5 text-sm sm:text-base shadow-glow"
            >
              <span>Explore Live Studio Demo</span>
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            <Link
              href="/admin"
              className="btn-ghost px-5 py-3.5 text-sm sm:text-base"
            >
              <span>Open Host Console</span>
            </Link>

            <button
              onClick={handleCopyDemoLink}
              title="Copy link to test from another device or incognito tab"
              className="btn-ghost px-4 py-3.5 text-xs sm:text-sm text-muted hover:text-fg"
            >
              {copiedLink ? (
                <span className="flex items-center gap-1.5 text-mint-600 dark:text-mint-400 font-semibold">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Demo link copied!
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Share Link
                </span>
              )}
            </button>
          </div>

          {/* Micro trust indicators */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <svg className="h-4 w-4 text-mint-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              100% Self-Hosted & Sovereign
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <svg className="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              mediasoup C++ Worker Engine
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <svg className="h-4 w-4 text-accent-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Native Razorpay Checkout
            </span>
          </div>
        </div>

        {/* ── Interactive Live Studio Mockup (Hero Graphic) ──────── */}
        <div id="studio-demo" className="mt-14 scroll-mt-28 sm:mt-18">
          <div className="relative mx-auto max-w-5xl rounded-3xl border border-line bg-panel p-2 shadow-pop sm:p-3 transition hover:border-brand-500/30">
            <div className="overflow-hidden rounded-2xl border border-line bg-panel-2 shadow-inner">
              {/* Mock Window Title Bar */}
              <div className="flex h-11 items-center justify-between border-b border-line bg-panel px-4">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-mint-500/80" />
                  <span className="ml-3 font-mono text-xs text-subtle">
                    nexalive.io/room/advanced-sfu-masterclass
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                    LIVE ON AIR
                  </span>
                  <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                    <span className="h-2 w-2 rounded-full bg-mint-500" />
                    1,248 viewers
                  </span>
                </div>
              </div>

              {/* Studio Stage Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Left: Video Stage (7 cols) */}
                <div className="relative flex aspect-video flex-col justify-between overflow-hidden bg-slate-950 p-4 sm:p-6 lg:col-span-7">
                  {/* Subtle Video Glow Background */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-brand-900/40 via-slate-900 to-indigo-950/50" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(61,92,255,0.15),transparent_70%)]" />

                  {/* Stage Top Bar */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-black/60 px-2.5 py-1 font-mono text-[11px] font-semibold text-white backdrop-blur-md">
                        1080p60 WebRTC
                      </span>
                      <span className="hidden rounded-lg bg-black/60 px-2 py-1 text-[11px] text-slate-300 backdrop-blur-md sm:inline-block">
                        Host: Dr. Arjun Mehta
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs text-mint-400 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 rounded-full bg-mint-400 animate-pulse" />
                      <span>142ms latency</span>
                    </div>
                  </div>

                  {/* Stage Center Graphic (Live Audio Waveform) */}
                  <div className="relative z-10 my-auto text-center">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-500 to-brand-700 shadow-glow text-white">
                      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {[40, 65, 85, 100, 75, 45, 90, 60, 30, 70, 95, 50].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 rounded-full bg-brand-400 transition-all duration-300"
                          style={{ height: `${h * 0.28}px`, opacity: 0.4 + (h / 100) * 0.6 }}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-300">
                      &quot;Scaling SFU pipelines to 10k attendees without quality degradation&quot;
                    </p>
                  </div>

                  {/* Stage Bottom Bar */}
                  <div className="relative z-10 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-brand-400" />
                      Screen Share Active
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Watermark: user_9921_verified
                    </span>
                  </div>
                </div>

                {/* Right: Interactive Sidebar (5 cols) */}
                <div className="flex flex-col border-t border-line bg-panel lg:col-span-5 lg:border-l lg:border-t-0">
                  {/* Sidebar Tab Header */}
                  <div className="flex border-b border-line bg-panel-2">
                    <button
                      onClick={() => setActiveTab('offer')}
                      className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        activeTab === 'offer'
                          ? 'border-b-2 border-accent-500 bg-panel text-accent-600 dark:text-accent-400'
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      <span>⚡ Flash Offer</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        activeTab === 'chat'
                          ? 'border-b-2 border-brand-500 bg-panel text-brand-600 dark:text-brand-400'
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      <span>💬 Live Chat</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('quiz')}
                      className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        activeTab === 'quiz'
                          ? 'border-b-2 border-mint-500 bg-panel text-mint-600 dark:text-mint-400'
                          : 'text-muted hover:text-fg'
                      }`}
                    >
                      <span>📊 Poll</span>
                    </button>
                  </div>

                  {/* Sidebar Interactive Body */}
                  <div className="flex-1 p-4">
                    {activeTab === 'offer' && (
                      <div className="rounded-2xl border border-line bg-panel-2 p-4">
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-accent-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-600 dark:text-accent-400">
                            Webinar Exclusive
                          </span>
                          <span className="font-mono text-xs font-bold text-accent-600 dark:text-accent-400">
                            ⏱ {formatTimer(offerSeconds)} left
                          </span>
                        </div>

                        <h4 className="mt-3 text-sm font-bold text-fg">
                          Production WebRTC SFU Architecture Masterclass
                        </h4>
                        <p className="mt-1 text-xs text-muted leading-relaxed">
                          Complete source code, multi-core worker pipelining, and zero-downtime deployment scripts.
                        </p>

                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-xl font-extrabold text-fg">₹4,999</span>
                          <span className="text-xs text-subtle line-through">₹14,999</span>
                          <span className="text-xs font-semibold text-mint-600 dark:text-mint-400">67% OFF</span>
                        </div>

                        <button
                          onClick={() => alert('Demo checkout: In real webinar, Razorpay instant modal opens directly over video!')}
                          className="btn-accent mt-4 w-full py-2.5 text-xs font-bold shadow-md"
                        >
                          Enroll Now with Razorpay →
                        </button>
                        <p className="mt-2 text-center text-[10px] text-subtle">
                          Instant access • Razorpay UPI, Cards & NetBanking
                        </p>
                      </div>
                    )}

                    {activeTab === 'chat' && (
                      <div className="flex h-full flex-col justify-between space-y-2">
                        <div className="space-y-2 text-xs">
                          <div className="flex items-start gap-2">
                            <span className="h-6 w-6 rounded-full bg-panel-2 text-[10px] grid place-items-center font-bold text-fg border border-line">
                              RK
                            </span>
                            <div>
                              <p className="font-semibold text-fg">Rahul Kumar</p>
                              <p className="text-muted">Does mediasoup handle 10k attendees with SFU pipelining?</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2 rounded-xl bg-brand-500/10 p-2.5 border border-brand-500/20">
                            <span className="h-6 w-6 rounded-full bg-brand-500 text-[10px] grid place-items-center font-bold text-white">
                              AS
                            </span>
                            <div>
                              <p className="font-semibold text-brand-600 dark:text-brand-300">Ananya Sharma (Host)</p>
                              <p className="text-fg">Yes! One worker per core with round-robin pipeTransports.</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <span className="h-6 w-6 rounded-full bg-mint-500/20 text-[10px] grid place-items-center font-bold text-mint-600 dark:text-mint-400 border border-mint-500/30">
                              VS
                            </span>
                            <div>
                              <p className="font-semibold text-fg">Vikas S.</p>
                              <p className="text-muted">Just paid via Razorpay! The modal popped right on screen 🎉</p>
                            </div>
                          </div>
                        </div>

                        <div className="relative mt-2">
                          <input
                            disabled
                            placeholder="Send a chat message…"
                            className="input text-xs py-2"
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'quiz' && (
                      <div className="space-y-3 text-xs">
                        <p className="font-semibold text-fg">Live Poll: What is your primary webinar goal?</p>
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex justify-between text-[11px] text-muted mb-1 font-medium">
                              <span>Paid Masterclasses & Courses</span>
                              <span className="font-mono font-bold text-brand-600 dark:text-brand-300">64%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                              <div className="h-full bg-brand-500 rounded-full" style={{ width: '64%' }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] text-muted mb-1 font-medium">
                              <span>High-Ticket SaaS Demos</span>
                              <span className="font-mono font-bold text-brand-600 dark:text-brand-300">24%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                              <div className="h-full bg-accent-500 rounded-full" style={{ width: '24%' }} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-[11px] text-muted mb-1 font-medium">
                              <span>Internal Enterprise Training</span>
                              <span className="font-mono font-bold text-brand-600 dark:text-brand-300">12%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                              <div className="h-full bg-mint-500 rounded-full" style={{ width: '12%' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof & Metrics Strip ─────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          <div className="rounded-2xl border border-line bg-panel p-6 text-center shadow-card backdrop-blur-md transition hover:border-brand-500/40 hover:shadow-pop">
            <div className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              &lt;180<span className="text-brand-500">ms</span>
            </div>
            <div className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Glass-to-Glass Latency
            </div>
            <p className="mt-1 text-[11px] text-muted">True real-time WebRTC</p>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-6 text-center shadow-card backdrop-blur-md transition hover:border-brand-500/40 hover:shadow-pop">
            <div className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              10,000<span className="text-mint-500">+</span>
            </div>
            <div className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Concurrent Capacity
            </div>
            <p className="mt-1 text-[11px] text-muted">1 upload cost on host</p>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-6 text-center shadow-card backdrop-blur-md transition hover:border-brand-500/40 hover:shadow-pop">
            <div className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              3.4<span className="text-accent-500">x</span>
            </div>
            <div className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Higher Conversions
            </div>
            <p className="mt-1 text-[11px] text-muted">In-stream checkout</p>
          </div>

          <div className="rounded-2xl border border-line bg-panel p-6 text-center shadow-card backdrop-blur-md transition hover:border-brand-500/40 hover:shadow-pop">
            <div className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              100<span className="text-brand-600 dark:text-brand-300">%</span>
            </div>
            <div className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              Data & Brand Control
            </div>
            <p className="mt-1 text-[11px] text-muted">Zero vendor lock-in</p>
          </div>
        </div>
      </section>

      {/* ── Bento Grid: The 6 Pillars ────────────────────────────── */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-4 py-12 scroll-mt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-300 font-semibold">
            Engineered for High-Stake Events
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
            Everything Required to Broadcast & Monetize
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Built as a unified stack: native WebRTC SFU routing, in-stream payments, interactive
            gamification, and enterprise moderation.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: SFU Architecture */}
          <div className="rounded-2xl border border-line bg-panel p-6 shadow-card transition duration-300 hover:border-brand-500/40 hover:shadow-pop">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="2.5" />
                <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="2.5" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-fg">Mediasoup WebRTC SFU</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Server-side SFU routing decouples host bandwidth. Send one 1080p stream from your laptop,
              and our worker pool duplicates and routes it to 1,000s with under 180ms glass-to-glass latency.
            </p>
          </div>

          {/* Card 2: In-Stream Checkout */}
          <div className="rounded-2xl border border-line bg-panel p-6 shadow-card transition duration-300 hover:border-accent-500/40 hover:shadow-pop">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-accent-500/20 bg-accent-500/10 text-accent-500">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
                <circle cx="16" cy="15" r="1.5" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-fg">In-Stream Razorpay Checkout</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Push timed course flash offers, masterclass tickets, or consulting packages straight to
              attendee screens. Razorpay modals open directly over the video with instant webhook verification.
            </p>
          </div>

          {/* Card 3: Role-Aware Privacy */}
          <div className="rounded-2xl border border-line bg-panel p-6 shadow-card transition duration-300 hover:border-mint-500/40 hover:shadow-pop">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-mint-500/20 bg-mint-500/10 text-mint-500">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-fg">Server-Enforced Privacy</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              In webinar mode, participants are completely isolated from each other. They only receive staff
              audio and video. Granular co-host permission sets allow delegation without security risks.
            </p>
          </div>

          {/* Card 4: Interactivity Suite */}
          <div className="rounded-2xl border border-line bg-panel p-6 shadow-card transition duration-300 hover:border-brand-500/40 hover:shadow-pop">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-fg">Timed Quizzes & Live Polls</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Gamify your masterclasses with synchronized timed multiple-choice questions. Real-time answer
              breakdowns, live leaderboards, and immediate engagement metrics.
            </p>
          </div>

          {/* Card 5: Cloud Replays */}
          <div className="rounded-2xl border border-line bg-panel p-6 shadow-card transition duration-300 hover:border-brand-500/40 hover:shadow-pop">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-fg">Cloud Replays & Premieres</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Automated session recording with synced event timelines. Turn any recorded session into a
              scheduled &quot;simulated live premiere&quot; with active chat and purchase triggers.
            </p>
          </div>

          {/* Card 6: Developer Ecosystem */}
          <div className="rounded-2xl border border-line bg-panel p-6 shadow-card transition duration-300 hover:border-brand-500/40 hover:shadow-pop">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-fg">Webhooks, Pixels & REST API</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sync attendees with HubSpot, ActiveCampaign, or Slack in real time. Embed Google Analytics 4,
              Meta Pixel, and Microsoft Clarity with zero code injections.
            </p>
          </div>
        </div>
      </section>

      {/* ── Architecture Matrix: NexaLive vs Others ────────────────── */}
      <section id="architecture" className="relative z-10 mx-auto max-w-6xl px-4 py-16 scroll-mt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-300 font-semibold">
            Architectural Superiority
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Why Traditional Tools Fail at Conversions
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Zoom was engineered for meetings; YouTube was engineered for delayed video. NexaLive is
            engineered specifically for real-time high-ticket sales.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-2 text-xs uppercase tracking-wider text-subtle">
                <th className="p-4 sm:p-5 font-semibold">Capability</th>
                <th className="p-4 sm:p-5 font-bold text-brand-600 dark:text-brand-400 bg-brand-500/5">
                  NexaLive SFU
                </th>
                <th className="p-4 sm:p-5 font-medium">Zoom Events</th>
                <th className="p-4 sm:p-5 font-medium">YouTube Live</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="p-4 sm:p-5 font-medium text-fg">Broadcast Latency</td>
                <td className="p-4 sm:p-5 font-bold text-mint-600 dark:text-mint-400 bg-brand-500/5">
                  &lt; 180ms (Real-Time WebRTC)
                </td>
                <td className="p-4 sm:p-5 text-muted">~2,000ms</td>
                <td className="p-4 sm:p-5 text-muted">15,000ms - 30,000ms (HLS)</td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-medium text-fg">In-Stream Direct Checkout</td>
                <td className="p-4 sm:p-5 font-bold text-mint-600 dark:text-mint-400 bg-brand-500/5">
                  Native Razorpay Overlay
                </td>
                <td className="p-4 sm:p-5 text-muted">External browser redirect</td>
                <td className="p-4 sm:p-5 text-muted">Link in chat (High drop-off)</td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-medium text-fg">Attendee Data Ownership</td>
                <td className="p-4 sm:p-5 font-bold text-mint-600 dark:text-mint-400 bg-brand-500/5">
                  100% Owned on Your DB
                </td>
                <td className="p-4 sm:p-5 text-muted">Zoom Cloud Storage</td>
                <td className="p-4 sm:p-5 text-muted">Google Platform Owned</td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-medium text-fg">Viewer Isolation Privacy</td>
                <td className="p-4 sm:p-5 font-bold text-mint-600 dark:text-mint-400 bg-brand-500/5">
                  Guaranteed Server-Enforced
                </td>
                <td className="p-4 sm:p-5 text-muted">Configurable with risks</td>
                <td className="p-4 sm:p-5 text-muted">Public user comments</td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-medium text-fg">Self-Hosting Freedom</td>
                <td className="p-4 sm:p-5 font-bold text-mint-600 dark:text-mint-400 bg-brand-500/5">
                  Any VPS (Node + mediasoup)
                </td>
                <td className="p-4 sm:p-5 text-muted">No (Closed SaaS)</td>
                <td className="p-4 sm:p-5 text-muted">No</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Transparent Pricing ──────────────────────────────────── */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-4 py-16 scroll-mt-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-300 font-semibold">
            Simple, Transparent Pricing
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
            Deploy on Your Cloud or Ours
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            No per-attendee penalties or surprise bandwidth bills.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {/* Tier 1: Self-Hosted Community */}
          <div className="rounded-2xl border border-line bg-panel p-7 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-fg">Self-Hosted</h3>
                <span className="rounded-full bg-panel-2 border border-line px-2.5 py-0.5 text-[10px] font-semibold text-muted">
                  Open Engine
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                Run on your own Linux VPS with systemd, Nginx, and mediasoup.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-fg">₹0</span>
                <span className="text-xs text-subtle">/ forever</span>
              </div>

              <ul className="mt-7 space-y-3 text-xs text-muted">
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Full WebRTC SFU engine source
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Unlimited webinars & attendees
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Native Razorpay gateway
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> SQLite / PostgreSQL database
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Community GitHub support
                </li>
              </ul>
            </div>

            <Link
              href="/admin"
              className="btn-ghost mt-8 w-full py-2.5 text-xs font-semibold"
            >
              Start Free Self-Hosted
            </Link>
          </div>

          {/* Tier 2: Managed Pro Host (Featured) */}
          <div className="relative rounded-2xl border-2 border-brand-500 bg-panel p-7 shadow-glow flex flex-col justify-between">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-fg">Pro Host</h3>
                <span className="rounded-full bg-brand-500/15 border border-brand-500/30 px-2.5 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-300">
                  Turnkey Cloud
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                For educators, SaaS founders, and webinar creators who want zero server ops.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-fg">₹2,499</span>
                <span className="text-xs text-subtle">/ month</span>
              </div>

              <ul className="mt-7 space-y-3 text-xs text-fg">
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Managed high-speed SFU cluster
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> 1,000 live attendees per session
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Automated 1080p Cloud Replays
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Custom branding & custom domain
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Webhooks, Meta Pixel & GA4
                </li>
              </ul>
            </div>

            <Link
              href="/admin/login"
              className="btn-primary mt-8 w-full py-2.5 text-xs font-bold"
            >
              Get Started with Pro Host
            </Link>
          </div>

          {/* Tier 3: Enterprise Dedicated */}
          <div className="rounded-2xl border border-line bg-panel p-7 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-fg">Enterprise Dedicated</h3>
                <span className="rounded-full bg-panel-2 border border-line px-2.5 py-0.5 text-[10px] font-semibold text-muted">
                  Private Cloud
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                Multi-region deployments, custom SSO, and dedicated pipeTransport clusters.
              </p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-fg">Custom</span>
                <span className="text-xs text-subtle">/ tailored SLA</span>
              </div>

              <ul className="mt-7 space-y-3 text-xs text-muted">
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> 10,000+ concurrent attendees
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Dedicated AWS / GCP / VPS pods
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> Custom SAML / Okta SSO integration
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> 99.95% uptime SLA agreement
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-mint-500 font-bold">✓</span> 24/7 dedicated engineering support
                </li>
              </ul>
            </div>

            <a
              href="mailto:contact@sainaveen.in?subject=NexaLive%20Enterprise%20Inquiry"
              className="btn-ghost mt-8 w-full py-2.5 text-xs font-semibold text-center"
            >
              Contact Enterprise Sales
            </a>
          </div>
        </div>
      </section>

      {/* ── Interactive FAQ Accordion ────────────────────────────── */}
      <section id="faq" className="relative z-10 mx-auto max-w-4xl px-4 py-16 scroll-mt-28 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-300 font-semibold">
            Frequently Asked Questions
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Everything You Need to Know
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {[
            {
              q: 'How does Mediasoup achieve < 180ms latency compared to YouTube Live?',
              a: 'YouTube Live and typical video players use HLS or DASH protocols, which chunk video streams into 2-6 second segments, accumulating 15-30 seconds of buffer latency. Mediasoup uses pure WebRTC (UDP/SRTP) routed through a C++ Selective Forwarding Unit, streaming frames with virtually zero buffering.',
            },
            {
              q: 'Can I host NexaLive on my own 1 vCPU / 1 GB VPS?',
              a: 'Yes! With our deployment script, a 1 vCPU server easily handles development, testing, and small webinar broadcasts. For 500+ attendees, we recommend 4+ cores and 4GB+ RAM so mediasoup can distribute worker threads across multiple CPU cores.',
            },
            {
              q: 'How do in-stream Razorpay checkouts work for attendees?',
              a: 'When the host triggers an offer, a native checkout card slides onto the participant screen without leaving the video stream. Clicking &quot;Enroll Now&quot; opens the official Razorpay modal (supporting UPI QR, Google Pay, NetBanking, and credit/debit cards). On payment capture, webhooks immediately grant room privileges or course access.',
            },
            {
              q: 'Are participants isolated from each other for privacy?',
              a: 'Yes. In traditional meeting software (like Google Meet or Zoom), everyone sees everyone else. In NexaLive, participant isolation is enforced server-side in the SFU router. Attendees only receive staff media feeds and cannot snoop on other attendees without staff permission.',
            },
            {
              q: 'Can I simulate live webinars using pre-recorded sessions?',
              a: 'Yes. NexaLive includes a Premiere mode. You can attach any previously captured recording to a scheduled session. Attendees experience a synchronized live broadcast with interactive chat and real-time flash offers just like a live event.',
            },
          ].map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-5 text-left text-sm sm:text-base font-semibold text-fg transition hover:bg-panel-2"
                >
                  <span>{faq.q}</span>
                  <span
                    className={`ml-4 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-xs transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-brand-500 text-white border-transparent' : 'text-muted'
                    }`}
                  >
                    ↓
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-line/60 bg-panel-2/40 p-5 text-xs sm:text-sm leading-relaxed text-muted">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── High-Impact Bottom Call to Action ────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-brand-500/10 via-panel to-panel-2 p-8 text-center shadow-pop sm:p-14">
          <div className="mx-auto max-w-2xl">
            <span className="rounded-full bg-brand-500/15 border border-brand-500/30 px-3 py-1 text-xs font-bold text-brand-600 dark:text-brand-300">
              Get Started in Minutes
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
              Ready to Upgrade Your Live Broadcasts?
            </h2>
            <p className="mt-4 text-sm text-muted sm:text-base leading-relaxed">
              Test out the live studio, deploy natively on your Linux VPS, or explore our turnkey hosting.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/w/live-product-teardown"
                className="btn-primary px-6 py-3.5 text-sm font-semibold shadow-glow"
              >
                Launch Live Demo Room
              </Link>
              <Link
                href="/admin"
                className="btn-ghost px-6 py-3.5 text-sm font-semibold"
              >
                Sign In to Host Studio
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Enterprise Footer ────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-line bg-panel py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <Logo />
              <span className="text-xs text-subtle">
                • Ultra-low latency SFU webinar infrastructure
              </span>
            </div>

            <div className="flex items-center gap-6 text-xs text-muted">
              <a href="#features" className="hover:text-fg transition">Features</a>
              <a href="#pricing" className="hover:text-fg transition">Pricing</a>
              <a href="#faq" className="hover:text-fg transition">FAQ</a>
              <Link href="/admin/login" className="hover:text-fg transition">Host Login</Link>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-line/60 pt-6 text-xs text-subtle sm:flex-row">
            <p>© {new Date().getFullYear()} NexaLive. Built with Mediasoup, Next.js, and Razorpay.</p>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-mint-500" />
              <span>All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
