'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRoomStore } from '@/store/roomStore';
import type { AppSocket } from '@/lib/socket';
import type { PeerInfo } from '@webinar/shared';

interface ParticipantListProps {
  socket: React.MutableRefObject<AppSocket | null>;
}

export function ParticipantList({ socket }: ParticipantListProps) {
  const peers = useRoomStore((s) => s.peers);
  const self = useRoomStore((s) => s.self);
  const localMicOn = useRoomStore((s) => s.micOn);
  const localCamOn = useRoomStore((s) => s.camOn);
  const hands = useRoomStore((s) => s.hands);
  const role = useRoomStore((s) => s.role);
  const selfPeerId = useRoomStore((s) => s.peerId);

  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    peer: PeerInfo;
  } | null>(null);

  const showParticipantsToEachOther = useRoomStore((s) => s.showParticipantsToEachOther);
  const allowMic = useRoomStore((s) => s.allowMic);
  const allowVideo = useRoomStore((s) => s.allowVideo);
  const isStaff = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';

  useEffect(() => {
    if (!contextMenu) return;
    const handleDismiss = (e: Event) => {
      const menuEl = document.getElementById('participant-context-menu');
      if (menuEl && menuEl.contains(e.target as Node)) {
        return;
      }
      setContextMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('mousedown', handleDismiss);
    window.addEventListener('touchstart', handleDismiss);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleDismiss, true);
    return () => {
      window.removeEventListener('mousedown', handleDismiss);
      window.removeEventListener('touchstart', handleDismiss);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleDismiss, true);
    };
  }, [contextMenu]);

  // Filtering happens before the grouping so a search that matches one speaker
  // does not leave empty "Speakers" and "Audience" headings behind.
  const list = useMemo(() => {
    // The roster includes you. The server leaves self out of `peers` because
    // the video grid draws the local tile from `localStream`, but a list that
    // omits you makes a one-person room look empty and hides your own state.
    const all = [...(self ? [self] : []), ...Object.values(peers)];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q));
  }, [peers, self, query]);

  const staff = list.filter((p) => p.role !== 'PARTICIPANT');
  const speakers = list.filter((p) => p.role === 'PARTICIPANT' && p.isApprovedSpeaker);
  const audience = list.filter((p) => p.role === 'PARTICIPANT' && !p.isApprovedSpeaker);

  const total = Object.keys(peers).length + (self ? 1 : 0);

  function approve(userId: string) {
    socket.current?.emit('handApprove', { userId }, () => {});
  }
  function deny(userId: string) {
    socket.current?.emit('handDeny', { userId }, () => {});
  }
  function mute(userId: string) {
    socket.current?.emit('modMute', { userId }, () => {});
  }
  function stopVideo(userId: string) {
    socket.current?.emit('modStopVideo', { userId }, () => {});
  }
  function kick(userId: string) {
    socket.current?.emit('modKick', { userId }, () => {});
  }

  function toggleScreenShare(peer: PeerInfo) {
    const next = !peer.canShareScreen;
    socket.current?.emit(
      'modSetScreenShare',
      { userId: peer.userId, peerId: peer.peerId, enabled: next },
      (res) => {
        if (!res?.ok) {
          setNotice(res?.error ?? 'Failed to update screen share permission');
          window.setTimeout(() => setNotice(null), 5000);
          return;
        }
        setNotice(
          next
            ? `Enabled screen share for ${peer.name}`
            : `Disabled screen share for ${peer.name}`
        );
        window.setTimeout(() => setNotice(null), 4000);
      }
    );
  }

  function setRole(peer: PeerInfo, targetRole: 'MODERATOR' | 'PARTICIPANT') {
    socket.current?.emit(
      'modSetRole',
      { userId: peer.userId, peerId: peer.peerId, role: targetRole },
      (res) => {
        if (!res?.ok) {
          setNotice(res?.error ?? 'Failed to update role');
          window.setTimeout(() => setNotice(null), 5000);
          return;
        }
        setNotice(
          targetRole === 'MODERATOR'
            ? `Promoted ${peer.name} to Co-host / Moderator`
            : `Demoted ${peer.name} to participant`
        );
        window.setTimeout(() => setNotice(null), 4000);
      }
    );
  }

  /**
   * Ask a participant to turn their mic or camera on.
   */
  function requestMedia(userId: string, kind: 'mic' | 'cam') {
    socket.current?.emit('mediaRequest', { userId, kind }, (res) => {
      if (!res?.ok) {
        setNotice(res?.error ?? 'Could not send the request');
        return;
      }
      const name = (res.data as { name?: string } | undefined)?.name ?? 'The participant';
      setNotice(`Asked ${name} to turn on their ${kind === 'mic' ? 'microphone' : 'camera'}`);
      window.setTimeout(() => setNotice(null), 4000);
    });
  }

  const Row = ({ peer, showActions }: { peer: PeerInfo; showActions?: boolean }) => {
    const hand = hands.find((h) => h.userId === peer.userId);
    const isSelf = peer.peerId === selfPeerId;
    const effectiveMicOn = isSelf ? localMicOn : Boolean(peer.micOn);
    const effectiveCamOn = isSelf ? localCamOn : Boolean(peer.camOn);
    const hasMic = effectiveMicOn || Boolean(peer.canPublishAudio);
    const hasCam = effectiveCamOn || Boolean(peer.canPublishVideo);

    const hasAudio = peer.producers.some((p) => p.kind === 'audio');
    const hasVideo = peer.producers.some((p) => p.kind === 'video');

    return (
      <div
        onContextMenu={(e) => {
          if (!isStaff) return;
          e.preventDefault();
          e.stopPropagation();
          const menuWidth = 230;
          const menuHeight = 250;
          const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
          const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
          setContextMenu({ x, y, peer });
        }}
        className="group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.05] select-none cursor-pointer"
      >
        <div className="relative shrink-0">
          <div
            className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ${
              peer.role !== 'PARTICIPANT'
                ? 'bg-gradient-to-br from-brand-400 to-brand-700 text-white'
                : 'bg-white/10 text-slate-300'
            }`}
          >
            {peer.name.slice(0, 2).toUpperCase()}
          </div>
          {effectiveMicOn && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-mint-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-slate-200">
              {peer.name}
              {isSelf && <span className="ml-1 text-slate-500">(you)</span>}
            </span>
            {hand && <span className="text-[11px]">✋</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <span>
              {peer.role === 'HOST'
                ? 'Host'
                : peer.role === 'ADMIN'
                  ? 'Admin'
                  : peer.role === 'MODERATOR'
                    ? 'Moderator'
                    : peer.isApprovedSpeaker
                      ? 'Speaker'
                      : 'Viewer'}
            </span>
            <span className="text-slate-700">·</span>
            <MediaIcons
              micOn={effectiveMicOn}
              camOn={effectiveCamOn}
              hasAudio={hasAudio}
              hasVideo={hasVideo}
            />
          </div>
        </div>

        {showActions && isStaff && !isSelf && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {hand && (
              <>
                <button
                  type="button"
                  onClick={() => approve(peer.userId)}
                  className="rounded bg-mint-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-mint-400 hover:bg-mint-500/30"
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => deny(peer.userId)}
                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-white/20"
                >
                  Deny
                </button>
              </>
            )}

            {!hasMic ? (
              <button
                type="button"
                onClick={() => requestMedia(peer.userId, 'mic')}
                title="Ask this participant to unmute"
                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-white/20"
              >
                Ask mic
              </button>
            ) : (
              <button
                type="button"
                onClick={() => mute(peer.userId)}
                title="Mute this participant"
                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
              >
                Stop mic
              </button>
            )}

            {!hasCam ? (
              <button
                type="button"
                onClick={() => requestMedia(peer.userId, 'cam')}
                title="Ask this participant to turn their camera on"
                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-white/20"
              >
                Ask cam
              </button>
            ) : (
              <button
                type="button"
                onClick={() => stopVideo(peer.userId)}
                title="Stop this participant's video"
                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
              >
                Stop video
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({
                  x: Math.min(rect.right - 230, window.innerWidth - 240),
                  y: Math.min(rect.bottom + 5, window.innerHeight - 250),
                  peer,
                });
              }}
              title="More options (Make Co-host, remove, etc.)"
              className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:bg-white/20"
            >
              •••
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col relative">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Participants</h3>
        <span className="chip py-0.5 text-[10px]">
          {query ? `${list.length}/${total}` : total}
        </span>
      </div>

      {/* ── search ─────────────────────────────────────── */}
      <div className="border-b border-white/10 px-3 py-2">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search participants…"
            aria-label="Search participants"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:border-brand-400/50 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-slate-500 hover:bg-white/10 hover:text-slate-300"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p className="border-b border-white/10 bg-brand-500/10 px-4 py-1.5 text-[10px] text-brand-200">
          {notice}
        </p>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {/* ── Host Controls card ────────────────────────── */}
        {isStaff && (
          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Host Room Settings
              </span>
              <span className="text-[9px] text-slate-500 font-mono">Live</span>
            </div>

            {/* Toggle 1: Allow audience mic */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-semibold text-white">Allow audience mic</p>
                <p className="text-[10px] text-slate-400">
                  {allowMic ? 'Attendees can unmute their microphones' : 'Audience microphones are locked'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowMic}
                onClick={() => {
                  socket.current?.emit(
                    'updateRoomSettings',
                    { allowMic: !allowMic },
                    () => {}
                  );
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  allowMic ? 'bg-mint-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    allowMic ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Allow audience camera */}
            <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-semibold text-white">Allow audience camera</p>
                <p className="text-[10px] text-slate-400">
                  {allowVideo ? 'Attendees can turn on their cameras' : 'Audience cameras are locked'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowVideo}
                onClick={() => {
                  socket.current?.emit(
                    'updateRoomSettings',
                    { allowVideo: !allowVideo },
                    () => {}
                  );
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  allowVideo ? 'bg-mint-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    allowVideo ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle 3: Participants see each other */}
            <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-semibold text-white">Participants see each other</p>
                <p className="text-[10px] text-slate-400">
                  {showParticipantsToEachOther ? 'Zoom call mode (everyone visible)' : 'Webinar broadcast mode (staff on stage)'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showParticipantsToEachOther}
                onClick={() => {
                  socket.current?.emit(
                    'updateRoomSettings',
                    { showParticipantsToEachOther: !showParticipantsToEachOther },
                    () => {}
                  );
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showParticipantsToEachOther ? 'bg-brand-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showParticipantsToEachOther ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {hands.length > 0 && isStaff && (
          <section>
            <h4 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-accent-400">
              Hand raised ({hands.length})
            </h4>
            {hands.map((h) => {
              const peer = Object.values(peers).find((p) => p.userId === h.userId);
              if (!peer) return null;
              return (
                <div
                  key={h.userId}
                  className="flex items-center gap-2 rounded-lg bg-accent-500/10 px-2 py-1.5"
                >
                  <span className="text-sm">✋</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
                    {h.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => approve(h.userId)}
                    className="rounded bg-mint-500/25 px-2 py-0.5 text-[10px] font-bold text-mint-400 hover:bg-mint-500/40"
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    onClick={() => deny(h.userId)}
                    className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-white/20"
                  >
                    Deny
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {staff.length > 0 && (
          <section>
            <h4 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Hosts & moderators
            </h4>
            {staff.map((p) => (
              <Row key={p.peerId} peer={p} showActions />
            ))}
          </section>
        )}

        {speakers.length > 0 && (
          <section>
            <h4 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Speakers
            </h4>
            {speakers.map((p) => (
              <Row key={p.peerId} peer={p} showActions />
            ))}
          </section>
        )}

        {audience.length > 0 && (
          <section>
            <h4 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Audience ({audience.length})
            </h4>
            {audience.slice(0, 100).map((p) => (
              <Row key={p.peerId} peer={p} showActions />
            ))}
            {audience.length > 100 && (
              <p className="px-2 pt-1 text-[10px] text-slate-600">
                +{audience.length - 100} more viewers
              </p>
            )}
          </section>
        )}

        {list.length === 0 && (
          <p className="pt-8 text-center text-xs text-slate-600">
            {query ? `No one matching “${query}”` : 'Nobody here yet'}
          </p>
        )}
      </div>

      {/* ── Right-Click Context Menu ─────────────────────── */}
      {contextMenu && (() => {
        const targetPeer = contextMenu.peer;
        const isTargetSelf = targetPeer.peerId === selfPeerId;
        const isTargetHost = targetPeer.role === 'HOST';
        const canManageRole = isStaff && !isTargetSelf && !isTargetHost;
        const canManageMedia = isStaff && !isTargetSelf && !isTargetHost;

        return (
          <div
            id="participant-context-menu"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className="fixed z-50 w-56 rounded-xl border border-white/15 bg-[#0f172a]/95 p-1.5 shadow-2xl backdrop-blur-md"
          >
            <div className="border-b border-white/10 px-2.5 py-1.5 mb-1">
              <p className="truncate text-xs font-semibold text-white">{targetPeer.name}</p>
              <span className="text-[10px] text-slate-400 capitalize">
                {targetPeer.role === 'HOST'
                  ? 'Host'
                  : targetPeer.role === 'ADMIN'
                    ? 'Admin'
                    : targetPeer.role === 'MODERATOR'
                      ? 'Co-host / Moderator'
                      : targetPeer.isApprovedSpeaker
                        ? 'Speaker'
                        : 'Viewer'}
              </span>
            </div>

            {canManageRole && (
              <>
                {targetPeer.role === 'MODERATOR' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRole(targetPeer, 'PARTICIPANT');
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 transition hover:bg-white/10"
                  >
                    <span className="text-sm">🛡️</span>
                    <span>Remove Co-host</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRole(targetPeer, 'MODERATOR');
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-300 transition hover:bg-brand-500/20"
                  >
                    <span className="text-sm">🛡️</span>
                    <span>Make Co-host / Moderator</span>
                  </button>
                )}
                <div className="my-1 border-t border-white/10" />
              </>
            )}

            {canManageMedia && (
              <>
                {targetPeer.micOn ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      mute(targetPeer.userId);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    <span className="text-sm">🔇</span>
                    <span>Mute Microphone</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestMedia(targetPeer.userId, 'mic');
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    <span className="text-sm">🎙️</span>
                    <span>Ask to Unmute</span>
                  </button>
                )}

                {targetPeer.camOn ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      stopVideo(targetPeer.userId);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    <span className="text-sm">🚫</span>
                    <span>Stop Video</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestMedia(targetPeer.userId, 'cam');
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    <span className="text-sm">📹</span>
                    <span>Ask to Start Video</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleScreenShare(targetPeer);
                    setContextMenu(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                    targetPeer.canShareScreen
                      ? 'text-amber-300 hover:bg-white/10'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm">🖥️</span>
                  <span>{targetPeer.canShareScreen ? 'Disable Screen Share' : 'Enable Screen Share'}</span>
                </button>

                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    kick(targetPeer.userId);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20"
                >
                  <span className="text-sm">🚪</span>
                  <span>Remove from Webinar</span>
                </button>
              </>
            )}

            {isTargetSelf && (
              <p className="px-2.5 py-1 text-[11px] text-slate-500 italic">This is you</p>
            )}
            {isTargetHost && !isTargetSelf && (
              <p className="px-2.5 py-1 text-[11px] text-slate-500 italic">Host cannot be modified</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Mic and camera state for one participant.
 */
function MediaIcons({
  micOn,
  camOn,
  hasAudio,
  hasVideo,
}: {
  micOn: boolean;
  camOn: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        title={micOn ? 'Microphone on' : 'Microphone muted'}
        className={micOn ? 'text-mint-400' : 'text-rose-400/80'}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" strokeLinecap="round" />
          {!micOn && <path d="M3 3l18 18" strokeLinecap="round" />}
        </svg>
      </span>

      <span
        title={camOn ? 'Camera on' : 'Camera off'}
        className={camOn ? 'text-mint-400' : 'text-rose-400/80'}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="2" y="6" width="13" height="12" rx="2" />
          <path d="M15 10.5 22 7v10l-7-3.5" strokeLinecap="round" strokeLinejoin="round" />
          {!camOn && <path d="M3 3l18 18" strokeLinecap="round" />}
        </svg>
      </span>
    </span>
  );
}
