'use client';

import { useMemo } from 'react';
import { useRoomStore } from '@/store/roomStore';
import { useIsFullscreen } from '@/lib/useRoomUi';
import { VideoTile } from './VideoTile';

interface VideoGridProps {
  onToggleFullscreen?: () => void;
}

function UserCountCard({ count, vertical = false }: { count: number; vertical?: boolean }) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl sm:rounded-2xl border border-white/10 bg-ink-900/90 shadow-md backdrop-blur ${
        vertical ? 'w-full py-4 aspect-video' : 'h-20 w-20 sm:h-24 sm:w-28'
      }`}
    >
      <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/20 text-brand-400">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      </div>
      <span className="rounded-full bg-brand-500/25 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-brand-300">
        +{count}
      </span>
    </div>
  );
}

function FullscreenButton({ onClick, isFs }: { onClick?: () => void; isFs: boolean }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/70 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xl backdrop-blur-md transition hover:bg-black/90 active:scale-95"
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

export function VideoGrid({ onToggleFullscreen }: VideoGridProps) {
  const peers = useRoomStore((s) => s.peers);
  const remoteStreams = useRoomStore((s) => s.remoteStreams);
  const localStream = useRoomStore((s) => s.localStream);
  const screenStream = useRoomStore((s) => s.screenStream);
  const selfPeerId = useRoomStore((s) => s.peerId);
  const self = useRoomStore((s) => s.self);
  const micOn = useRoomStore((s) => s.micOn);
  const camOn = useRoomStore((s) => s.camOn);
  const spotlightedPeerId = useRoomStore((s) => s.spotlightedPeerId);
  const viewerCount = useRoomStore((s) => s.viewerCount);
  const showParticipantsToEachOther = useRoomStore((s) => s.showParticipantsToEachOther);
  const role = useRoomStore((s) => s.role);
  const isHostOrStaff = role === 'HOST' || role === 'ADMIN' || role === 'MODERATOR';
  const isFullscreen = useIsFullscreen();

  const { tiles, screenTile } = useMemo(() => {
    const list: {
      key: string;
      peerId: string;
      name: string;
      role: string;
      stream: MediaStream | null;
      isLocal: boolean;
      micOn: boolean;
      camOn: boolean;
      paused: boolean;
      isScreen: boolean;
      producerId?: string;
    }[] = [];

    // ── 1. ACTIVE SCREEN SHARE DETECTION ──
    // A screen share is a room-level presentation: it should always take center stage
    // whether started by host, moderator, co-host, or a participant granted screen share,
    // regardless of whether their camera is turned on or off.
    let screen: (typeof list)[number] | null = null;

    if (screenStream) {
      // Local user is sharing screen
      const localName = self?.name || 'You';
      const localRole = self?.role || role || 'PARTICIPANT';
      screen = {
        key: `${selfPeerId ?? 'local'}:screen`,
        peerId: selfPeerId ?? 'local',
        name: `${localName} (You - Screen)`,
        role: localRole,
        stream: screenStream,
        isLocal: true,
        micOn,
        camOn: true,
        paused: false,
        isScreen: true,
      };
    } else {
      // Check for any remote screen share from ANY peer in the room
      const remoteScreenEntry = Object.values(remoteStreams).find(
        (rs) => rs.kind === 'video' && rs.source === 'screen'
      );
      if (remoteScreenEntry) {
        const owner =
          Object.values(peers).find((p) => p.peerId === remoteScreenEntry.peerId) ||
          (selfPeerId === remoteScreenEntry.peerId ? self : null);
        const ownerName = owner?.name ? `${owner.name}'s screen` : 'Screen share';
        screen = {
          key: `${remoteScreenEntry.peerId}:screen`,
          peerId: remoteScreenEntry.peerId,
          name: ownerName,
          role: owner?.role ?? 'PARTICIPANT',
          stream: remoteScreenEntry.stream,
          isLocal: false,
          micOn: Boolean(owner?.micOn),
          camOn: true,
          paused: remoteScreenEntry.paused,
          isScreen: true,
          producerId: remoteScreenEntry.producerId,
        };
      }
    }

    // ── 2. CAMERA AND DUMMY TILES ──
    const everyone = [...Object.values(peers)];
    if (self && selfPeerId && !everyone.some((p) => p.peerId === selfPeerId)) {
      everyone.push({ ...self, peerId: selfPeerId });
    }

    for (const peer of everyone) {
      const isLocal = peer.peerId === selfPeerId;

      // ── PARTICIPANT PRIVACY / VISIBILITY RULE ──
      // When showParticipantsToEachOther is FALSE (Webinar mode):
      // Attendees (participants) must never see other participants' camera/dummy tiles.
      // Participants only see: host/cohost/moderator video, their own local video at top, and count tile.
      if (!showParticipantsToEachOther && !isHostOrStaff && !isLocal && peer.role === 'PARTICIPANT') {
        continue;
      }

      if (isLocal) {
        // Always include the local tile:
        // - If video is enabled: renders live camera video.
        // - If video is not enabled: renders dummy tile with initials avatar and mic status.
        list.push({
          key: peer.peerId,
          peerId: peer.peerId,
          name: peer.name,
          role: peer.role,
          stream: localStream,
          isLocal: true,
          micOn,
          camOn,
          paused: false,
          isScreen: false,
        });
        continue;
      }

      // ── REMOTE PEERS CAMERA / DUMMY TILE ──
      const camStreamEntry = Object.values(remoteStreams).find(
        (rs) => rs.peerId === peer.peerId && rs.kind === 'video' && rs.source !== 'screen'
      );

      if (camStreamEntry) {
        list.push({
          key: camStreamEntry.producerId,
          peerId: peer.peerId,
          name: peer.name,
          role: peer.role,
          stream: camStreamEntry.stream,
          isLocal: false,
          micOn: Boolean(peer.micOn),
          camOn: Boolean(peer.camOn),
          paused: camStreamEntry.paused,
          isScreen: false,
          producerId: camStreamEntry.producerId,
        });
      } else {
        // Camera is off: show dummy tile with avatar and mic status
        list.push({
          key: peer.peerId,
          peerId: peer.peerId,
          name: peer.name,
          role: peer.role,
          stream: null,
          isLocal: false,
          micOn: Boolean(peer.micOn),
          camOn: false,
          paused: false,
          isScreen: false,
        });
      }
    }

    const rank = (r: string) => (r === 'HOST' ? 0 : r === 'ADMIN' ? 1 : r === 'MODERATOR' ? 2 : 3);
    list.sort((a, b) => rank(a.role) - rank(b.role));
    return { tiles: list, screenTile: screen as (typeof list)[number] | null };
  }, [peers, self, remoteStreams, localStream, screenStream, selfPeerId, micOn, camOn, role, isHostOrStaff, showParticipantsToEachOther]);

  const showUserCountCard =
    !isHostOrStaff &&
    !showParticipantsToEachOther &&
    viewerCount > 0;

  if (tiles.length === 0 && !screenTile) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-white/10 bg-ink-900/60 p-4">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
          <p className="text-sm text-slate-400">Waiting for the host to start…</p>
          {showUserCountCard && (
            <div className="mt-4 flex justify-center">
              <UserCountCard count={viewerCount} />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── 1. PRESENTATION / SCREEN SHARE LAYOUT ── */
  if (screenTile) {
    // In Fullscreen mode: Left is screen share, Right is vertical filmstrip of videos
    if (isFullscreen) {
      return (
        <div className="flex h-full w-full flex-row gap-2 bg-ink-950 p-2 overflow-hidden">
          <div className="relative min-w-0 flex-1 h-full rounded-2xl overflow-hidden border border-white/10 bg-black">
            <VideoTile
              stream={screenTile.stream}
              name={screenTile.name}
              role={screenTile.role}
              isLocal={screenTile.isLocal}
              micOn={screenTile.micOn}
              camOn={screenTile.camOn}
              paused={screenTile.paused}
              isScreen
              className="h-full w-full"
            />
            <FullscreenButton onClick={onToggleFullscreen} isFs={true} />
          </div>

          {(tiles.length > 0 || showUserCountCard) && (
            <div className="w-36 sm:w-48 shrink-0 flex flex-col gap-2 overflow-y-auto h-full pr-1">
              {tiles.map((tile) => (
                <VideoTile
                  key={tile.key}
                  stream={tile.stream}
                  name={tile.name}
                  role={tile.role}
                  isLocal={tile.isLocal}
                  micOn={tile.micOn}
                  camOn={tile.camOn}
                  paused={tile.paused}
                  producerId={tile.producerId}
                  layer={0}
                  className="w-full aspect-video shrink-0 rounded-xl"
                />
              ))}
              {showUserCountCard && <UserCountCard count={viewerCount} vertical />}
            </div>
          )}
        </div>
      );
    }

    // Normal mode: Videos strip at TOP, screen share below
    return (
      <div className="flex h-full flex-col gap-1.5 sm:gap-2 overflow-hidden">
        {(tiles.length > 0 || showUserCountCard) && (
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {tiles.map((tile) => (
              <VideoTile
                key={tile.key}
                stream={tile.stream}
                name={tile.name}
                role={tile.role}
                isLocal={tile.isLocal}
                micOn={tile.micOn}
                camOn={tile.camOn}
                paused={tile.paused}
                producerId={tile.producerId}
                layer={0}
                className="h-20 w-24 sm:h-24 sm:w-28 shrink-0 rounded-xl sm:rounded-2xl"
              />
            ))}
            {showUserCountCard && <UserCountCard count={viewerCount} />}
          </div>
        )}

        <div className="relative min-h-0 flex-1 aspect-video w-full max-h-[39vh] sm:max-h-[44vh] lg:max-h-none lg:aspect-auto rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-black mx-auto">
          <VideoTile
            stream={screenTile.stream}
            name={screenTile.name}
            role={screenTile.role}
            isLocal={screenTile.isLocal}
            micOn={screenTile.micOn}
            camOn={screenTile.camOn}
            paused={screenTile.paused}
            isScreen
            className="h-full w-full"
          />
          <FullscreenButton onClick={onToggleFullscreen} isFs={false} />
        </div>
      </div>
    );
  }

  /* ── 2. EXPLICIT SPOTLIGHT LAYOUT ── */
  if (spotlightedPeerId) {
    const spotlightTile = tiles.find((t) => t.peerId === spotlightedPeerId) ?? tiles[0];
    const restTiles = tiles.filter((t) => t.key !== spotlightTile?.key);

    return (
      <div className="flex h-full flex-col gap-1.5 sm:gap-2 overflow-hidden">
        {restTiles.length > 0 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {restTiles.map((tile) => (
              <VideoTile
                key={tile.key}
                stream={tile.stream}
                name={tile.name}
                role={tile.role}
                isLocal={tile.isLocal}
                micOn={tile.micOn}
                camOn={tile.camOn}
                paused={tile.paused}
                producerId={tile.producerId}
                layer={0}
                className="h-20 w-24 sm:h-24 sm:w-28 shrink-0 rounded-xl sm:rounded-2xl"
              />
            ))}
          </div>
        )}

        <div className="relative min-h-0 flex-1 aspect-video w-full max-h-[39vh] sm:max-h-[44vh] lg:max-h-none lg:aspect-auto rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-black mx-auto">
          <VideoTile
            stream={spotlightTile.stream}
            name={spotlightTile.name}
            role={spotlightTile.role}
            isLocal={spotlightTile.isLocal}
            micOn={spotlightTile.micOn}
            camOn={spotlightTile.camOn}
            paused={spotlightTile.paused}
            producerId={spotlightTile.producerId}
            layer={2}
            className="h-full w-full"
          />
          <FullscreenButton onClick={onToggleFullscreen} isFs={false} />
        </div>
      </div>
    );
  }

  /* ── 3. ZOOM-LIKE CALL GALLERY GRID (when showParticipantsToEachOther is true) ── */
  if (showParticipantsToEachOther && tiles.length > 1) {
    const cols =
      tiles.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : tiles.length <= 4
          ? 'grid-cols-2'
          : tiles.length <= 6
            ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

    const crowded = tiles.length > 6;

    return (
      <div className="relative h-full w-full p-1 sm:p-2 overflow-hidden flex flex-col justify-center">
        <div
          className={`grid gap-2 sm:gap-3 w-full h-full place-content-center ${cols} ${
            crowded ? 'auto-rows-[minmax(140px,1fr)] overflow-y-auto pr-1' : 'auto-rows-fr'
          }`}
        >
          {tiles.map((tile) => (
            <VideoTile
              key={tile.key}
              stream={tile.stream}
              name={tile.name}
              role={tile.role}
              isLocal={tile.isLocal}
              micOn={tile.micOn}
              camOn={tile.camOn}
              paused={tile.paused}
              producerId={tile.producerId}
              layer={tiles.length <= 4 ? 2 : 1}
              className="h-full w-full min-h-[140px] rounded-xl sm:rounded-2xl"
            />
          ))}
        </div>
        <FullscreenButton onClick={onToggleFullscreen} isFs={isFullscreen} />
      </div>
    );
  }

  /* ── 4. WEBINAR BROADCAST LAYOUT (showParticipantsToEachOther is false) ── */
  // Staff (Host, Moderator, Co-host) on main stage below.
  // Top strip has:
  // - For each participant: their own video (or dummy tile with mic status if video not enabled) + count tile!
  // - For host: all participants' tiles (video if on, dummy if off)!
  const staffTiles = tiles.filter((t) => ['HOST', 'ADMIN', 'MODERATOR'].includes(t.role));
  const participantTiles = tiles.filter((t) => !['HOST', 'ADMIN', 'MODERATOR'].includes(t.role));

  const stageTiles = staffTiles.length > 0 ? staffTiles : [tiles[0]];
  const topStripTiles = staffTiles.length > 0 ? participantTiles : tiles.slice(1);

  if (stageTiles.length > 0 && (topStripTiles.length > 0 || showUserCountCard)) {
    return (
      <div className="flex h-full flex-col gap-1.5 sm:gap-2 overflow-hidden">
        {/* Videos strip at TOP */}
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
          {topStripTiles.map((tile) => (
            <VideoTile
              key={tile.key}
              stream={tile.stream}
              name={tile.name}
              role={tile.role}
              isLocal={tile.isLocal}
              micOn={tile.micOn}
              camOn={tile.camOn}
              paused={tile.paused}
              producerId={tile.producerId}
              layer={0}
              className="h-20 w-24 sm:h-24 sm:w-28 shrink-0 rounded-xl sm:rounded-2xl"
            />
          ))}
          {showUserCountCard && <UserCountCard count={viewerCount} />}
        </div>

        {/* Main stage with Host or Moderator or Co-host video */}
        <div className="relative min-h-0 flex-1 aspect-video w-full max-h-[39vh] sm:max-h-[44vh] lg:max-h-none lg:aspect-auto rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-black mx-auto">
          {stageTiles.length === 1 ? (
            <VideoTile
              stream={stageTiles[0].stream}
              name={stageTiles[0].name}
              role={stageTiles[0].role}
              isLocal={stageTiles[0].isLocal}
              micOn={stageTiles[0].micOn}
              camOn={stageTiles[0].camOn}
              paused={stageTiles[0].paused}
              producerId={stageTiles[0].producerId}
              layer={2}
              className="h-full w-full"
            />
          ) : (
            <div className={`grid h-full w-full gap-2 p-1 ${stageTiles.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
              {stageTiles.map((tile) => (
                <VideoTile
                  key={tile.key}
                  stream={tile.stream}
                  name={tile.name}
                  role={tile.role}
                  isLocal={tile.isLocal}
                  micOn={tile.micOn}
                  camOn={tile.camOn}
                  paused={tile.paused}
                  producerId={tile.producerId}
                  layer={2}
                  className="h-full w-full rounded-xl"
                />
              ))}
            </div>
          )}
          <FullscreenButton onClick={onToggleFullscreen} isFs={false} />
        </div>
      </div>
    );
  }

  /* ── 5. SINGLE TILE (Host alone, or Participant alone) ── */
  return (
    <div className="relative flex h-full flex-col gap-1.5 sm:gap-2 overflow-hidden">
      {showUserCountCard && (
        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
          <UserCountCard count={viewerCount} />
        </div>
      )}
      <div className="relative min-h-0 flex-1 aspect-video w-full max-h-[36vh] sm:max-h-[42vh] lg:max-h-none lg:aspect-auto rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-black mx-auto">
        {tiles[0] && (
          <VideoTile
            key={tiles[0].key}
            stream={tiles[0].stream}
            name={tiles[0].name}
            role={tiles[0].role}
            isLocal={tiles[0].isLocal}
            micOn={tiles[0].micOn}
            camOn={tiles[0].camOn}
            paused={tiles[0].paused}
            producerId={tiles[0].producerId}
            layer={2}
            className="h-full w-full"
          />
        )}
        <FullscreenButton onClick={onToggleFullscreen} isFs={false} />
      </div>
    </div>
  );
}
