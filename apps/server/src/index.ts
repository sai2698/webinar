import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server as SocketServer } from 'socket.io';
import { env, allowedOrigins, isAllowedOrigin } from './config/env.js';
import { iceServers, announcedIp } from './config/mediasoup.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/routes.js';
import {
  adminUsersRouter,
  adminWebinarRouter,
  publicWebinarRouter,
} from './modules/webinars/routes.js';
import { registrationRouter } from './modules/registrations/routes.js';
import { paymentRouter, adminPaymentRouter } from './modules/payments/routes.js';
import { webhookRouter } from './modules/payments/webhook.js';
import {
  adminCourseRouter,
  adminCtaRouter,
  adminQuizRouter,
  adminPollRouter,
  ctaFollowUpRouter,
} from './modules/quizzes/routes.js';
import { registerSocketHandlers } from './realtime/socket.js';
import { workerPool } from './realtime/WorkerPool.js';
import { roomManager } from './realtime/RoomManager.js';
import {
  adminRecordingRouter,
  publicRecordingRouter,
  publicRecordingByIdRouter,
} from './modules/recordings/routes.js';
import { startReminderScheduler, stopReminderScheduler } from './utils/reminders.js';
import { adminCustomFieldRouter } from './modules/customFields/routes.js';
import { adminWebhookRouter } from './modules/webhooks/routes.js';
import {
  startWebhookDispatcher,
  stopWebhookDispatcher,
} from './modules/webhooks/service.js';
import { adminRegistrationRouter } from './modules/registrations/admin.js';
import { adminCohostRouter, cohostPolicyRouter } from './modules/cohosts/routes.js';
import { adminStreamRouter } from './modules/streams/routes.js';
import { adminSeriesRouter } from './modules/series/routes.js';
import { adminApiTokenRouter } from './modules/publicApi/tokens.js';
import { publicApiRouter } from './modules/publicApi/routes.js';
import { adminEmbedRouter, publicEmbedRouter } from './modules/embed/routes.js';
import { adminAnalyticsRouter, publicAnalyticsRouter } from './modules/analytics/routes.js';
import { adminAutomationRouter } from './modules/automation/routes.js';
import { uploadRouter, getUploadsDir } from './modules/uploads/routes.js';
import { adminAttachmentRouter } from './modules/attachments/routes.js';
import { proxyRouter } from './modules/proxy/routes.js';

const app = express();

app.set('trust proxy', 1);
// Bypass helmet for proxy-site so framed websites are not blocked by SAMEORIGIN or CSP frame-ancestors
app.use((req, res, next) => {
  if (req.path.startsWith('/api/proxy-site')) {
    return next();
  }
  return helmet({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false })(req, res, next);
});
app.use(
  cors({
    origin: (origin, callback) =>
      isAllowedOrigin(origin)
        ? callback(null, true)
        : callback(new Error(`Origin ${origin} not allowed by CORS`)),
    credentials: true,
  })
);
app.use(cookieParser());

/* ── Webhook must receive the raw body — mount BEFORE json parser ── */
app.use('/api/payments/webhook', express.raw({ type: '*/*' }), webhookRouter);

/*
 * Attachment uploads carry a whole deck as base64, which inflates the payload
 * by ~33%. The global parser below caps bodies at 25MB, so a 30MB PDF would be
 * rejected before the route ever ran. This widens the limit for exactly one
 * path — POST .../attachments — and leaves every other admin route on the
 * tighter global limit. It runs *before* the global parser so it wins; the
 * router itself is mounted further down, after the global parser, so the small
 * PATCH/DELETE bodies are parsed normally.
 */
