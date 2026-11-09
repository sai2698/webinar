'use client';

import type { types as MediasoupTypes } from 'mediasoup-client';
import type { AppSocket } from './socket';

type Consumer = MediasoupTypes.Consumer;

/**
 * A module-level registry of live consumers, keyed by producer id.
 *
 * `useMediasoup` owns the consumers; tiles look them up here by producer id.
 *
 * mediasoup-client 3.25 removed `Consumer.setPreferredLayers()`: layer choice
 * is a server-side decision now. We deliberately never make that decision — see
 * `preferLayer` for why pinning a simulcast layer is unsafe, and for what we do
 * instead (consumer priority, which steers the estimator without pinning).
 */
const consumers = new Map<string, Consumer>();

/**
 * Outstanding priority claims per producer, as `tier -> number of tiles`.
 *
 * A producer can legitimately be rendered by more than one tile at once — the
 * fullscreen layout puts the host camera on the stage and the same peer in the
 * side filmstrip, and a layout switch can briefly mount both. Counting claims
 * rather than storing a single tier means one tile unmounting cannot demote a
 * producer that another tile still has on stage.
 */
const priorityClaims = new Map<string, Map<PriorityTier, number>>();

/** The tier last sent to the server, so we can skip redundant round-trips. */
const prioritySent = new Map<string, PriorityTier>();

type PriorityTier = 'stage' | 'grid' | 'thumbnail';

const TIER_RANK: Record<PriorityTier, number> = { thumbnail: 0, grid: 1, stage: 2 };

let socket: AppSocket | null = null;

export function setLayerSocket(next: AppSocket | null) {
  socket = next;
}

export function registerConsumer(producerId: string, consumer: Consumer) {
  consumers.set(producerId, consumer);
  // A fresh consumer starts at the server's default (grid for camera, screen
  // for a share). Forget what we sent for a previous consumer of the same
  // producer so the next claim is not skipped as redundant.
  prioritySent.delete(producerId);
}

export function unregisterConsumer(producerId: string) {
  consumers.delete(producerId);
  priorityClaims.delete(producerId);
  prioritySent.delete(producerId);
}

export function clearConsumers() {
  consumers.clear();
  priorityClaims.clear();
  prioritySent.clear();
}

/** Sends `tier` for this producer unless the server already has it. */
function pushTier(producerId: string, tier: PriorityTier) {
  const consumer = consumers.get(producerId);
  if (!consumer || consumer.closed) return;
  if (prioritySent.get(producerId) === tier) return;
  prioritySent.set(producerId, tier);
  socket?.emit('setConsumerPriority', { consumerId: consumer.id, tier }, () => {});
}

