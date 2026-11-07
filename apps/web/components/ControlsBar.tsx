'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRoomStore } from '@/store/roomStore';
import { useFullscreen, useMediaDevices } from '@/lib/useRoomUi';
import type { AppSocket } from '@/lib/socket';
import type { BackgroundImage, BackgroundMode } from '@/lib/backgroundEffects';
import type { VideoFit } from '@/lib/mediaPrefs';
import { MediaSettingsPanel } from './MediaSettingsPanel';

interface ControlsBarProps {
  socket: React.MutableRefObject<AppSocket | null>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onShareScreen: () => void;
  onLeave: () => void;
  canPublish: boolean;
  handRaised: boolean;
  /** Swaps the live camera/mic track without renegotiating. */
  onSwitchDevice?: (kind: 'audio' | 'video', deviceId: string) => void;
  /** Element that should go fullscreen — the stage, not the whole page. */
  stageRef?: React.RefObject<HTMLElement | null>;
  compact?: boolean;
  className?: string;
  /* media effects */
  onSetBackground?: (mode: BackgroundMode, image?: BackgroundImage | null) => void;
  onUploadBackground?: (file: File) => Promise<string | null>;
  onSetNoiseSuppression?: (enabled: boolean) => void;
  onSetEchoCancellation?: (enabled: boolean) => void;
  onSetAutoGainControl?: (enabled: boolean) => void;
  onSetFrameRate?: (fps: number) => void;
  onSetVideoFit?: (fit: VideoFit) => void;
  onSetMirror?: (mirror: boolean) => void;
}

function IconButton({
  active,
  danger,
  label,
  onClick,
  disabled,
  compact,
  className = '',
  buttonRef,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`group relative grid ${compact ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-10 w-10'} place-items-center rounded-lg border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-red-500/30 bg-red-500/90 text-white hover:bg-red-500'
          : active
            ? 'border-slate-300 bg-slate-200 text-slate-900 hover:bg-slate-300 dark:border-white/20 dark:bg-white/15 dark:text-white dark:hover:bg-white/25'
            : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.12] dark:hover:text-white'
      } ${className}`}
    >
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-[10px] font-medium text-slate-200 opacity-0 shadow-lg ring-1 ring-white/10 transition group-hover:opacity-100 dark:bg-ink-800">
        {label}
      </span>
    </button>
  );
}

