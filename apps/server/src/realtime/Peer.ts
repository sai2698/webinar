import type {
  Consumer,
  Producer,
  Router,
  RtpCapabilities,
  RtpParameters,
  WebRtcTransport,
  WebRtcServer,
} from 'mediasoup/types';
import type { Role, MediaSource, CohostPermissions } from '@webinar/shared';
import { webRtcTransportOptions } from '../config/mediasoup.js';
import { canConsume, canPublish, type VisibilitySubject, type VisibilityPolicy } from './visibility.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('peer');

/**
 * mediasoup consumer priorities.
 *
 * The SFU's bandwidth estimator divides a peer's available downlink between its
 * consumers. With every consumer left at the default (1) the split is even, so
 * a 160px thumbnail in the filmstrip competes on equal terms with the 1080p
 * tile the participant is actually watching. When the link tightens, the stage
 * tile degrades at the same rate as the thumbnails — which is exactly the
 * "main video goes soft / stutters while the tiny ones stay fine" complaint.
 *
 * Priority is *advisory*, not a pin: the estimator still adapts every consumer
 * up and down, it just spends scarce bitrate on the higher-priority ones first.
 * That is why this is safe where `setPreferredLayers` was not — a pinned
 * consumer stops adapting entirely and can end up waiting forever for a layer
 * that is not encoding.
 *
 * Range is 0–255; higher wins. mediasoup's own default is 1.
 */
const PRIORITY = {
  /** Screen shares are text-heavy and unreadable when scaled down. */
  screen: 255,
  /** The tile on stage / spotlight — the one everyone is looking at. */
  stage: 200,
  /** Audio must never be starved; it is a rounding error in bitrate terms. */
  audio: 150,
  /** Normal grid tiles. */
  grid: 100,
  /** Filmstrip thumbnails and off-screen tiles. */
  thumbnail: 20,
} as const;

function defaultPriorityFor(kind: 'audio' | 'video', source: MediaSource): number {
  if (kind === 'audio') return PRIORITY.audio;
  if (source === 'screen') return PRIORITY.screen;
  return PRIORITY.grid;
}

/** The coarse tiers a client may ask for. `screen` and `audio` are implied. */
export type ConsumerPriorityTier = 'stage' | 'grid' | 'thumbnail';

export interface PeerInit {
  peerId: string;
  userId: string;
  name: string;
  role: Role;
  socketId: string;
  /**
   * Resolved co-host permissions. `null` means "not a co-host" — an owner, an
   * admin or a plain moderator, all of whom are governed by their role rather
   * than by a permission map.
   */
  permissions?: CohostPermissions | null;
}

/**
 * One Peer per connected socket. Owns its transports, producers and consumers.
 */
export class Peer implements VisibilitySubject {
  readonly peerId: string;
  readonly userId: string;
  readonly socketId: string;
  name: string;
  role: Role;

  isApprovedSpeaker = false;
  canPublishAudio = false;
  canPublishVideo = false;
  canShareScreen = false;
  handRaisedAt: number | null = null;

  get hasScreenShare(): boolean {
    for (const [id, producer] of this.producers) {
      if (producer.kind === 'video' && this.sourceOf(id, 'video') === 'screen') {
        return true;
      }
    }
    return false;
  }

  /**
   * Co-host permissions, or `null` when this peer is not a co-host.
   *
   * A co-host is a HOST-role peer whose powers come from a per-webinar map
   * rather than from the role alone. Keeping it separate from `role` means the
   * existing `isStaff` checks keep working — a co-host is staff, they just may
   * not be allowed to do every staff thing.
   */
  permissions: CohostPermissions | null = null;

  /**
   * Whether this peer's mic and camera are live right now.
   *
   * Reported by the client rather than derived from the producer list: a muted
   * mic keeps its producer open, so "has an audio producer" and "is audible"
   * are different questions. The host needs the second one.
   */
  micOn = false;
  camOn = false;

  sendTransport: WebRtcTransport | null = null;
  recvTransport: WebRtcTransport | null = null;

  readonly producers = new Map<string, Producer>();
  readonly consumers = new Map<string, Consumer>();

  /** producerId → where that producer's media comes from. */
  readonly producerSources = new Map<string, MediaSource>();

