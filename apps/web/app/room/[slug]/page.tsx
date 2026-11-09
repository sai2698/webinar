'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRoomStore } from '@/store/roomStore';
import { useMediasoup } from '@/lib/useMediasoup';
import { VideoGrid } from '@/components/VideoGrid';
import { PresentationStage } from '@/components/PresentationStage';
import { ChatPanel } from '@/components/ChatPanel';
import { ParticipantList } from '@/components/ParticipantList';
import { ControlsBar } from '@/components/ControlsBar';
import { QuizModal } from '@/components/QuizModal';
import { PollModal } from '@/components/PollModal';
import { AudioRenderer } from '@/components/AudioRenderer';
import { PollsPanel } from '@/components/PollsPanel';
import { QaPanel } from '@/components/QaPanel';
import { EnrollmentBanner } from '@/components/EnrollmentBanner';
import { HostPanel } from '@/components/HostPanel';
import { JoinGate } from '@/components/JoinGate';
import { MediaRequestPrompt } from '@/components/MediaRequestPrompt';
import { PendingApproval } from '@/components/PendingApproval';
import { WaitingRoom } from '@/components/WaitingRoom';
import { WatermarkOverlay } from '@/components/WatermarkOverlay';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { endpoints } from '@/lib/api';
import { roomToken } from '@/lib/session';
import { useFullscreen } from '@/lib/useRoomUi';
import { PremiereStage } from '@/components/PremiereStage';
import { WebRtcDiagnosticsModal, WebRtcHealthBadge } from '@/components/WebRtcDiagnosticsModal';