/** The highest tier any live tile is currently claiming for this producer. */
function effectiveTier(producerId: string): PriorityTier {
  const claims = priorityClaims.get(producerId);
  if (!claims) return 'grid';
  let best: PriorityTier = 'grid';
  for (const [tier, count] of claims) {
    if (count > 0 && TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}

/**
 * Tells the SFU how much this consumer matters relative to the others.
 *
 * `spatialLayer` is 0-based: 0 is the lowest resolution, 2 the highest.
 *
 * **This does not pin a simulcast layer.** It used to forward to the server's
 * `setPreferredLayers`, which *pins* a consumer to one spatial layer: the SFU
 * stops adapting and will not fall back if that layer stops encoding. A camera
 * producer advertises three simulcast layers, but the top one (`r2`) only ramps
 * up when the encoder has spare bitrate — so pinning a consumer to layer 2 left
 * it waiting for a keyframe that never arrived. The symptom was a tile present
 * in the DOM, whose consumer reported `paused: false`, but whose `<video>` had
 * `videoWidth: 0` and a muted track. It was especially visible when a host
 * shared their screen: the layout switch re-mounted the camera tile, the
 * unmount cleanup pinned the top layer, and the camera went black for every
 * participant. mediasoup exposes no "clear preference" call, so the only safe
 * way to keep the SFU's bandwidth estimator in charge is to never take control
 * away from it.
 *
 * What we do instead is set the consumer's *priority*. Priority is advisory:
 * every consumer still adapts up and down, but when a peer's downlink tightens
 * the estimator degrades the low-priority consumers first. That is the whole
 * point of the `layer` prop — a 160px filmstrip thumbnail should not compete on
 * equal terms with the 1080p tile everyone is watching — and it gets us the
 * bandwidth saving without the black-camera hazard.
 *
 * The mapping is deliberately coarse. `layer` 2 means "this is the tile on
 * stage", 1 means "a normal grid tile", 0 means "a thumbnail".
 */
export function preferLayer(producerId: string, spatialLayer: 0 | 1 | 2) {
  const tier: PriorityTier = spatialLayer >= 2 ? 'stage' : spatialLayer === 1 ? 'grid' : 'thumbnail';
  let claims = priorityClaims.get(producerId);
  if (!claims) {
    claims = new Map();
    priorityClaims.set(producerId, claims);
  }
  claims.set(tier, (claims.get(tier) ?? 0) + 1);
  pushTier(producerId, effectiveTier(producerId));
}

/**
 * Releases one priority claim for this producer.
 *
 * Called from the tile's effect cleanup, so it must be paired one-for-one with
 * a `preferLayer` call. The producer drops back to whatever tier its remaining
 * tiles still claim — or to the default grid tier when none are left, so a tile
 * that was once on stage does not keep hogging downlink after a layout change.
 */
export function preferAutoLayer(producerId: string) {
  const claims = priorityClaims.get(producerId);
  if (claims) {
    // Release the highest outstanding claim: the effect that is cleaning up is
    // the one that made the most recent claim, and effects unwind in order.
    let highest: PriorityTier | null = null;
    for (const [tier, count] of claims) {
      if (count > 0 && (highest === null || TIER_RANK[tier] > TIER_RANK[highest])) highest = tier;
    }
    if (highest) {
      const next = (claims.get(highest) ?? 1) - 1;
      if (next <= 0) claims.delete(highest);
      else claims.set(highest, next);
    }
    if (claims.size === 0) priorityClaims.delete(producerId);
  }
  pushTier(producerId, effectiveTier(producerId));
}

/**
 * Stops / restarts the SFU from sending a consumer's media.
 *
 * This is the one lever that actually saves bandwidth in a large grid. Hiding
 * the `<video>` element (which `useInView` already does) stops *decoding*, but
 * the consumer keeps pulling packets and the SFU keeps forwarding them — a
 * 20-tile grid still downloads 20 streams. Pausing the consumer tells the SFU
 * to stop forwarding entirely.
 *
 * Pausing is safe in a way that pinning a layer is not: a paused consumer is
 * resumed explicitly, and `resumeConsumer` on the server requests a keyframe
 * immediately afterwards, so the tile repaints instead of staying frozen.
 *
 * Audio is never paused — a participant who scrolls away must still be heard.
 */
export function setConsumerPaused(producerId: string, paused: boolean) {
  const consumer = consumers.get(producerId);
  if (!consumer || consumer.closed) return;
  if (consumer.kind !== 'video') return;
  if (consumer.paused === paused) return;

  if (paused) {
    consumer.pause();
    socket?.emit('pauseConsumer', { consumerId: consumer.id }, () => {});
  } else {
    // mediasoup-client 3.25 `resume()` is synchronous and returns void.
    consumer.resume();
    socket?.emit('resumeConsumer', { consumerId: consumer.id }, () => {});
  }
}

/**
 * Asks the SFU for a fresh keyframe on one consumer.
 *
 * Used by the stall detector: a tile whose `currentTime` has stopped advancing
 * is almost always waiting for a keyframe that was lost, and no amount of
 * calling `play()` will fix that.
 */
export function requestKeyFrameFor(producerId: string) {
  const consumer = consumers.get(producerId);
  if (!consumer || consumer.closed) return;
  socket?.emit('requestKeyFrame', { consumerId: consumer.id }, () => {});
}

/**
 * The rejoin hook, installed by `useMediasoup`.
 *
 * A tile can be frozen for reasons a keyframe request cannot fix — the ICE
 * path is dead, or the consumer is bound to a transport that will never
 * recover. In those cases the only cure is to rebuild the transports, which
 * only `useMediasoup` can do. Tiles reach it through this indirection so they
 * do not need a reference to the hook.
 */
let rejoinHandler: (() => void) | null = null;

export function setRejoinHandler(fn: (() => void) | null) {
  rejoinHandler = fn;
}

/**
 * Rebuilds this peer's transports and re-consumes everything.
 *
 * Called by the stall detector once keyframe requests have demonstrably failed
 * to unfreeze a tile. Safe to call repeatedly: `rejoin` is guarded against
 * overlapping runs.
 */
export function requestRejoin() {
  rejoinHandler?.();
}