import os from 'node:os';
import type { RouterRtpCodecCapability, WorkerSettings } from 'mediasoup/types';
import { env } from './env.js';

/**
 * Adapter names that must never be advertised as the media address.
 *
 * These are all virtual switches or NAT gateways. They are perfectly valid
 * IPv4 interfaces, so a naive "first non-internal address" scan picks them up
 * — and that is catastrophic for WebRTC, because every ICE candidate then
 * points at a NAT gateway instead of the machine's real NIC. Media gets
 * hairpinned through a virtual switch, which shows up as multi-second RTT and
 * intermittent `ice: disconnected` even when client and server are on the same
 * host.
 *
 * On this machine the enumeration order put `vEthernet (Default Switch)` at
 * `172.18.0.1` ahead of the real `Ethernet` adapter at `10.52.150.124`, and
 * every peer reported `rtt=4639ms` on localhost as a result.
 */
const VIRTUAL_ADAPTER_PATTERNS = [
  /vEthernet/i, // Hyper-V virtual switch (incl. "Default Switch")
  /Hyper-V/i,
  /WSL/i, // WSL2 host-side vNIC
  /Docker/i, // Docker Desktop bridge
  /veth/i, // Linux container veth pair
  /br-/i, // Linux bridge
  /VirtualBox/i,
  /VMware/i,
  /VMnet/i,
  /Loopback/i,
  /TAP-|TUN/i,
  /Tailscale|ZeroTier|Hamachi|Radmin/i, // overlay VPNs
  /Bluetooth/i,
];

/** Link-local (169.254/16) and CGNAT (100.64/10) addresses are never routable peers. */
function isUnusableAddress(address: string): boolean {
  if (address.startsWith('169.254.')) return true;
  const [a, b] = address.split('.').map(Number);
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER_PATTERNS.some((re) => re.test(name));
}

/**
 * Picks the address to advertise in ICE candidates.
 *
 * Order of preference:
 *  1. `MEDIASOUP_ANNOUNCED_IP`, if set — always wins, because a deployment
 *     behind NAT or a load balancer knows its public address better than we do.
 *  2. In development, the first *physical* IPv4 adapter. Virtual switches are
 *     skipped so media does not hairpin through Hyper-V/WSL/Docker.
 *  3. Any non-internal IPv4, if every adapter looked virtual.
 *  4. Loopback, as a last resort.
 */
function getAnnouncedIp(): string {
  if (env.MEDIASOUP_ANNOUNCED_IP && env.MEDIASOUP_ANNOUNCED_IP !== '127.0.0.1') {
    return env.MEDIASOUP_ANNOUNCED_IP;
  }

  if (env.NODE_ENV !== 'production') {
    const interfaces = os.networkInterfaces();
    const physical: string[] = [];
    const fallback: string[] = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.internal || iface.family !== 'IPv4') continue;
        if (isUnusableAddress(iface.address)) continue;
        if (isVirtualAdapter(name)) {
          fallback.push(iface.address);
        } else {
          physical.push(iface.address);
        }
      }
    }

    if (physical.length > 0) return physical[0];
    if (fallback.length > 0) {
      console.warn(
        `[mediasoup] only virtual network adapters found (${fallback.join(', ')}). ` +
          'Media will hairpin through a virtual switch and RTT will be poor. ' +
          'Set MEDIASOUP_ANNOUNCED_IP to the real LAN or public address.'
      );
      return fallback[0];
    }
  }

  return env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1';
}

export const announcedIp = getAnnouncedIp();

export const workerSettings: WorkerSettings = {
  rtcMinPort: env.RTC_MIN_PORT,
  rtcMaxPort: env.RTC_MAX_PORT,
  logLevel: 'warn',
  logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
};

export const mediaCodecs: RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      // Opus defaults to ~32 kbps mono-ish behaviour. These make it use the
      // full 48 kHz stereo band and enable in-band FEC, which is what keeps
      // speech intelligible when a packet is lost instead of producing the
      // robotic warble that a naive Opus config gives you.
      useinbandfec: 1,
      minptime: 10,
      stereo: 1,
      'sprop-stereo': 1,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      // Starting estimate for a new producer. Too low and the first seconds of
      // every stream look like a slideshow while the encoder ramps up.
      'x-google-start-bitrate': 1200,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1200,
    },
  },
];

export const webRtcTransportOptions = {
  listenInfos: [
    {
      protocol: 'udp' as const,
      ip: '0.0.0.0',
      announcedAddress: announcedIp,
    },
    {
      protocol: 'tcp' as const,
      ip: '0.0.0.0',
      announcedAddress: announcedIp,
    },
    /*
     * A loopback candidate, offered only in development.
     *
     * Without it, a browser on the same machine as the server has no candidate
     * that resolves locally: it must hairpin out to the LAN address and back
     * through the host's own NIC. That path is measurably slow — it produced
     * 700 ms RTT on localhost, which is enough to make a 720p stream stutter
     * and to trip ICE into `disconnected`. Advertising 127.0.0.1 as well lets
     * ICE pick the direct loopback pair, which is effectively free.
     *
     * Never enabled in production: a public deployment must not advertise a
     * loopback address, and no remote client could use it anyway.
     */
    ...(env.NODE_ENV !== 'production'
      ? [
          {
            protocol: 'udp' as const,
            ip: '127.0.0.1',
            announcedAddress: '127.0.0.1',
          },
        ]
      : []),
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  /**
   * The SFU's opening guess at how much it may send a peer.
   *
   * This used to be 1 Mbps. Every consumer starts throttled to that estimate
   * and only climbs once the REMB/transport-cc feedback proves the path can
   * take more — so the first several seconds of a 4-person call were visibly
   * soft and stuttery even on a fast LAN. 2.5 Mbps covers three simultaneous
   * 720p camera streams, which is the realistic worst case for a small room.
   */
  initialAvailableOutgoingBitrate: 2_500_000,
  /**
   * Hard ceiling on what a single peer may push *into* the SFU.
   *
   * A publisher sending three simulcast layers needs headroom for all three
   * (roughly 150 + 400 + 900 kbps plus overhead), so 3 Mbps was too tight once
   * simulcast came back. 5 Mbps leaves room for a screen share alongside a
   * camera without letting one misbehaving client saturate the worker.
   */
  maxIncomingBitrate: 5_000_000,
};

/** ICE servers handed to the browser for the mediasoup-client Device. */
export function iceServers() {
  const servers: { urls: string; username?: string; credential?: string }[] = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  if (env.TURN_URL) {
    servers.push({
      urls: env.TURN_URL,
      username: env.TURN_USERNAME,
      credential: env.TURN_PASSWORD,
    });
  }
  return servers;
}
