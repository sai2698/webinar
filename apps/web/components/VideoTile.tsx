'use client';

import { useEffect, useRef } from 'react';
import { preferLayer, preferAutoLayer } from '@/lib/consumerRegistry';
import { useInView } from '@/lib/useRoomUi';
import { useRoomStore } from '@/store/roomStore';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  role?: string;
  muted?: boolean;
  isLocal?: boolean;
  micOn?: boolean;
  camOn?: boolean;
  speaking?: boolean;
  paused?: boolean;
  className?: string;
  objectFit?: 'cover' | 'contain';
  /** True when this tile is showing a display capture rather than a camera. */
  isScreen?: boolean;
  /** Producer id — enables simulcast layer selection for this tile. */
  producerId?: string;
  /**
   * Which simulcast layer this tile should pull. Thumbnails ask for the low
   * layer so a 50-person grid does not download 50 × 720p streams.
   */
  layer?: 0 | 1 | 2;
}

export function VideoTile({
  stream,
  name,
  role,
  muted = false,
  isLocal = false,
  micOn = true,
  camOn = true,
  speaking = false,
  paused = false,
  className = '',
  objectFit = 'cover',
  isScreen = false,
  producerId,
  layer,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fit and mirror are the viewer's own preferences, so they only apply to
  // the local preview — a remote tile must render exactly as its owner sent it.
  const preferredFit = useRoomStore((s) => s.videoFit);
  const preferredMirror = useRoomStore((s) => s.mirror);

  // Off-screen tiles stay as placeholders: no <video> element, no layer
  // request, no decoded frames. In a large grid this is the difference
  // between downloading four streams and downloading forty.
  const inView = useInView(rootRef);
  const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0) && (isScreen || camOn) && !paused;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!hasVideo) {
      if (el.srcObject) el.srcObject = null;
      return;
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {
        /* autoplay may be blocked until user gesture */
      });
    }
  }, [stream, inView, hasVideo]);

  /* ── simulcast layer selection ─────────────────────────── */
  useEffect(() => {
    if (!producerId || isLocal || isScreen) return;
    // A tile that is not on screen should not be pulling any layer at all.
    if (!inView) {
      preferAutoLayer(producerId);
      return;
    }
    if (layer === undefined) {
      preferAutoLayer(producerId);
      return;
    }
    preferLayer(producerId, layer);
    // Restore automatic selection when this tile unmounts so the SFU can
    // adapt to bandwidth again for whoever renders it next.
    return () => preferAutoLayer(producerId);
  }, [producerId, layer, isLocal, isScreen, inView]);
  // A screen share is always letterboxed so nothing gets cropped away, and it
  // is never mirrored — text would read backwards.
  const fit = isScreen ? 'contain' : isLocal ? preferredFit : objectFit;
  const mirrored = isLocal && !isScreen && preferredMirror;
  const objectFitClass =
    fit === 'cover'
      ? 'object-cover'
      : fit === 'contain'
        ? 'object-contain'
        : fit === 'fill'
          ? 'object-fill'
          : fit === 'scale-down'
            ? 'object-scale-down'
            : 'object-none';
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      ref={rootRef}
      className={`group relative overflow-hidden rounded-2xl border bg-ink-900 transition-all duration-300 ${hasVideo ? 'border-sky-500/80 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]' : speaking ? 'border-mint-400/60 shadow-[0_0_0_1px_rgba(61,220,151,0.4),0_0_40px_-10px_rgba(61,220,151,0.5)]' : 'border-white/10'} ${className}`}
    >
      {inView ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted || isLocal}
          style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
          className={`h-full w-full ${objectFitClass} ${
            hasVideo ? 'opacity-100' : 'opacity-0'
          } transition-opacity duration-300`}
        />
      ) : (
        // Placeholder keeps the tile's box so the grid does not reflow when
        // the tile scrolls into view and the real video mounts.
        <div className="h-full w-full bg-ink-950" aria-hidden />
      )}

      {isScreen && hasVideo && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-brand-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" strokeLinecap="round" />
          </svg>
          Presenting
        </div>
      )}

      {!hasVideo && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-gradient-to-br from-ink-800 to-ink-950 p-2">
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="relative grid h-9 w-9 sm:h-14 sm:w-14 place-items-center rounded-full bg-gradient-to-br from-brand-500/40 to-brand-800/30 text-xs sm:text-lg font-bold text-white ring-1 ring-white/10">
              {initials || '?'}
              {speaking && (
                <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-mint-400/60" />
              )}
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-slate-400 truncate max-w-[85px] sm:max-w-none text-center">
              {isScreen ? 'Screen share ended' : paused ? 'Camera paused' : 'Camera off'}
            </span>
          </div>
        </div>
      )}

      {/* name plate pill with mic status */}
      <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-20 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 backdrop-blur-sm">
        {!micOn ? (
          <span className="shrink-0 text-red-400" title="Muted">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 4l16 16" strokeLinecap="round" />
              <path d="M9 9v3a3 3 0 0 0 4.5 2.6M15 11V6a3 3 0 0 0-5.6-1.5" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <span
            className={`shrink-0 ${speaking ? 'text-mint-400 animate-pulse' : 'text-slate-300'}`}
            title={speaking ? 'Speaking' : 'Microphone on'}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <span className="truncate text-[10px] sm:text-xs font-semibold text-white drop-shadow">
          {name}
          {isLocal && <span className="ml-1 text-white/60">(you)</span>}
        </span>
        {role && role !== 'PARTICIPANT' && (
          <span className="shrink-0 rounded bg-brand-500/90 px-1 py-0.2 text-[8px] font-bold uppercase tracking-wide text-white">
            {role === 'ADMIN' ? 'Admin' : role === 'HOST' ? 'Host' : 'Mod'}
          </span>
        )}
      </div>
    </div>
  );
}
