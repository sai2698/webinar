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
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
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
  initialAvailableOutgoingBitrate: 1_000_000,
  maxIncomingBitrate: 3_000_000,
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