export function ControlsBar({
  socket,
  onToggleMic,
  onToggleCam,
  onShareScreen,
  onLeave,
  canPublish,
  handRaised,
  onSwitchDevice,
  stageRef,
  compact,
  className,
  onSetBackground,
  onUploadBackground,
  onSetNoiseSuppression,
  onSetEchoCancellation,
  onSetAutoGainControl,
  onSetFrameRate,
  onSetVideoFit,
  onSetMirror,
}: ControlsBarProps) {
  const micOn = useRoomStore((s) => s.micOn);
  const camOn = useRoomStore((s) => s.camOn);
  const screenSharing = useRoomStore((s) => s.screenSharing);
  const isApprovedSpeaker = useRoomStore((s) => s.isApprovedSpeaker);
  const canPublishAudio = useRoomStore((s) => s.canPublishAudio);
  const canPublishVideo = useRoomStore((s) => s.canPublishVideo);
  const role = useRoomStore((s) => s.role);
  const hands = useRoomStore((s) => s.hands);
  const backgroundMode = useRoomStore((s) => s.backgroundMode);
  const showParticipantsToEachOther = useRoomStore((s) => s.showParticipantsToEachOther);
  const allowMic = useRoomStore((s) => s.allowMic);
  const allowVideo = useRoomStore((s) => s.allowVideo);
  const canShareScreen = useRoomStore((s) => s.canShareScreen);
  const allowParticipantFullscreen = useRoomStore((s) => s.allowParticipantFullscreen);
  const isStaff = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';
  const canFullscreen = isStaff || allowParticipantFullscreen;

  const canUseAudio =
    isStaff ||
    isApprovedSpeaker ||
    Boolean(canPublishAudio) ||
    showParticipantsToEachOther ||
    allowMic;
  const canUseVideo =
    isStaff ||
    isApprovedSpeaker ||
    Boolean(canPublishVideo) ||
    showParticipantsToEachOther ||
    allowVideo;
  const canUseMedia = canUseAudio || canUseVideo;
  const canConfigureMedia =
    canUseMedia &&
    Boolean(
      onSetBackground &&
        onUploadBackground &&
        onSetNoiseSuppression &&
        onSetEchoCancellation &&
        onSetAutoGainControl &&
        onSetFrameRate &&
        onSetVideoFit &&
        onSetMirror
    );

  const fallbackRef = useRef<HTMLElement | null>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(
    stageRef ?? fallbackRef
  );
  useEffect(() => {
    if (!isStaff && !allowParticipantFullscreen) {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [isStaff, allowParticipantFullscreen]);

  const { cameras, microphones, refresh } = useMediaDevices();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPopRef = useRef<HTMLDivElement>(null);
  const mediaBtnRef = useRef<HTMLButtonElement>(null);

  /**
   * Both popovers are portalled to `document.body` and positioned from their
   * trigger's rect. Every ancestor between this bar and the page root clips
   * overflow, so an absolutely-positioned child would be cut off behind the
   * video tile instead of floating above it.
   */
  const [popPos, setPopPos] = useState<{ left: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    if (!settingsOpen) return;
    function update() {
      const el = settingsBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 264;
      // A zero-size rect means the trigger is hidden (the bar is `hidden` below
      // `lg`); fall back to a centred popover instead of anchoring to 0,0.
      const anchored = r.width > 0 && r.height > 0;
      const left = anchored
        ? Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8))
        : Math.max(8, window.innerWidth / 2 - width / 2);
      const bottom = anchored ? Math.max(16, window.innerHeight - r.top + 10) : 16;
      setPopPos({ left, bottom });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [settingsOpen]);

  // Close the device popover on outside click or Escape.
  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (settingsRef.current?.contains(target)) return;
      if (settingsPopRef.current?.contains(target)) return;
      setSettingsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  function openSettings() {
    // Labels are blank until permission has been granted once, so re-read the
    // device list every time the popover opens.
    void refresh();
    setSettingsOpen((v) => !v);
  }

  function toggleHand() {
    if (!socket.current) return;
    if (handRaised) socket.current.emit('handLower', () => {});
    else socket.current.emit('handRaise', () => {});
  }

  return (
    <div
      className={`relative flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-white/[0.08] bg-ink-850/70 ${
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      } backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] ${className ?? ''}`}
    >
      <IconButton compact={compact}
        label={micOn ? 'Mute' : 'Unmute'}
        active={micOn}
        danger={!micOn}
        onClick={() => onToggleMic?.()}
        disabled={!canUseAudio}

      >
        {micOn ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4l16 16" strokeLinecap="round" />
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 10.2 5.3M12 17.5V21" strokeLinecap="round" />
          </svg>
        )}
      </IconButton>

      <IconButton compact={compact}
        label={camOn ? 'Stop video' : 'Start video'}
        active={camOn}
        danger={!camOn}
        onClick={() => onToggleCam?.()}
        disabled={!canUseVideo}

      >
        {camOn ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="6" width="12" height="12" rx="2.5" />
            <path d="m15 10.5 4.5-2.5v8L15 13.5" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4l16 16" strokeLinecap="round" />
            <rect x="3" y="6" width="12" height="12" rx="2.5" />
            <path d="m15 10.5 4.5-2.5v8L15 13.5" strokeLinejoin="round" />
          </svg>
        )}
      </IconButton>

      {(isStaff || isApprovedSpeaker || canShareScreen) && (
        <IconButton compact={compact}
          label={screenSharing ? 'Stop sharing' : 'Share screen'}
          active={screenSharing}
          onClick={onShareScreen}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4.5" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16.5V20" strokeLinecap="round" />
          </svg>
        </IconButton>
      )}

      {!isStaff && (
        <IconButton compact={compact}
          label={handRaised ? 'Lower hand' : 'Raise hand'}
          active={false}
          className={handRaised ? '!border-amber-400 !bg-amber-400/25 !text-amber-500 shadow-sm' : ''}
          onClick={toggleHand}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 transition-transform duration-200 ${handRaised ? 'scale-110' : ''}`}
            fill={handRaised ? '#facc15' : 'none'}
            stroke={handRaised ? '#b45309' : 'currentColor'}
            strokeWidth="1.8"
          >
            <path
              d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11m0 0V4.5a1.5 1.5 0 0 1 3 0V11m0 0V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-2.5a1.5 1.5 0 0 1 3 0V13"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
      )}

      {isStaff && hands.length > 0 && (
        <span className="ml-1 rounded-md bg-accent-500/15 px-2 py-1 text-[11px] font-semibold text-accent-600 dark:text-accent-400">
          {hands.length} hand{hands.length > 1 ? 's' : ''} up
        </span>
      )}

      <div className="mx-1 h-6 w-px bg-white/10" />

      <IconButton compact={compact}
        label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        active={isFullscreen}
        onClick={() => void toggleFullscreen()}
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </IconButton>

      {canUseMedia && onSwitchDevice && (
        <div className="relative" ref={settingsRef}>
          <IconButton compact={compact}
            buttonRef={settingsBtnRef}
            label="Devices"
            active={settingsOpen}
            onClick={openSettings}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>

          {settingsOpen && popPos && typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={settingsPopRef}
                role="dialog"
                aria-label="Devices"
                style={{ left: popPos.left, bottom: popPos.bottom }}
                className="fixed z-[60] w-[264px] animate-fade-up overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-ink-900 dark:ring-white/[0.04]"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2 dark:border-white/[0.07]">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-brand-500/15 text-brand-600 dark:text-brand-300">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="4" width="16" height="12" rx="2" />
                        <path d="M8 20h8M12 16v4" strokeLinecap="round" />
                      </svg>
                    </span>
                    <p className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-white">Devices</p>
                  </div>
                  <button
                    onClick={() => setSettingsOpen(false)}
                    aria-label="Close devices"
                    className="grid h-5 w-5 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div className="scrollbar-thin max-h-[min(60vh,22rem)] space-y-3 overflow-y-auto p-2.5">
                  <div>
                    <p className="mb-1 flex items-center gap-1 px-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
                      </svg>
                      Microphone
                    </p>
                    <div className="space-y-0.5">
                      {microphones.length === 0 && (
                        <p className="px-1.5 py-1 text-[10px] text-slate-400 dark:text-slate-500">No microphone found</p>
                      )}
                      {microphones.map((d) => (
                        <button
                          key={d.deviceId}
                          onClick={() => {
                            onSwitchDevice('audio', d.deviceId);
                            setSettingsOpen(false);
                          }}
                          className="block w-full truncate rounded-md px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-slate-200/80 dark:bg-white/[0.07]" />

                  <div>
                    <p className="mb-1 flex items-center gap-1 px-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <rect x="3" y="6" width="12" height="12" rx="2.5" />
                        <path d="m15 10.5 4.5-2.5v8L15 13.5" strokeLinejoin="round" />
                      </svg>
                      Camera
                    </p>
                    <div className="space-y-0.5">
                      {cameras.length === 0 && (
                        <p className="px-1.5 py-1 text-[10px] text-slate-400 dark:text-slate-500">No camera found</p>
                      )}
                      {cameras.map((d) => (
                        <button
                          key={d.deviceId}
                          onClick={() => {
                            onSwitchDevice('video', d.deviceId);
                            setSettingsOpen(false);
                          }}
                          className="block w-full truncate rounded-md px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}
        </div>
      )}

      {canConfigureMedia && (
        <IconButton compact={compact}
          buttonRef={mediaBtnRef}
          label="Media settings"
          active={mediaOpen || backgroundMode !== 'off'}
          onClick={() => setMediaOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      )}

      <IconButton compact={compact} label="Leave" danger onClick={onLeave}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" />
          <path d="M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </IconButton>

      {mediaOpen && canConfigureMedia && (
        <MediaSettingsPanel
          anchorEl={mediaBtnRef.current}
          onClose={() => setMediaOpen(false)}
          onSetBackground={onSetBackground!}
          onUploadBackground={onUploadBackground!}
          onSetNoiseSuppression={onSetNoiseSuppression!}
          onSetEchoCancellation={onSetEchoCancellation!}
          onSetAutoGainControl={onSetAutoGainControl!}
          onSetFrameRate={onSetFrameRate!}
          onSetVideoFit={onSetVideoFit!}
          onSetMirror={onSetMirror!}
        />
      )}
    </div>
  );
}