  constructor(init: PeerInit) {
    this.peerId = init.peerId;
    this.userId = init.userId;
    this.name = init.name;
    this.role = init.role;
    this.socketId = init.socketId;
    this.permissions = init.permissions ?? null;
  }

  get isStaff(): boolean {
    return this.role === 'ADMIN' || this.role === 'HOST' || this.role === 'MODERATOR';
  }

  /**
   * Whether this peer may perform a named staff action.
   *
   * A peer with no permission map is governed by role alone, so every staff
   * action is allowed. A co-host is checked against their map, and a permission
   * they were not granted is a refusal — not a silent no-op.
   */
  can(permission: keyof CohostPermissions): boolean {
    if (!this.isStaff) return false;
    if (!this.permissions) return true;
    return this.permissions[permission] === true;
  }

  async createTransport(
    router: Router,
    direction: 'send' | 'recv',
    webRtcServer?: WebRtcServer
  ): Promise<WebRtcTransport> {
    const options = webRtcServer
      ? {
          webRtcServer,
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          // Must stay in step with `webRtcTransportOptions` in
          // `config/mediasoup.ts` — the WebRtcServer path is the one that
          // actually runs in production, so a stale value here silently
          // overrides the tuned defaults.
          initialAvailableOutgoingBitrate: 2_500_000,
          maxIncomingBitrate: 5_000_000,
        }
      : webRtcTransportOptions;

    const transport = await router.createWebRtcTransport(options as any);

    /**
     * `maxIncomingBitrate` in the constructor options is only a starting
     * value; mediasoup does not re-apply it. Calling the setter makes the cap
     * explicit and, more importantly, gives us a single place to raise it
     * later without recreating the transport.
     */
    await transport.setMaxIncomingBitrate(5_000_000).catch(() => {
      /* not fatal — the constructor value still applies */
    });

    transport.on('dtlsstatechange', (state: string) => {
      if (state === 'closed') {
        log.debug(`transport closed for ${this.name}`);
        transport.close();
      }
    });

    if (direction === 'send') this.sendTransport = transport;
    else this.recvTransport = transport;

    return transport;
  }

  closeTransport(direction: 'send' | 'recv', transportId?: string): boolean {
    if (direction === 'send' && this.sendTransport) {
      if (!transportId || this.sendTransport.id === transportId) {
        log.debug(`Closing send transport on-demand for ${this.name} (${this.sendTransport.id})`);
        this.sendTransport.close();
        this.sendTransport = null;
        return true;
      }
    } else if (direction === 'recv' && this.recvTransport) {
      if (!transportId || this.recvTransport.id === transportId) {
        log.debug(`Closing recv transport on-demand for ${this.name} (${this.recvTransport.id})`);
        this.recvTransport.close();
        this.recvTransport = null;
        return true;
      }
    }
    return false;
  }

