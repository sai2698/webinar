import { Device } from 'mediasoup-client';
import { io, type Socket } from 'socket.io-client';

type Ack<T = Record<string, unknown>> = { ok: boolean; data?: T; error?: string };
type Config = { socketUrl: string; slug: string; token: string; mode: 'host' | 'viewer'; chatEverySeconds: number };

declare global {
  interface Window {
    __webinarLoadAgent?: {
      state: string; error?: string; consumers: number; inboundBytes: number; packetLoss: number;
      stop: () => Promise<void>;
    };
  }
}

const q = new URLSearchParams(location.search);
const config: Config = {
  socketUrl: q.get('socketUrl') || '', slug: q.get('slug') || '', token: q.get('token') || '',
  mode: q.get('mode') === 'host' ? 'host' : 'viewer',
  chatEverySeconds: Number(q.get('chatEverySeconds') || 0),
};
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const statsEl = document.querySelector<HTMLPreElement>('#stats')!;
const state = { state: 'starting', error: undefined as string | undefined, consumers: 0, inboundBytes: 0, packetLoss: 0 };
let socket: Socket | undefined;
let transport: any;
let localStream: MediaStream | undefined;
let statsTimer: number | undefined;
let chatTimer: number | undefined;
const consumed = new Set<string>();

function update() {
  statusEl.textContent = state.error ? `ERROR: ${state.error}` : state.state;
  statsEl.textContent = JSON.stringify({ mode: config.mode, ...state }, null, 2);
  if (window.__webinarLoadAgent) Object.assign(window.__webinarLoadAgent, state);
}
function ack<T>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket is not connected'));
    socket.timeout(20000).emit(event, payload, (timeoutError: Error | null, response: Ack<T>) => {
      if (timeoutError) return reject(timeoutError);
      if (!response?.ok) return reject(new Error(response?.error || `${event} failed`));
      resolve(response.data as T);
    });
  });
}
async function consumeProducer(producerId: string, device: Device) {
  if (!transport || consumed.has(producerId)) return;
  consumed.add(producerId);
  try {
    const params = await ack<any>('consume', { producerId, rtpCapabilities: device.rtpCapabilities });
    const consumer = await transport.consume({
      id: params.id, producerId: params.producerId, kind: params.kind,
      rtpParameters: params.rtpParameters, appData: { peerId: params.peerId, source: params.source },
    });
    await ack('resumeConsumer', { consumerId: consumer.id });
    state.consumers += 1;
    update();
  } catch (error) {
    consumed.delete(producerId);
    throw error;
  }
}

async function start() {
  if (!config.socketUrl || !config.slug || !config.token) throw new Error('Missing socketUrl, slug or token query parameter');
  socket = io(config.socketUrl, { transports: ['websocket', 'polling'], reconnection: false, timeout: 20000 });
  await new Promise<void>((resolve, reject) => {
    socket!.once('connect', resolve);
    socket!.once('connect_error', reject);
  });

  const device = new Device();
  socket.on('producerClosed', (event: { producerId: string }) => {
    consumed.delete(event.producerId);
    state.consumers = Math.max(0, state.consumers - 1);
    update();
  });

  const joined = await ack<any>('join', { slug: config.slug, token: config.token });
  await device.load({ routerRtpCapabilities: joined.rtpCapabilities });
  const transportData = await ack<any>('createTransport', { direction: config.mode === 'host' ? 'send' : 'recv' });
  transport = config.mode === 'host' ? device.createSendTransport(transportData) : device.createRecvTransport(transportData);

  transport.on('connect', ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => {
    ack('connectTransport', { transportId: transport.id, dtlsParameters }).then(callback).catch(errback);
  });

  if (config.mode === 'host') {
    transport.on('produce', ({ kind, rtpParameters, appData }: any, callback: (value: { id: string }) => void, errback: (error: Error) => void) => {
      ack<{ producerId: string }>('produce', {
        transportId: transport.id, kind, rtpParameters, appData,
        source: kind === 'video' ? 'camera' : 'microphone',
      }).then((result) => callback({ id: result.producerId })).catch(errback);
    });
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720, frameRate: 24 } });
    const audio = localStream.getAudioTracks()[0];
    const video = localStream.getVideoTracks()[0];
    if (audio) await transport.produce({ track: audio });
    if (video) await transport.produce({
      track: video,
      encodings: [
        { rid: 'q', scaleResolutionDownBy: 4, maxBitrate: 150000 },
        { rid: 'h', scaleResolutionDownBy: 2, maxBitrate: 500000 },
        { rid: 'f', scaleResolutionDownBy: 1, maxBitrate: 1500000 },
      ],
      codecOptions: { videoGoogleStartBitrate: 1000 },
    });
  } else {
    // RoomSnapshot includes already-published producers; future producers are announced separately.
    for (const peer of joined.snapshot?.peers || []) {
      for (const producer of peer.producers || []) await consumeProducer(producer.producerId, device);
    }
    socket.on('newProducer', (event: { producerId: string }) => {
      void consumeProducer(event.producerId, device).catch((error) => { state.error = String(error); update(); });
    });
  }

  if (config.chatEverySeconds > 0 && config.mode === 'viewer') {
    chatTimer = window.setInterval(() => socket?.emit('chatSend', { text: '[load test] synthetic viewer heartbeat' }), config.chatEverySeconds * 1000);
  }
  statsTimer = window.setInterval(async () => {
    if (!transport) return;
    try {
      const report = await transport.getStats();
      let bytes = 0; let lost = 0;
      report.forEach((item: any) => {
        if (item.type === 'inbound-rtp') { bytes += Number(item.bytesReceived || 0); lost += Number(item.packetsLost || 0); }
      });
      state.inboundBytes = bytes; state.packetLoss = lost; update();
    } catch { /* transient stats errors are non-fatal */ }
  }, 5000);
  state.state = 'connected'; update();
}

window.__webinarLoadAgent = {
  ...state,
  stop: async () => {
    if (statsTimer) clearInterval(statsTimer);
    if (chatTimer) clearInterval(chatTimer);
    localStream?.getTracks().forEach((track) => track.stop());
    transport?.close(); socket?.disconnect();
    state.state = 'stopped'; update();
  },
};
start().catch((error) => { state.state = 'failed'; state.error = error instanceof Error ? error.message : String(error); update(); });