app.use('/api/admin', (req, res, next) => {
  if (req.method === 'POST' && /\/attachments\/?$/.test(req.path)) {
    return express.json({ limit: '150mb' })(req, res, next);
  }
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

/* ── Serve uploaded static assets (webinar banners, etc.) ── */
app.use('/uploads', express.static(getUploadsDir()));

/* ── health & time ─────────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    workers: workerPool.size,
    rooms: roomManager.all.length,
  });
});

/** Server time for countdown synchronisation (avoids wrong client clocks). */
app.get('/api/time', (_req, res) => {
  res.json({ now: Date.now(), iso: new Date().toISOString() });
});

/** ICE server config for the browser. */
app.get('/api/rtc-config', (_req, res) => {
  res.json({ iceServers: iceServers() });
});

/** WebRTC Production Diagnostics & Traces */
app.get('/api/health/webrtc', async (_req, res) => {
  try {
    const rooms = roomManager.all;
    const roomsData = [];

    for (const r of rooms) {
      const peersData = [];
      for (const p of r.peers.values()) {
        const sendStats: any[] = p.sendTransport ? await p.sendTransport.getStats().catch(() => []) : [];
        const recvStats: any[] = p.recvTransport ? await p.recvTransport.getStats().catch(() => []) : [];

        // mediasoup's WebRtcTransportStat has NO top-level `protocol` field —
        // the negotiated transport protocol lives on the selected ICE tuple.
        // Reading `stat.protocol` always yielded undefined, which is why the
        // diagnostics modal showed "unknown" for every peer.
        const sendWebrtc = sendStats.find((st: any) => st.type === 'webrtc-transport');
        const recvWebrtc = recvStats.find((st: any) => st.type === 'webrtc-transport');
        const sendProto = sendWebrtc?.iceSelectedTuple?.protocol ?? 'unknown';
        const recvProto = recvWebrtc?.iceSelectedTuple?.protocol ?? 'unknown';

        const producersData = [];
        for (const [id, prod] of p.producers) {
          const stats = await prod.getStats().catch(() => []);
          producersData.push({
            id,
            kind: prod.kind,
            type: prod.type,
            paused: prod.paused,
            stats,
          });
        }

        const consumersData = [];
        for (const [id, cons] of p.consumers) {
          const stats = await cons.getStats().catch(() => []);
          consumersData.push({
            id,
            kind: cons.kind,
            type: cons.type,
            paused: cons.paused,
            producerPaused: cons.producerPaused,
            // Priority is advisory: the estimator still adapts every consumer,
            // it just spends scarce downlink on the higher numbers first.
            priority: cons.priority,
            currentLayers: cons.currentLayers,
            score: cons.score,
            stats,
          });
        }

        peersData.push({
          peerId: p.peerId,
          name: p.name,
          role: p.role,
          sendTransport: {
            id: p.sendTransport?.id,
            // `publishing` distinguishes "no send transport allocated yet"
            // (camera/mic off) from "transport exists but ICE has not
            // connected". The modal used to render both as "unknown".
            publishing: Boolean(p.sendTransport),
            protocol: sendProto,
            isTcpWarning: sendProto === 'tcp',
            iceState: sendWebrtc?.iceState ?? null,
            dtlsState: sendWebrtc?.dtlsState ?? null,
            iceSelectedTuple: sendWebrtc?.iceSelectedTuple ?? null,
            roundTripTime: sendWebrtc?.roundTripTime ?? null,
            availableOutgoingBitrate: sendWebrtc?.availableOutgoingBitrate ?? null,
            availableIncomingBitrate: sendWebrtc?.availableIncomingBitrate ?? null,
            sendBitrate: sendWebrtc?.sendBitrate ?? null,
            recvBitrate: sendWebrtc?.recvBitrate ?? null,
            bytesSent: sendWebrtc?.bytesSent,
            bytesReceived: sendWebrtc?.bytesReceived,
            stats: sendStats,
          },
          recvTransport: {
            id: p.recvTransport?.id,
            publishing: Boolean(p.recvTransport),
            protocol: recvProto,
            isTcpWarning: recvProto === 'tcp',
            iceState: recvWebrtc?.iceState ?? null,
            dtlsState: recvWebrtc?.dtlsState ?? null,
            iceSelectedTuple: recvWebrtc?.iceSelectedTuple ?? null,
            roundTripTime: recvWebrtc?.roundTripTime ?? null,
            availableOutgoingBitrate: recvWebrtc?.availableOutgoingBitrate ?? null,
            availableIncomingBitrate: recvWebrtc?.availableIncomingBitrate ?? null,
            sendBitrate: recvWebrtc?.sendBitrate ?? null,
            recvBitrate: recvWebrtc?.recvBitrate ?? null,
            bytesSent: recvWebrtc?.bytesSent,
            bytesReceived: recvWebrtc?.bytesReceived,
            stats: recvStats,
          },
          producers: producersData,
          consumers: consumersData,
        });
      }

      roomsData.push({
        roomName: r.roomName(),
        peersCount: r.peers.size,
        peers: peersData,
      });
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      announcedIp,
      isLoopbackWarning: announcedIp === '127.0.0.1',
      warning:
        announcedIp === '127.0.0.1'
          ? 'MEDIASOUP_ANNOUNCED_IP is 127.0.0.1. Remote clients outside localhost will fail to exchange media!'
          : null,
      workers: workerPool.size,
      rtcPorts: { min: env.RTC_MIN_PORT, max: env.RTC_MAX_PORT },
      rooms: roomsData,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/* ── routes ────────────────────────────────────────────────── */
app.use('/api/proxy-site', proxyRouter);
app.use('/api/auth', authRouter);
app.use('/api/webinars', publicWebinarRouter);
app.use('/api/webinars', registrationRouter);
app.use('/api/webinars', publicRecordingRouter);
app.use('/api/webinars', publicEmbedRouter);
app.use('/api/webinars', publicAnalyticsRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/admin/webinars', adminWebinarRouter);
app.use('/api/admin/users', adminUsersRouter);
// Mounted ahead of the blanket admin routers below: those apply a staff-role
// guard to every path under /api/admin, and a co-host's JWT still says
// PARTICIPANT. This route only needs authentication.
app.use('/api/admin', cohostPolicyRouter);
// Same reasoning: the offer follow-up list is for whoever runs the room, and a
// co-host's token role is still PARTICIPANT. The handler checks membership.
app.use('/api/admin', ctaFollowUpRouter);
app.use('/api/admin', adminQuizRouter);
app.use('/api/admin', adminPollRouter);
app.use('/api/admin', adminCtaRouter);
app.use('/api/admin/courses', adminCourseRouter);
app.use('/api/admin/payments', adminPaymentRouter);
app.use('/api/admin/upload', uploadRouter);
app.use('/api/admin', adminAttachmentRouter);
app.use('/api/admin/recordings', adminRecordingRouter);
app.use('/api/recordings', publicRecordingByIdRouter);

/* ── webinar.gg parity ─────────────────────────────────────── */
app.use('/api/admin', adminCustomFieldRouter);
app.use('/api/admin', adminRegistrationRouter);
app.use('/api/admin', adminCohostRouter);
app.use('/api/admin', adminStreamRouter);
app.use('/api/admin', adminSeriesRouter);
app.use('/api/admin', adminEmbedRouter);
app.use('/api/admin', adminAnalyticsRouter);
app.use('/api/admin', adminAutomationRouter);
app.use('/api/admin/webhooks', adminWebhookRouter);
app.use('/api/admin/api-tokens', adminApiTokenRouter);
app.use('/api/v1', publicApiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

/* ── http + socket.io ──────────────────────────────────────── */
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: (origin, callback) =>
      isAllowedOrigin(origin)
        ? callback(null, true)
        : callback(new Error(`Origin ${origin} not allowed by CORS`)),
    credentials: true,
  },
  maxHttpBufferSize: 1e7,
  pingTimeout: 30_000,
  pingInterval: 15_000,
});

registerSocketHandlers(io);

async function bootstrap() {
  try {
    await workerPool.init();
    logger.info(`mediasoup ready with ${workerPool.size} worker(s)`);
  } catch (err) {
    logger.error('mediasoup failed to start — media will not work', err);
  }

  server.listen(env.PORT, () => {
    logger.info(`API + realtime listening on http://localhost:${env.PORT}`);
    logger.info(`Allowed origins: ${allowedOrigins.join(', ')}`);
  });

  startReminderScheduler();
  startWebhookDispatcher();
}

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  stopReminderScheduler();
  stopWebhookDispatcher();
  io.close();
  server.close();
  for (const room of roomManager.all) await room.destroy();
  await workerPool.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void bootstrap();