  async produce(
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: RtpParameters,
    appData: Record<string, unknown>,
    settings: { allowMic: boolean; allowVideo: boolean },
    source: MediaSource = kind === 'audio' ? 'microphone' : 'camera'
  ): Promise<Producer> {
    if (!this.sendTransport || this.sendTransport.id !== transportId) {
      throw new Error('Send transport not found');
    }

    // Server-side publish authorisation — never trust the client.
    if (!canPublish(this, settings, kind, source)) {
      throw new Error(
        kind === 'audio'
          ? 'You are not allowed to publish audio right now'
          : source === 'screen'
            ? 'You are not allowed to share screen right now'
            : 'You are not allowed to publish video right now'
      );
    }

    const producer = await this.sendTransport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, peerId: this.peerId, userId: this.userId, source },
    });

    this.producers.set(producer.id, producer);
    this.producerSources.set(producer.id, source);

    producer.on('transportclose', () => {
      this.producers.delete(producer.id);
      this.producerSources.delete(producer.id);
    });

    return producer;
  }

  /** The source tag for a producer, defaulting sensibly for older clients. */
  sourceOf(producerId: string, kind: 'audio' | 'video'): MediaSource {
    return this.producerSources.get(producerId) ?? (kind === 'audio' ? 'microphone' : 'camera');
  }

  async consume(
    router: Router,
    producer: Producer,
    owner: Peer,
    rtpCapabilities: RtpCapabilities,
    policy: VisibilityPolicy
  ): Promise<Consumer> {
    if (!this.recvTransport) throw new Error('Receive transport not found');

    const kind = producer.kind as 'audio' | 'video';
    const source = owner.sourceOf(producer.id, kind);

    // ── THE POLICY CHECK ──────────────────────────────────────
    if (
      !canConsume(
        this,
        {
          role: owner.role,
          isApprovedSpeaker: owner.isApprovedSpeaker,
          canPublishAudio: owner.canPublishAudio,
          canPublishVideo: owner.canPublishVideo,
          canShareScreen: owner.canShareScreen,
          hasScreenShare: owner.hasScreenShare,
          kind,
          source,
        },
        policy
      )
    ) {
      throw new Error('Not allowed to consume this producer');
    }

    if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
      throw new Error('Cannot consume — incompatible RTP capabilities');
    }

    const consumer = await this.recvTransport.consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: true, // resumed explicitly by the client after it wires up the track
      appData: { peerId: owner.peerId, userId: owner.userId, kind, source },
    });

    this.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => this.consumers.delete(consumer.id));
    consumer.on('producerclose', () => this.consumers.delete(consumer.id));

    // Give the consumer a sensible starting priority. The client refines this
    // once it knows which tile is on stage — see `setConsumerPriority`.
    await consumer.setPriority(defaultPriorityFor(kind, source)).catch(() => {});

    return consumer;
  }

  /**
   * Re-ranks one consumer so the SFU spends scarce downlink on it first.
   *
   * `tier` is a coarse label rather than a raw number so the client cannot
   * invent priorities that starve audio. Unknown tiers fall back to `grid`.
   *
   * Returns `false` when the consumer is gone, so the caller can skip the ack
   * work rather than throwing at a client that is already tearing down.
   */
  async setConsumerPriority(consumerId: string, tier: ConsumerPriorityTier): Promise<boolean> {
    const consumer = this.consumers.get(consumerId);
    if (!consumer || consumer.closed) return false;

    // Audio outranks everything: it is ~40 kbps and a dropped syllable is far
    // more noticeable than a soft frame.
    const priority =
      consumer.kind === 'audio'
        ? PRIORITY.audio
        : consumer.appData?.source === 'screen'
          ? PRIORITY.screen
          : (PRIORITY[tier] ?? PRIORITY.grid);

    if (consumer.priority === priority) return true;

    await consumer.setPriority(priority).catch(() => {});
    return true;
  }

  /**
   * Closes every consumer that delivers media from `ownerPeerId`.
   *
   * Returns the **producer** ids, not the consumer ids. The client keys its
   * consumer map and its remote-stream map by producer id, so a
   * `producerClosed` broadcast carrying a consumer id matches nothing and the
   * departed peer's tile stays on screen forever.
   */
  closeConsumersFrom(ownerPeerId: string): string[] {
    const closed: string[] = [];
    for (const [id, consumer] of this.consumers) {
      if (consumer.appData?.peerId === ownerPeerId) {
        closed.push(consumer.producerId);
        consumer.close();
        this.consumers.delete(id);
      }
    }
    return closed;
  }

  closeAllProducers(): string[] {
    const ids: string[] = [];
    for (const [id, producer] of this.producers) {
      producer.close();
      this.producers.delete(id);
      this.producerSources.delete(id);
      ids.push(id);
    }
    return ids;
  }

  close(): void {
    for (const consumer of this.consumers.values()) consumer.close();
    for (const producer of this.producers.values()) producer.close();
    this.consumers.clear();
    this.producers.clear();
    this.producerSources.clear();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
  }

  toInfo() {
    return {
      peerId: this.peerId,
      userId: this.userId,
      name: this.name,
      role: this.role,
      isApprovedSpeaker: this.isApprovedSpeaker,
      canPublishAudio: this.canPublishAudio,
      canPublishVideo: this.canPublishVideo,
      canShareScreen: this.canShareScreen,
      producers: [...this.producers.values()].map((p) => ({
        producerId: p.id,
        kind: p.kind as 'audio' | 'video',
        source: this.sourceOf(p.id, p.kind as 'audio' | 'video'),
      })),
      micOn: this.micOn,
      camOn: this.camOn,
    };
  }
}
