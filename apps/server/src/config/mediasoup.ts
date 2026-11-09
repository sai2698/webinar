import os from 'node:os';
import type { RouterRtpCodecCapability, WorkerSettings } from 'mediasoup/types';
import { env } from './env.js';

function getAnnouncedIp(): string {
  if (env.MEDIASOUP_ANNOUNCED_IP && env.MEDIASOUP_ANNOUNCED_IP !== '127.0.0.1') {
    return env.MEDIASOUP_ANNOUNCED_IP;
  }
  if (env.NODE_ENV !== 'production') {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.family === 'IPv4') {
          return iface.address;
        }
      }
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