type Tab = 'chat' | 'people' | 'qa' | 'polls';

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [gateToken, setGateToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [toast, setToast] = useState<string | null>(null);
  const [localPremiereRecordingId, setLocalPremiereRecordingId] = useState<string | null>(null);
  const [localPremiereStartedAt, setLocalPremiereStartedAt] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(stageRef);

  const store = useRoomStore;
  const connected = useRoomStore((s) => s.connected);
  const joining = useRoomStore((s) => s.joining);
  const error = useRoomStore((s) => s.error);
  const ended = useRoomStore((s) => s.ended);
  const viewerCount = useRoomStore((s) => s.viewerCount);
  const showLiveUsersCount = useRoomStore((s) => s.showLiveUsersCount);
  const recording = useRoomStore((s) => s.recording);
  const presentation = useRoomStore((s) => s.presentation);
  const hands = useRoomStore((s) => s.hands);
  const role = useRoomStore((s) => s.role);
  const userId = useRoomStore((s) => s.userId);
  const startedAt = useRoomStore((s) => s.startedAt);
  const webinarTitle = useRoomStore((s) => s.title);
  const title = useRoomStore((s) => s.peers[s.peerId ?? '']?.name ?? '');

  const handRaised = useMemo(
    () => Boolean(userId && hands.some((h) => h.userId === userId)),
    [hands, userId]
  );

  const questions = useRoomStore((s) => s.questions);
  const openQuestions = useMemo(
    () => questions.filter((q) => !q.answered).length,
    [questions]
  );

  const isStaff = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';

  const showPeopleTab = useRoomStore((s) => s.showPeopleTab);
  const showQaTab = useRoomStore((s) => s.showQaTab);
  const showPollsTab = useRoomStore((s) => s.showPollsTab);
  const canSeePeople = isStaff || showPeopleTab;
  // In host/staff view, Q&A and Polls tabs are removed from the right sidebar.
  // Attendees still see them when enabled by host settings.
  const canSeeQa = !isStaff && showQaTab;
  const canSeePolls = !isStaff && showPollsTab;

  const activeTab: Tab =
    (tab === 'people' && !canSeePeople) ||
    (tab === 'qa' && !canSeeQa) ||
    (tab === 'polls' && !canSeePolls)
      ? 'chat'
      : tab;

  const isApprovedSpeaker = useRoomStore((s) => s.isApprovedSpeaker);
  const canPublishAudio = useRoomStore((s) => s.canPublishAudio);
  const canPublishVideo = useRoomStore((s) => s.canPublishVideo);
  const allowMic = useRoomStore((s) => s.allowMic);
  const allowVideo = useRoomStore((s) => s.allowVideo);
  const canShareScreen = useRoomStore((s) => s.canShareScreen);
  const showParticipantsToEachOther = useRoomStore((s) => s.showParticipantsToEachOther);

  const storePremiereRecordingId = useRoomStore((s) => s.premiereRecordingId);
  const storePremiereStartedAt = useRoomStore((s) => s.premiereStartedAt);
  const activePremiereRecordingId = storePremiereRecordingId || localPremiereRecordingId;
  const activePremiereStartedAt = storePremiereStartedAt || localPremiereStartedAt;

  const isPremiere = Boolean(activePremiereRecordingId);
  const premiereStartedAtMs = useMemo(() => {
    if (!activePremiereStartedAt) return null;
    const t = new Date(activePremiereStartedAt).getTime();
    return Number.isFinite(t) ? t : null;
  }, [activePremiereStartedAt]);

  const isPremiereLive = Boolean(
    isPremiere && premiereStartedAtMs !== null && Date.now() >= premiereStartedAtMs
  );
  const isPremiereWaiting = Boolean(
    isPremiere && (premiereStartedAtMs === null || Date.now() < premiereStartedAtMs)
  );

  // In Premiere mode, participants are allowed to toggle their local mic/camera
  // so they see themselves in the live room (mimicking a live session), but the
  // media is kept local and never transmitted to the server.
  const canPublish = isPremiere
    ? true
    : (role !== 'PARTICIPANT' ||
        isApprovedSpeaker ||
        canPublishAudio ||
        canPublishVideo ||
        canShareScreen ||
        showParticipantsToEachOther ||
        allowMic ||
        allowVideo);

  const waiting = isPremiere ? isPremiereWaiting : (!isStaff && startedAt === null);
  const notStarted = isPremiere ? isPremiereWaiting : (startedAt === null);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('token');
    if (fromQuery) {
      window.history.replaceState(null, '', window.location.pathname);
      setGateToken(fromQuery);
      return;
    }

    const t = roomToken();
    if (!t) {
      router.replace(`/w/${slug}`);
      return;
    }
    setToken(t);
    setReady(true);
  }, [router, slug]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const {
    join,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    switchDevice,
    setBackground,
    uploadBackground,
    setNoiseSuppression,
    setEchoCancellation,
    setAutoGainControl,
    setFrameRate,
    setVideoFit,
    setMirror,
    socket,
  } = useMediasoup({
    slug,
    token: token ?? '',
    onError: showToast,
  });

  useEffect(() => {
    if (ready && token) void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    const origOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = origOverflow;
      document.body.style.overscrollBehavior = origOverscroll;
      document.documentElement.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);

  const [startsAt, setStartsAt] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    endpoints
      .publicWebinar(slug)
      .then((res) => {
        if (cancelled) return;
        setStartsAt(res.webinar.startsAt || null);

        // Retain premiere configuration in the live room for seamless synchronized broadcast
        const w = res.webinar;
        if (w.premiereRecordingId) {
          setLocalPremiereRecordingId(w.premiereRecordingId);
          setLocalPremiereStartedAt(w.premiereStartedAt);
        }
      })
      .catch(() => {
        /* the countdown is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [router, slug]);

  function leave() {
    store.getState().reset();
    router.push(`/w/${slug}`);
  }

  if (gateToken) {
    return (
      <JoinGate
        slug={slug}
        token={gateToken}
        onReady={(jwt) => {
          setGateToken(null);
          setToken(jwt);
          setReady(true);
        }}
      />
    );
  }

  if (!ready || joining) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          </div>
          <p className="text-sm text-slate-400">Connecting to the live room…</p>
        </div>
      </main>
    );
  }

  if (error && !connected) {
    if (/awaiting host approval|not approved/i.test(error)) {
      return <PendingApproval slug={slug} title={webinarTitle ?? undefined} />;
    }

    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/15 text-red-400">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5m0 3.5v.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Could not join</h1>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <Link href={`/w/${slug}`} className="btn-ghost mt-6">
            Back to webinar page
          </Link>
        </div>
      </main>
    );
  }

  if (ended) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-500/15 text-brand-300">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 12h14M12 5v14" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Session ended</h1>
          <p className="mt-2 text-sm text-slate-400">
            {error ?? 'Thanks for joining — see you at the next one.'}
          </p>
          <Link href="/" className="btn-primary mt-6">
            Explore more webinars
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden overscroll-none bg-ink-950 select-none">
      {/* ── top bar ─────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-ink-900/70 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Leave button — mobile only; desktop uses the bottom ControlsBar */}
          <button
            onClick={leave}
            title="Leave room"
            aria-label="Leave room"
            className="grid h-8 w-8 place-items-center rounded-md border border-red-500/25 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 active:scale-95 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="hidden sm:block">
            <Logo href="/" />
          </div>
          <div className="hidden h-5 w-px bg-white/10 sm:block" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs sm:text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {webinarTitle || title || 'Live webinar'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {notStarted ? (
            <span className="chip border-white/10 bg-white/[0.04] py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              Waiting
            </span>
          ) : (
            <span className="chip border-red-500/25 bg-red-500/10 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
              </span>
              Live
            </span>
          )}
          {recording && (
            <span
              className="chip border-amber-500/25 bg-amber-500/10 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
              title="This session is being recorded"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Rec
            </span>
          )}
          {(showLiveUsersCount || isStaff) && (
            <span className="chip py-1 text-[10px] font-semibold tabular-nums">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" strokeLinecap="round" />
              </svg>
              {viewerCount}
            </span>
          )}
          {isStaff && (
            <WebRtcHealthBadge socket={socket} onClick={() => setShowDiagnostics(true)} />
          )}
          {isStaff && <HostPanel socket={socket} />}
          <ThemeToggle />
        </div>
      </header>

      {/* ── body ────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Stage column: on mobile it hugs the video (shrink-0), on desktop it takes flex-1 */}
        <div
          className={`flex w-full flex-col overflow-hidden lg:min-w-0 lg:flex-1 lg:h-full ${
            /*
             * A presented file is not a 16:9 video, so it cannot hug its
             * content the way the grid does — a portrait PDF would collapse
             * the deck to the height of its toolbar. Let the column fill the
             * viewport instead and give the deck the leftover space.
             */
            presentation ? 'min-h-0 flex-1' : 'shrink-0'
          }`}
        >
          <div
            className={`relative overflow-hidden ${
              isFullscreen
                ? 'fixed inset-0 z-50 h-screen w-screen bg-black p-0'
                : presentation
                  ? 'flex min-h-0 w-full flex-1 flex-col p-2 pb-0 sm:p-3 sm:pb-0 lg:pb-3'
                  : 'w-full p-2 pb-0 sm:p-3 sm:pb-0 lg:pb-3 lg:h-auto lg:flex-1'
            }`}
            ref={stageRef}
          >
            {waiting ? (
              <div className="aspect-video w-full max-h-[39vh] sm:max-h-[44vh]">
                <WaitingRoom title={webinarTitle ?? ''} startsAt={startsAt} />
              </div>
            ) : isPremiereLive && activePremiereRecordingId ? (
              <PremiereStage
                recordingId={activePremiereRecordingId}
                startedAtMs={premiereStartedAtMs!}
                slug={slug}
                onToggleFullscreen={toggleFullscreen}
              />
            ) : presentation ? (
              /*
               * A file on the stage replaces the video grid entirely, the same
               * way a screen share does. Rendering it beside the grid would
               * shrink a 16:9 deck into a column on a phone, which is exactly
               * the case this feature exists to fix.
               */
              <PresentationStage
                socket={socket}
                isStaff={isStaff}
                onToggleFullscreen={toggleFullscreen}
                onShareScreen={toggleScreenShare}
              />
            ) : (
              <VideoGrid onToggleFullscreen={toggleFullscreen} />
            )}
            <WatermarkOverlay />
            <EnrollmentBanner />
          </div>

          {/* Desktop Controls */}
          {(!presentation || isStaff) && (
            <div className="hidden lg:block shrink-0 px-3 pb-3 pt-1.5">
              <ControlsBar
                socket={socket}
                onToggleMic={toggleMic}
                onToggleCam={toggleCam}
                onShareScreen={toggleScreenShare}
                onLeave={leave}
                canPublish={canPublish}
                handRaised={handRaised}
                onSwitchDevice={switchDevice}
                stageRef={stageRef}
                onSetBackground={setBackground}
                onUploadBackground={uploadBackground}
                onSetNoiseSuppression={setNoiseSuppression}
                onSetEchoCancellation={setEchoCancellation}
                onSetAutoGainControl={setAutoGainControl}
                onSetFrameRate={setFrameRate}
                onSetVideoFit={setVideoFit}
                onSetMirror={setMirror}
              />
            </div>
          )}
        </div>


        {/* Chat / Interaction column: Bottom on mobile, Right sidebar on desktop */}
        <aside className="flex flex-1 lg:flex-none lg:w-[340px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-white/[0.07] bg-ink-950/60 lg:bg-ink-900/40 min-h-0 overflow-hidden">
          {(canSeePeople || canSeeQa || canSeePolls) && (
          <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] bg-ink-900/50 p-1.5">
            {([
              { id: 'chat' as Tab, label: 'Chat', show: true, badge: 0 },
              { id: 'people' as Tab, label: 'People', show: canSeePeople, badge: hands.length },
              { id: 'qa' as Tab, label: 'Q&A', show: canSeeQa, badge: openQuestions },
              { id: 'polls' as Tab, label: 'Polls', show: canSeePolls, badge: 0 },
            ])
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-tight transition ${
                    activeTab === t.id
                      ? 'bg-white/[0.09] text-slate-900 shadow-sm ring-1 ring-white/10 dark:text-white'
                      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {t.label}
                  {t.badge > 0 && (
                    <span className="rounded bg-brand-500/25 px-1 py-px text-[9px] font-bold tabular-nums text-brand-600 dark:text-brand-300">
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
          </div>
          )}

          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            {activeTab === 'chat' ? (
              <ChatPanel
                socket={socket}
                slug={slug}
                onSwitchDevice={switchDevice}
                onToggleMic={toggleMic}
                onToggleCam={toggleCam}
                onShareScreen={toggleScreenShare}
                onLeave={leave}
                canPublish={canPublish}
              />
            ) : activeTab === 'people' ? (
              <ParticipantList socket={socket} />
            ) : activeTab === 'qa' ? (
              <QaPanel socket={socket} />
            ) : (
              <PollsPanel socket={socket} />
            )}
          </div>
        </aside>
      </div>

      <QuizModal socket={socket} />
      <PollModal socket={socket} />
      <AudioRenderer />

      {/*
       * The diagnostics modal lives here, in the mounted room, not in the
       * "connecting" branch — it used to be rendered only while the room was
       * still loading, so clicking the health badge after joining did nothing.
       */}
      <WebRtcDiagnosticsModal
        socket={socket}
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />

      <MediaRequestPrompt
        onAccept={(kind) => {
          if (kind === 'mic') void toggleMic(true);
          else void toggleCam(true);
        }}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-lg border border-white/10 bg-ink-800/95 px-4 py-2.5 text-xs font-medium text-slate-800 shadow-xl backdrop-blur-xl dark:text-slate-200">
          {toast}
        </div>
      )}
    </main>
  );
}
