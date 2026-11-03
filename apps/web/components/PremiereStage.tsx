'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessagePayload,
  CtaPayload,
  PollResults,
  PublicPoll,
  PublicQuiz,
  QuizResults,
  RecordingDetail,
  TimelineEvent,
} from '@webinar/shared';
import { API_URL, endpoints } from '@/lib/api';
import { useRoomStore } from '@/store/roomStore';
import { useReplayLayout } from '@/lib/useReplayLayout';
import { useIsFullscreen } from '@/lib/useRoomUi';
import { VideoTile } from './VideoTile';

interface PremiereStageProps {
  recordingId: string;
  startedAtMs: number;
  slug: string;
  onToggleFullscreen?: () => void;
}

function UserCountCard({ count, vertical = false }: { count: number; vertical?: boolean }) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-ink-900/90 shadow-sm backdrop-blur ${
        vertical ? 'w-full py-3 sm:py-4 aspect-video' : 'h-20 w-20 sm:h-24 sm:w-28'
      }`}
    >
      <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      </div>
      <span className="rounded-full bg-brand-500/15 dark:bg-brand-500/25 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-brand-600 dark:text-brand-300">
        +{count}
      </span>
    </div>
  );
}

function FullscreenButton({ onClick, isFs = false }: { onClick?: () => void; isFs?: boolean }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/20 bg-white/90 dark:bg-black/70 text-slate-800 dark:text-white px-2.5 py-1.5 text-[11px] font-semibold shadow-lg backdrop-blur-md transition hover:bg-white dark:hover:bg-black/90 active:scale-95"
      aria-label={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
        {isFs ? (
          <path
            d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span>{isFs ? 'Exit' : 'Fullscreen'}</span>
    </button>
  );
}

export function PremiereStage({
  recordingId,
  startedAtMs,
  slug,
  onToggleFullscreen,
}: PremiereStageProps) {
  const [data, setData] = useState<RecordingDetail | null>(null);
  const [positionMs, setPositionMs] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  // Read local participant state from store
  const localStream = useRoomStore((s) => s.localStream);
  const camOn = useRoomStore((s) => s.camOn);
  const micOn = useRoomStore((s) => s.micOn);
  const role = useRoomStore((s) => s.role);
  const userId = useRoomStore((s) => s.userId);
  const hands = useRoomStore((s) => s.hands);
  const selfName = useRoomStore((s) => s.name) || 'You';
  const handRaised = Boolean(userId && hands.some((h) => h.userId === userId));

  const liveViewerCount = useRoomStore((s) => s.viewerCount);
  const isFullscreen = useIsFullscreen();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hostCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const dispatchedChatRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  const durationMs = data?.durationMs ?? 0;
  const layout = useReplayLayout(data?.timeline ?? [], positionMs);

  // Compute realistic viewer count (combines timeline attendees + real live count)
  const displayViewerCount = useMemo(() => {
    const timelineAttendees = layout.attendees.length;
    return Math.max(liveViewerCount, timelineAttendees, 1);
  }, [liveViewerCount, layout.attendees.length]);

  /* ── 1. Fetch recording metadata and interactive timeline ────── */
  useEffect(() => {
    if (!recordingId) return;
    let cancelled = false;

    endpoints
      .replayById(recordingId)
      .then((res) => {
        if (!cancelled && res.recording) {
          setData(res.recording);
        }
      })
      .catch(() => {
        /* Graceful fallback if recording timeline fetch encounters error */
      });

    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  /* ── 2. Initialize video position from wall-clock ────────────── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const initialOffsetMs = Math.max(0, Date.now() - startedAtMs);
    setPositionMs(initialOffsetMs);

    video.currentTime = initialOffsetMs / 1000;
    video.muted = true;
    setIsMuted(true);

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
        });
    }

    const hostCam = hostCamVideoRef.current;
    if (hostCam) {
      hostCam.currentTime = initialOffsetMs / 1000;
      hostCam.muted = true;
      hostCam.play().catch(() => undefined);
    }
  }, [recordingId, startedAtMs]);

  /* ── 3. High-precision sync clock & drift correction ─────────── */
  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      const video = videoRef.current;
      const nowOffsetMs = Math.max(0, Date.now() - startedAtMs);

      if (durationMs > 0 && nowOffsetMs >= durationMs) {
        setHasEnded(true);
        setPositionMs(durationMs);
        if (video && !video.paused) video.pause();
        return;
      }

      setHasEnded(false);
      setPositionMs(nowOffsetMs);

      // Keep playback in sync if tab throttling occurred
      if (video && isPlaying && !video.paused) {
        const videoTimeMs = video.currentTime * 1000;
        if (Math.abs(videoTimeMs - nowOffsetMs) > 2500) {
          video.currentTime = nowOffsetMs / 1000;
        }
      }

      // Sync secondary host camera stream in lockstep
      const hostCam = hostCamVideoRef.current;
      if (video && hostCam) {
        if (!video.paused && hostCam.paused) {
          hostCam.play().catch(() => undefined);
        } else if (video.paused && !hostCam.paused) {
          hostCam.pause();
        }
        if (Math.abs(hostCam.currentTime - video.currentTime) > 0.2) {
          hostCam.currentTime = video.currentTime;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startedAtMs, durationMs, isPlaying]);

  /* ── 4. Periodic drift correction fallback (for throttled rAF) ─ */
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const targetSec = Math.max(0, (Date.now() - startedAtMs) / 1000);
      if (durationMs > 0 && targetSec * 1000 >= durationMs) {
        setHasEnded(true);
        return;
      }
      if (Math.abs(video.currentTime - targetSec) > 2) {
        video.currentTime = targetSec;
      }
      const hostCam = hostCamVideoRef.current;
      if (hostCam && Math.abs(hostCam.currentTime - targetSec) > 2) {
        hostCam.currentTime = targetSec;
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [startedAtMs, durationMs]);

  /* ── 5. Unmute Handler ───────────────────────────────────────── */
  const unmute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setIsMuted(false);
    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch(() => undefined);
    }
  }, []);

  /* ── 6. Feed timeline events into roomStore ─────────────────── */
  useEffect(() => {
    if (!data?.timeline) return;

    const timeline = data.timeline;
    const bucket = positionMs;

    const pastEvents = timeline.filter((e) => e.t <= bucket);

    // Sync chat messages
    for (const e of pastEvents) {
      if (e.type === 'chat') {
        const msg = e.message;
        if (!dispatchedChatRef.current.has(msg.id)) {
          dispatchedChatRef.current.add(msg.id);
          const exists = useRoomStore.getState().messages.some((m) => m.id === msg.id);
          if (!exists) {
            useRoomStore.getState().addMessage(msg);
          }
        }
      }
    }

    // Sync active quiz
    let currentQuiz: PublicQuiz | null = null;
    let currentQuizResults: QuizResults | null = null;
    for (const e of pastEvents) {
      if (e.type === 'quizStarted') {
        currentQuiz = e.quiz;
        currentQuizResults = null;
      } else if (e.type === 'quizResults') {
        currentQuizResults = e.results;
      } else if (e.type === 'quizClosed') {
        currentQuiz = null;
      }
    }
    const storeState = useRoomStore.getState();
    if (storeState.activeQuiz?.id !== currentQuiz?.id) {
      useRoomStore.getState().set({
        activeQuiz: currentQuiz,
        quizResults: currentQuizResults,
      });
    }

    // Sync active CTA
    let currentCta: CtaPayload | null = null;
    for (const e of pastEvents) {
      if (e.type === 'ctaShown') {
        currentCta = e.cta;
      } else if (e.type === 'ctaHidden') {
        currentCta = null;
      }
    }
    if (storeState.activeCta?.id !== currentCta?.id) {
      useRoomStore.getState().set({ activeCta: currentCta });
    }

    // Sync active Poll
    let currentPoll: PublicPoll | null = null;
    let currentPollResults: PollResults | null = null;
    for (const e of pastEvents) {
      if (e.type === 'pollStarted') {
        currentPoll = e.poll;
        currentPollResults = null;
      } else if (e.type === 'pollResults') {
        currentPollResults = e.results;
      } else if (e.type === 'pollClosed') {
        currentPoll = null;
      }
    }
    if (storeState.activePoll?.id !== currentPoll?.id) {
      useRoomStore.getState().set({
        activePoll: currentPoll,
        pollResults: currentPollResults,
      });
    }
  }, [data, positionMs]);

  const mediaUrl = `${API_URL}/api/recordings/${recordingId}/media`;

  /* ── 1. FULLSCREEN MODE (Presentation BIG on left, videos & count at RIGHT side) ── */
  if (isFullscreen) {
    return (
      <div className="flex h-full w-full flex-row gap-2 bg-slate-900 dark:bg-ink-950 p-2 overflow-hidden select-none">
        {/* Main Stage (Screen Share Presentation BIG on the left) */}
        <div
          className="relative min-w-0 flex-1 h-full rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black shadow-sm group cursor-pointer"
          onClick={() => {
            if (isMuted) unmute();
          }}
        >
          <video
            ref={videoRef}
            src={mediaUrl}
            className="h-full w-full object-contain bg-black"
            playsInline
            controls={false}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onContextMenu={(e) => e.preventDefault()}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {/* Live Audio Unmute Banner */}
          {isMuted && !hasEnded && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  unmute();
                }}
                className="flex items-center gap-2.5 rounded-full border border-brand-400/50 bg-gradient-to-r from-brand-600/95 to-indigo-600/95 hover:from-brand-500 hover:to-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition transform active:scale-95 animate-pulse"
              >
                <span className="text-sm">🔊</span>
                <span>Live audio is muted — Click to listen</span>
              </button>
            </div>
          )}

          {/* Top-Left Live Status Badges */}
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/25 px-2.5 py-1 text-[11px] font-bold text-red-200 backdrop-blur-md shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              LIVE
            </span>
            {layout.screenShareActive && (
              <div className="flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-sky-200 shadow-xl backdrop-blur-md">
                <svg viewBox="0 0 24 24" className="h-3 w-3 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                <span>Screen Share • {layout.presenterName || 'Presenter'}</span>
              </div>
            )}
          </div>

          {/* Bottom-Left Presenter Badge */}
          {!hasEnded && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md shadow-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-100">{layout.presenterName || 'Host'}</span>
              <span className="rounded bg-brand-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-300">
                {layout.screenShareActive ? 'Presenting' : 'Host'}
              </span>
            </div>
          )}

          {/* Post-Session Conclusion Screen */}
          {hasEnded && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink-950/95 px-6 text-center backdrop-blur-md animate-fade-in">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-500/20 text-brand-400 border border-brand-500/30 mb-4 shadow-xl">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Live Broadcast Concluded</h3>
            </div>
          )}

          <FullscreenButton onClick={onToggleFullscreen} isFs={true} />
        </div>

        {/* Right Vertical Filmstrip: Host Video, Participant Tile & User Count Tile */}
        <div className="w-32 sm:w-44 lg:w-48 shrink-0 flex flex-col gap-2 overflow-y-auto h-full pr-1">
          {/* Host Video Tile (when screen share is active) */}
          {layout.screenShareActive && (
            <div className="relative w-full aspect-video shrink-0 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-900 shadow-sm group">
              <video
                ref={hostCamVideoRef}
                src={`${mediaUrl}?track=cam`}
                muted
                playsInline
                autoPlay
                className="h-full w-full object-cover"
                controls={false}
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                onContextMenu={(e) => e.preventDefault()}
              />
              <div className="absolute bottom-1.5 left-1.5 z-10 flex items-center gap-1 max-w-[85%] rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] sm:text-[10px] text-white backdrop-blur">
                <span className="truncate font-semibold">{layout.presenterName || 'Host'}</span>
                <span className="shrink-0 rounded bg-brand-500/30 px-1 text-[8px] font-bold text-brand-300">
                  HOST
                </span>
              </div>
            </div>
          )}

          {/* Participant's Own Tile */}
          <VideoTile
            stream={localStream}
            name={`${selfName} (You)`}
            role={role || 'PARTICIPANT'}
            isLocal={true}
            micOn={micOn}
            camOn={camOn}
            paused={false}
            handRaised={handRaised}
            className="w-full aspect-video shrink-0 rounded-xl"
          />

          {/* Live Viewer Count Card (Vertical) */}
          <UserCountCard count={displayViewerCount} vertical={true} />
        </div>
      </div>
    );
  }

  /* ── 2. NORMAL MODE (Top Filmstrip + Stage Below) ── */
  return (
    <div className="relative flex h-full flex-col gap-1.5 sm:gap-2 overflow-hidden select-none">
      {/* ── Top Strip: Host Video Tile + Participant's Own Tile & Live Viewer Count Card ── */}
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
        {/* Host Video Tile: Displayed at top when screen share is active (exact match to live webinar layout) */}
        {layout.screenShareActive && (
          <div className="relative h-20 w-24 sm:h-24 sm:w-28 shrink-0 rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-900 shadow-sm group">
            <video
              ref={hostCamVideoRef}
              src={`${mediaUrl}?track=cam`}
              muted
              playsInline
              autoPlay
              className="h-full w-full object-cover"
              controls={false}
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Host badge */}
            <div className="absolute bottom-1.5 left-1.5 z-10 flex items-center gap-1 max-w-[85%] rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] sm:text-[10px] text-white backdrop-blur">
              <span className="truncate font-semibold">{layout.presenterName || 'Host'}</span>
              <span className="shrink-0 rounded bg-brand-500/30 px-1 text-[8px] font-bold text-brand-300">
                HOST
              </span>
            </div>
          </div>
        )}

        {/* Participant's Own Tile: Shows live camera if ON, or Initials Avatar with mic status if OFF */}
        <VideoTile
          stream={localStream}
          name={`${selfName} (You)`}
          role={role || 'PARTICIPANT'}
          isLocal={true}
          micOn={micOn}
          camOn={camOn}
          paused={false}
          handRaised={handRaised}
          className="h-20 w-24 sm:h-24 sm:w-28 shrink-0 rounded-xl sm:rounded-2xl"
        />

        {/* Live People Count Tile */}
        <UserCountCard count={displayViewerCount} />
      </div>

      {/* ── Main Stage: Complete Recorded Live Presentation with Host ── */}
      <div
        className="relative min-h-0 flex-1 aspect-video w-full max-h-[36vh] sm:max-h-[42vh] lg:max-h-none lg:aspect-auto rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black shadow-2xl mx-auto group cursor-pointer"
        onClick={() => {
          if (isMuted) unmute();
        }}
      >
        {/* The Synchronized Live Stage Video - 100% uncropped slides matching live webinar */}
        <video
          ref={videoRef}
          src={mediaUrl}
          className="h-full w-full object-contain bg-black" 
          playsInline
          controls={false}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Live Audio Unmute Banner */}
        {isMuted && !hasEnded && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                unmute();
              }}
              className="flex items-center gap-2.5 rounded-full border border-brand-400/50 bg-gradient-to-r from-brand-600/95 to-indigo-600/95 hover:from-brand-500 hover:to-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition transform active:scale-95 animate-pulse"
            >
              <span className="text-sm">🔊</span>
              <span>Live audio is muted — Click to listen</span>
            </button>
          </div>
        )}

        {/* Top-Left Live Status Badges */}
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
          {/* Pulsing Live Badge */}
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/25 px-2.5 py-1 text-[11px] font-bold text-red-200 backdrop-blur-md shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>

          {/* Screen Share badge */}
          {layout.screenShareActive && (
            <div className="flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-sky-200 shadow-xl backdrop-blur-md">
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <span>Screen Share • {layout.presenterName || 'Presenter'}</span>
            </div>
          )}
        </div>

        {/* Bottom-Left Presenter Badge */}
        {!hasEnded && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md shadow-lg">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-100">{layout.presenterName || 'Host'}</span>
            <span className="rounded bg-brand-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-300">
              {layout.screenShareActive ? 'Presenting' : 'Host'}
            </span>
          </div>
        )}

        {/* Post-Session Conclusion Screen */}
        {hasEnded && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink-950/95 px-6 text-center backdrop-blur-md animate-fade-in">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-500/20 text-brand-400 border border-brand-500/30 mb-4 shadow-xl">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Live Broadcast Concluded</h3>
            <p className="mt-2 text-sm text-slate-400 max-w-md">
              Thank you for attending today&apos;s live masterclass. Stay tuned for the upcoming interactive sessions!
            </p>
          </div>
        )}

        {/* Fullscreen Button */}
        <FullscreenButton onClick={onToggleFullscreen} />
      </div>
    </div>
  );
}
