'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@webinar/shared';
import { SOCKET_URL, getSocketUrl } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

function sanitizeArg(val: any, seen = new WeakSet()): any {
  if (val === null || typeof val !== 'object') return val;
  if (typeof Event !== 'undefined' && val instanceof Event) return undefined;
  if (typeof Node !== 'undefined' && val instanceof Node) return undefined;
  if (typeof Window !== 'undefined' && val instanceof Window) return undefined;
  if (seen.has(val)) return undefined;
  seen.add(val);

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeArg(item, seen)).filter((item) => item !== undefined);
  }

  const clean: any = {};
  for (const key of Object.keys(val)) {
    try {
      const v = val[key];
      if (typeof v === 'function') continue;
      const cleaned = sanitizeArg(v, seen);
      if (cleaned !== undefined) clean[key] = cleaned;
    } catch {
      // ignore
    }
  }
  return clean;
}

export function getSocket(token: string): AppSocket {
  if (socket?.connected) return socket;

  socket?.disconnect();
  const rawSocket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 800,
    timeout: 15_000,
  });

  const rawEmit = rawSocket.emit.bind(rawSocket);
  rawSocket.emit = function (event: string, ...args: any[]) {
    const sanitized = args.map((arg) => (typeof arg === 'function' ? arg : sanitizeArg(arg)));
    return rawEmit(event, ...sanitized);
  } as any;

  socket = rawSocket as AppSocket;
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

export function currentSocket() {
  return socket;
}
