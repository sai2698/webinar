'use client';

import { useMemo } from 'react';
import type { TimelineEvent, Role } from '@webinar/shared';

// ── Layout state types ────────────────────────────────────────────────────────

/**
 * The visual mode the stage was in at a given replay position.
 * Used by the replay page to show the correct overlay / presenter badge.
 */
export type ReplayLayoutMode =
  | 'waiting'         // No video active yet (intro / pre-session)
  | 'screen-only'     // Screen share, no camera
  | 'screen+cam'      // Screen share + presenter camera PiP
  | 'cam-only'        // Camera only, no screen share
  | 'spotlight'       // A specific peer was spotlighted
  | 'multi';          // Multiple speakers (grid)

export interface ReplayLayoutState {
  /** Visual mode — drives which overlay badges to show. */
  mode: ReplayLayoutMode;

  /** True while a screen share is active. */
  screenShareActive: boolean;

  /** True while the host/staff camera is on. */
  hostCamActive: boolean;

  /** Peer currently spotlighted, or null. */
  spotlightPeerId: string | null;
  spotlightName: string | null;

  /**
   * The active presenter — whoever's content fills the stage.
   * Falls back to host when nothing else is known.
   */
  presenterPeerId: string | null;
  presenterName: string | null;
  presenterRole: Role | null;

  /**
   * Accumulated attendee list — peers that have joined and not yet left
   * at the current replay position.
   */
  attendees: { name: string; role: Role }[];
}

// ── Default / empty state ─────────────────────────────────────────────────────

const DEFAULT_STATE: ReplayLayoutState = {
  mode: 'waiting',
  screenShareActive: false,
  hostCamActive: false,
  spotlightPeerId: null,
  spotlightName: null,
  presenterPeerId: null,
  presenterName: null,
  presenterRole: null,
  attendees: [],
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Folds the recording's layout-event timeline up to `positionMs` into a
 * `ReplayLayoutState` that the replay page can use to show correct overlay
 * badges, presenter names, and the attendee list.
 *
 * This is a pure derived computation — no side effects, no network calls.
 * It re-runs only when `timeline` or `positionMs` changes. Timeline is
 * stable after load so re-runs happen only on seek / rAF tick.
 *
 * Graceful degradation: recordings made before layout events were added
 * have no `screenShareStarted` / `spotlightChanged` events, so the engine
 * returns `waiting` mode rather than crashing. Old recordings still replay
 * perfectly — they just lack the layout badges.
 */
export function useReplayLayout(
  timeline: TimelineEvent[],
  positionMs: number
): ReplayLayoutState {
  return useMemo(() => {
    // Walk the timeline in order, folding events into state.
    // Stop as soon as we pass positionMs — events in the future don't apply yet.
    let state: ReplayLayoutState = { ...DEFAULT_STATE };

    for (const event of timeline) {
      if (event.t > positionMs) break;

      switch (event.type) {
        // ── Layout events (new) ───────────────────────────────
        case 'screenShareStarted':
          state = {
            ...state,
            screenShareActive: true,
            mode: state.hostCamActive ? 'screen+cam' : 'screen-only',
            presenterPeerId: event.peerId,
            presenterName: event.peerName,
            presenterRole: event.peerRole,
          };
          break;

        case 'screenShareStopped':
          state = {
            ...state,
            screenShareActive: false,
            mode: state.hostCamActive ? 'cam-only' : 'waiting',
            // Presenter reverts to host cam if screen share ends
            presenterPeerId: state.hostCamActive ? state.presenterPeerId : null,
            presenterName: state.hostCamActive ? state.presenterName : null,
          };
          break;

        case 'hostCamOn':
          state = {
            ...state,
            hostCamActive: true,
            mode: state.screenShareActive ? 'screen+cam' : 'cam-only',
            // Set presenter to cam owner only if no screen share is active
            presenterPeerId: state.screenShareActive ? state.presenterPeerId : event.peerId,
            presenterName: state.screenShareActive ? state.presenterName : event.peerName,
          };
          break;

        case 'hostCamOff':
          state = {
            ...state,
            hostCamActive: false,
            mode: state.screenShareActive ? 'screen-only' : 'waiting',
          };
          break;

        case 'spotlightChanged':
          state = {
            ...state,
            spotlightPeerId: event.peerId,
            spotlightName: event.peerName,
            mode: event.peerId ? 'spotlight' : (
              state.screenShareActive
                ? (state.hostCamActive ? 'screen+cam' : 'screen-only')
                : (state.hostCamActive ? 'cam-only' : 'waiting')
            ),
          };
          break;

        case 'presenterChanged':
          // Only update presenter if no spotlight is overriding it
          if (!state.spotlightPeerId) {
            state = {
              ...state,
              presenterPeerId: event.peerId,
              presenterName: event.peerName,
              presenterRole: event.peerRole,
            };
          }
          break;

        // ── Attendee list ─────────────────────────────────────
        case 'peerJoined':
          // Add to attendee list (avoid duplicates by name+role)
          if (!state.attendees.some((a) => a.name === event.name && a.role === event.role)) {
            state = {
              ...state,
              attendees: [...state.attendees, { name: event.name, role: event.role }],
            };
          }
          break;

        case 'peerLeft':
          state = {
            ...state,
            attendees: state.attendees.filter((a) => a.name !== event.name),
          };
          break;

        // All other event types (chat, quiz, poll, etc.) don't affect layout
        default:
          break;
      }
    }

    return state;
  }, [timeline, positionMs]);
}

// ── Helpers for UI ────────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for the current layout mode.
 * Used in the stage overlay badge.
 */
export function layoutModeLabel(mode: ReplayLayoutMode): string {
  switch (mode) {
    case 'screen-only': return 'Screen Share';
    case 'screen+cam':  return 'Screen Share + Camera';
    case 'cam-only':    return 'Camera';
    case 'spotlight':   return 'Spotlighted';
    case 'multi':       return 'Multi-speaker';
    case 'waiting':
    default:            return '';
  }
}

/**
 * Returns true if the layout has any video content to show.
 * Used to decide between showing the video player or the presenter card.
 */
export function layoutHasVideo(mode: ReplayLayoutMode): boolean {
  return mode !== 'waiting';
}

