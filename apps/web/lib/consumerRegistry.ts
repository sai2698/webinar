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
 * is a server-side decision now. We deliberately never make that decision —
 * see `preferLayer` for why pinning a simulcast layer is unsafe.
 */
const consumers = new Map<string, Consumer>();
let socket: AppSocket | null = null;

export function setLayerSocket(next: AppSocket | null) {
  socket = next;
}

export function registerConsumer(producerId: string, consumer: Consumer) {
  consumers.set(producerId, consumer);
}

export function unregisterConsumer(producerId: string) {
  consumers.delete(producerId);
}

export function clearConsumers() {
  consumers.clear();
}

/**
 * Asks the SFU for a specific simulcast layer.
 *
 * `spatialLayer` is 0-based: 0 is the lowest resolution, 2 the highest.
 *
 * **This is intentionally a no-op.** Video producers are single-layer now (see
 * `publishTrack` in `useMediasoup.ts`), so there is no layer to choose between.
 *
 * It used to forward to the server's `setPreferredLayers`, which *pins* a
 * consumer to one spatial layer: the SFU stops adapting and will not fall back
 * if that layer stops encoding. A camera producer advertised three simulcast
 * layers, but the top one (`r2`) only ramps up when the encoder has spare
 * bitrate — so pinning a consumer to layer 2 left it waiting for a keyframe
 * that never arrived. The symptom was a tile present in the DOM, whose consumer
 * reported `paused: false`, but whose `<video>` had `videoWidth: 0` and a muted
 * track. It was especially visible when a host shared their screen: the layout
 * switch re-mounted the camera tile, the unmount cleanup pinned the top layer,
 * and the camera went black for every participant.
 *
 * mediasoup exposes no "clear preference" call, so the only safe way to keep
 * the SFU's bandwidth estimator in charge is to never take control away from
 * it. Left alone it always forwards the highest layer that is actually
 * encoding, which is exactly what we want.
 *
 * The filmstrip's "don't download 720p for a 160px tile" optimisation is
 * therefore dropped. It was never worth a black camera.
 */
export function preferLayer(_producerId: string, _spatialLayer: 0 | 1 | 2) {
  /* intentionally empty — see the doc comment above */
}

/**
 * Restores automatic layer selection.
 *
 * Also a no-op, for the same reason: a consumer that was never pinned is
 * already adapting automatically.
 */
export function preferAutoLayer(_producerId: string) {
  /* intentionally empty — see `preferLayer` */
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