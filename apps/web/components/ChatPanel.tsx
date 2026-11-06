'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoomStore } from '@/store/roomStore';
import { useMediaDevices } from '@/lib/useRoomUi';
import type { AppSocket } from '@/lib/socket';
import { ChatCtaNotification } from './ChatCtaNotification';

interface ChatPanelProps {
  socket: React.MutableRefObject<AppSocket | null>;
  disabled?: boolean;
  /** The webinar slug, used to build the invite link and key the notes. */
  slug?: string;
  /** Swaps the active microphone. Absent for viewers who cannot publish. */
  onSwitchDevice?: (kind: 'audio' | 'video', deviceId: string) => void;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onShareScreen?: () => void;
  onLeave?: () => void;
  canPublish?: boolean;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

/** Which secondary sheet the action grid has opened, if any. */
type Sheet = 'leaderboard' | 'notes' | 'devices' | 'support' | null;

export function ChatPanel({
  socket,
  disabled,
  slug,
  onSwitchDevice,
  onToggleMic,
  onToggleCam,
  onShareScreen,
  onLeave,
  canPublish,
}: ChatPanelProps) {
  const messages = useRoomStore((s) => s.messages);
  const selfUserId = useRoomStore((s) => s.userId);
  const role = useRoomStore((s) => s.role);
  const hands = useRoomStore((s) => s.hands);
  const quizResults = useRoomStore((s) => s.quizResults);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isStaffRole = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';
  const micOn = useRoomStore((s) => s.micOn);
  const camOn = useRoomStore((s) => s.camOn);
  const screenSharing = useRoomStore((s) => s.screenSharing);
  const isApprovedSpeaker = useRoomStore((s) => s.isApprovedSpeaker);
  const canPublishAudio = useRoomStore((s) => s.canPublishAudio);
  const canPublishVideo = useRoomStore((s) => s.canPublishVideo);
  const showParticipantsToEachOther = useRoomStore((s) => s.showParticipantsToEachOther);
  const allowMic = useRoomStore((s) => s.allowMic);
  const allowVideo = useRoomStore((s) => s.allowVideo);
  const canShareScreen = useRoomStore((s) => s.canShareScreen);
  const canUseAudio =
    isStaffRole ||
    isApprovedSpeaker ||
    Boolean(canPublishAudio) ||
    showParticipantsToEachOther ||
    allowMic;
  const canUseVideo =
    isStaffRole ||
    isApprovedSpeaker ||
    Boolean(canPublishVideo) ||
    showParticipantsToEachOther ||
    allowVideo;

  const handRaised = useMemo(
    () => Boolean(selfUserId && hands.some((h) => h.userId === selfUserId)),
    [hands, selfUserId]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function remove(id: string) {
    socket.current?.emit('chatDelete', { id }, (res) => {
      if (!res.ok) setError(res.error);
    });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !socket.current) return;

    setSending(true);
    setError(null);
    socket.current.emit('chatSend', { text: value }, (res) => {
      setSending(false);
      if (res.ok) setText('');
      else setError(res.error);
    });
  }

  function toggleHand() {
    if (!socket.current) return;
    if (handRaised) socket.current.emit('handLower', () => {});
    else socket.current.emit('handRaise', () => {});
    setActionsOpen(false);
  }

  async function invite() {
    // The public landing page, not the room URL: a forwarded room link would
    // drop the recipient straight into a live session with no name on file.
    const url = `${window.location.origin}/w/${slug ?? ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is blocked in some embedded browsers; showing the
      // link is still useful even when copying is not possible.
      setError(url);
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="hidden lg:flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-mint-500 dark:bg-mint-400" aria-hidden />
          <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">Live chat</h3>
        </div>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400">{messages.length}</span>
      </div>

      {/* CTA notification at top of chat window for participants */}
      <ChatCtaNotification />

      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-slate-500">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-500">No messages yet</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-600">Say hello to get the conversation started</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.system) {
            // An enrollment is the room's best social proof, so it gets a
            // celebratory card rather than the grey pill used for housekeeping
            // lines like "Recording started". Same data, different weight.
            if (msg.kind === 'enrollment') {
              // The feed's phrasing, not the toast's. A chat line is read in a
              // list of other chat lines, so it leads with the congratulation
              // and names the person — "Congratulations! Tamanna for
              // Enrolling" — where the toast over the video is a sentence
              // about what just happened. `actor` is absent on lines replayed
              // from an older recording, so fall back to the server's text.
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2.5 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent px-3 py-2"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/25 text-sm">
                    🎉
                  </span>
                  <p className="text-[12px] font-semibold leading-snug text-amber-700 dark:text-amber-200">
                    {msg.actor ? (
                      <>
                        Congratulations! <span className="text-amber-800 dark:text-amber-100">{msg.actor}</span> for
                        Enrolling
                      </>
                    ) : (
                      msg.text
                    )}
                  </p>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-center">
                <span className="inline-block rounded-full border border-slate-200/70 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-400">
                  {msg.text}
                </span>
              </div>
            );
          }

          const mine = msg.userId === selfUserId;
          const isStaff = msg.role !== 'PARTICIPANT';
          // Staff can delete anyone's message; nobody can delete a system line.
          const canModerate = isStaffRole && !msg.system;

          return (
            <div key={msg.id} className={`group flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
              <div
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ring-1 ${
                  isStaff
                    ? 'bg-gradient-to-br from-brand-400 to-brand-700 text-white ring-brand-500/30'
                    : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.08] dark:text-slate-300 dark:ring-white/10'
                }`}
              >
                {msg.name.slice(0, 2).toUpperCase()}
              </div>

              <div className={`min-w-0 max-w-[82%] ${mine ? 'flex flex-col items-end' : ''}`}>
                <div className={`mb-1 flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  <span className="truncate text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                    {msg.name}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.enrolled && (
                    <span className="shrink-0 rounded bg-mint-500/15 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-mint-700 dark:text-mint-400">
                      Enrolled
                    </span>
                  )}
                  {canModerate && (
                    <button
                      onClick={() => remove(msg.id)}
                      aria-label={`Delete message from ${msg.name}`}
                      title="Delete message"
                      className="shrink-0 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-red-400"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
                <div
                  className={`inline-block break-words rounded-lg px-3 py-2 text-[13px] leading-relaxed shadow-sm ${
                    mine
                      ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white'
                      : isStaff
                        ? 'border border-brand-500/20 bg-brand-500/[0.08] text-slate-800 dark:text-slate-100'
                        : 'border border-slate-200/70 bg-white text-slate-800 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── action grid ─────────────────────────────────────── */}
      {/* Anchored above the composer rather than over the whole room: these are
          chat-adjacent tools, and a full-screen sheet would hide the messages
          the participant opened the sidebar to read. */}
      {actionsOpen && (
        <div className="shrink-0 border-t border-white/[0.07] bg-slate-50/80 p-3 dark:bg-ink-900/95">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quick actions
            </p>
            <button
              onClick={() => setActionsOpen(false)}
              aria-label="Close quick actions"
              className="grid h-5 w-5 place-items-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {canUseAudio && onToggleMic && (
              <ActionTile
                label={micOn ? 'Mute' : 'Unmute'}
                icon={micOn ? '🎙️' : '🔇'}
                active={micOn}
                onClick={() => onToggleMic?.()}
              />
            )}
            {canUseVideo && onToggleCam && (
              <ActionTile
                label={camOn ? 'Stop Video' : 'Start Video'}
                icon={camOn ? '📹' : '🚫'}
                active={camOn}
                onClick={() => onToggleCam?.()}
              />
            )}
            {(isStaffRole || isApprovedSpeaker || canShareScreen) && onShareScreen && (
              <ActionTile
                label={screenSharing ? 'Stop Share' : 'Share Screen'}
                icon="🖥️"
                active={screenSharing}
                onClick={onShareScreen}
              />
            )}
            <ActionTile
              label="Leader Board"
              icon="🏆"
              onClick={() => setSheet('leaderboard')}
            />
            {!isStaffRole && (
              <ActionTile
                label={handRaised ? 'Lower Hand' : 'Raise Hand'}
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 mx-auto"
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
                }
                active={handRaised}
                onClick={toggleHand}
              />
            )}
            <ActionTile label="Class Notes" icon="📝" onClick={() => setSheet('notes')} />
            <ActionTile
              label={copied ? 'Link copied' : 'Invite Others'}
              icon="💬"
              onClick={() => void invite()}
            />
            <ActionTile label="Audio Device" icon="🔊" onClick={() => setSheet('devices')} />
            <ActionTile label="Support" icon="🎧" onClick={() => setSheet('support')} />
            {onLeave && (
              <ActionTile
                label="Leave Room"
                icon="🚪"
                danger
                onClick={onLeave}
              />
            )}
          </div>
        </div>
      )}

      {sheet && (
        <ChatSheet
          sheet={sheet}
          onClose={() => setSheet(null)}
          quizResults={quizResults}
          slug={slug}
          onSwitchDevice={onSwitchDevice}
        />
      )}

      <form onSubmit={send} className="shrink-0 border-t border-white/[0.07] p-3">
        {error && <p className="mb-2 break-all text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        <div className="mb-1.5 flex items-center gap-1 px-0.5 text-[10px] text-slate-400 dark:text-slate-500">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>To</span>
          <span className="font-semibold text-slate-600 dark:text-slate-300">Everyone</span>
        </div>
        <div className="flex items-end gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm transition focus-within:border-brand-400/60 focus-within:ring-2 focus-within:ring-brand-500/15 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <input
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder={disabled ? 'Chat is disabled' : 'Enter a message…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || sending}
            maxLength={1000}
          />

          {/* Mobile view controls beside chat input: Mic, Video, and Three Dots (shown when NOT typing) */}
          {!text.length && (
            <div className="flex lg:hidden items-center gap-1 shrink-0">
              {/* Mic enable/disable */}
              <button
                type="button"
                onClick={() => onToggleMic?.()}
                disabled={!canUseAudio}
                aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                title={micOn ? 'Mute' : 'Unmute'}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${
                  micOn
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:text-red-400'
                }`}
              >
                {micOn ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 4l16 16" strokeLinecap="round" />
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 10.2 5.3M12 17.5V21" strokeLinecap="round" />
                  </svg>
                )}
              </button>

              {/* Video enable/disable */}
              <button
                type="button"
                onClick={() => onToggleCam?.()}
                disabled={!canUseVideo}
                aria-label={camOn ? 'Stop video' : 'Start video'}
                title={camOn ? 'Stop video' : 'Start video'}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${
                  camOn
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:text-red-400'
                }`}
              >
                {camOn ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="6" width="12" height="12" rx="2.5" />
                    <path d="m15 10.5 4.5-2.5v8L15 13.5" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 4l16 16" strokeLinecap="round" />
                    <rect x="3" y="6" width="12" height="12" rx="2.5" />
                    <path d="m15 10.5 4.5-2.5v8L15 13.5" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Three dots (More actions) */}
              <button
                type="button"
                onClick={() => {
                  setActionsOpen((v) => !v);
                  setSheet(null);
                }}
                aria-label="More chat actions"
                title="More actions"
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition active:scale-[0.96] ${
                  actionsOpen
                    ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-200'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>
          )}

          {/* Desktop Three dots (always present on desktop) */}
          <button
            type="button"
            onClick={() => {
              setActionsOpen((v) => !v);
              setSheet(null);
            }}
            aria-label="More chat actions"
            title="More actions"
            className={`hidden lg:grid h-8 w-8 shrink-0 place-items-center rounded-md transition active:scale-[0.96] ${
              actionsOpen
                ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-200'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>

          {/* Send button: Shown on mobile when typing (removes mic/video/dots), always available on desktop */}
          <button
            type="submit"
            className={`${
              text.length > 0 ? 'grid' : 'hidden lg:grid'
            } h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={disabled || sending || !text.trim()}
            aria-label="Send message"
            title="Send message"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m4 12 16-8-6 16-2.5-6.5L4 12Z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

/** One square in the quick-action grid. */
function ActionTile({
  label,
  icon,
  onClick,
  active,
  danger,
}: {
  label: string;
  icon: string | React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-2.5 text-center transition active:scale-[0.98] ${
        danger
          ? 'border-red-500/25 bg-red-500/[0.08] text-red-600 hover:border-red-500/40 hover:bg-red-500/15 dark:text-red-400'
          : active
            ? 'border-amber-400/60 bg-amber-400/20 text-amber-700 shadow-sm dark:text-amber-300'
            : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/[0.07] dark:hover:text-white'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[10px] font-semibold leading-tight tracking-tight">{label}</span>
    </button>
  );
}

/**
 * The sheet behind one quick action.
 *
 * Rendered inline rather than as a portal: it covers the message list but stays
 * inside the sidebar, so the composer and the room controls remain reachable
 * while it is open.
 */
function ChatSheet({
  sheet,
  onClose,
  quizResults,
  slug,
  onSwitchDevice,
}: {
  sheet: Exclude<Sheet, null>;
  onClose: () => void;
  quizResults: ReturnType<typeof useRoomStore.getState>['quizResults'];
  slug?: string;
  onSwitchDevice?: (kind: 'audio' | 'video', deviceId: string) => void;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onShareScreen?: () => void;
  canPublish?: boolean;
}) {
  const { microphones, refresh } = useMediaDevices();
  const [note, setNote] = useState('');
  const storageKey = `notes:${slug ?? 'room'}`;

  useEffect(() => {
    if (sheet !== 'notes') return;
    try {
      setNote(localStorage.getItem(storageKey) ?? '');
    } catch {
      /* private mode */
    }
  }, [sheet, storageKey]);

  useEffect(() => {
    if (sheet === 'devices') void refresh();
  }, [sheet, refresh]);

  function saveNote(value: string) {
    setNote(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* private mode — the note still lives for this session */
    }
  }

  const titles: Record<Exclude<Sheet, null>, string> = {
    leaderboard: 'Leader board',
    notes: 'Class notes',
    devices: 'Audio device',
    support: 'Support',
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-ink-900/95 border-l border-slate-200 dark:border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{titles[sheet]}</h4>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-slate-500 transition hover:text-slate-900 dark:hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {sheet === 'leaderboard' &&
          (quizResults && quizResults.topScorers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">
                Fastest correct answers on “{quizResults.question}”
              </p>
              {quizResults.topScorers.map((s, i) => (
                <div
                  key={s.userId}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-2 shadow-sm"
                >
                  <span className="w-5 text-center text-[11px] font-bold text-slate-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-800 dark:text-slate-200">
                    {s.name}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-mint-400">
                    {(s.elapsedMs / 1000).toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="pt-6 text-center text-[11px] text-slate-500 dark:text-slate-600">
              No quiz results yet. The board fills in once a quiz closes.
            </p>
          ))}

        {sheet === 'notes' && (
          <div className="flex h-full flex-col">
            <p className="mb-2 text-[11px] text-slate-500">
              Private to this device. Nothing here is shared with the host.
            </p>
            <textarea
              value={note}
              onChange={(e) => saveNote(e.target.value)}
              placeholder="Jot down anything worth remembering…"
              className="input min-h-[180px] flex-1 resize-none py-2 text-[12px] leading-relaxed"
            />
          </div>
        )}

        {sheet === 'devices' && (
          <div className="space-y-1">
            {!onSwitchDevice && (
              <p className="text-[11px] text-slate-500">
                You are not publishing audio, so there is nothing to switch.
              </p>
            )}
            {onSwitchDevice && microphones.length === 0 && (
              <p className="text-[11px] text-slate-500">No microphone found.</p>
            )}
            {onSwitchDevice &&
              microphones.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => {
                    onSwitchDevice('audio', d.deviceId);
                    onClose();
                  }}
                  className="block w-full truncate rounded-lg px-2 py-2 text-left text-[12px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  {d.label}
                </button>
              ))}
          </div>
        )}

        {sheet === 'support' && (
          <div className="space-y-3 text-[12px] text-slate-300">
            <p>Stuck? Reach the team running this session.</p>
            <a
              href="mailto:support@webinar.local?subject=Help%20with%20a%20live%20session"
              className="btn-ghost block w-full py-2 text-center text-[12px]"
            >
              Email support
            </a>
            <p className="text-[11px] text-slate-500">
              Include the webinar name and roughly what time it happened — it
              makes the session easy to find.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
