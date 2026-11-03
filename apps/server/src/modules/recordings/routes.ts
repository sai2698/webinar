import { Router } from 'express';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { stat, mkdir, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { ChatMessagePayload, RecordingStatus, TimelineEvent } from '@webinar/shared';
import { prisma } from '../../db/prisma.js';
import { asyncHandler, badRequest, notFound } from '../../middleware/error.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { RECORDINGS_DIR } from '../../realtime/Recorder.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('recordings');

/* ── Admin: list and inspect recordings ────────────────────── */

export const adminRecordingRouter = Router();

adminRecordingRouter.use(requireAuth, requireRole('ADMIN'));

function summarize(row: {
  id: string;
  webinarId: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
  mediaKind: string;
  mediaBytes: number | null;
  timelineJson: string;
  error: string | null;
}) {
  let eventCount = 0;
  try {
    eventCount = (JSON.parse(row.timelineJson) as unknown[]).length;
  } catch {
    // A corrupt timeline should not hide the recording from the list.
  }

  const hasCamMedia =
    existsSync(path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.webm`)) ||
    existsSync(path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.mp4`));

  return {
    id: row.id,
    webinarId: row.webinarId,
    status: row.status as RecordingStatus,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    mediaKind: (row.mediaKind === 'video' ? 'video' : 'none') as 'none' | 'video',
    mediaBytes: row.mediaBytes,
    eventCount,
    error: row.error,
    hasCamMedia,
  };
}

adminRecordingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const webinarId = typeof req.query.webinarId === 'string' ? req.query.webinarId : undefined;

    const rows = await prisma.recording.findMany({
      where: webinarId ? { webinarId } : undefined,
      orderBy: { startedAt: 'desc' },
      take: 100,
    });

    res.json({ recordings: rows.map(summarize) });
  })
);

adminRecordingRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.recording.findUnique({
      where: { id: req.params.id },
      include: { webinar: { select: { slug: true, title: true } } },
    });
    if (!row) throw notFound('Recording not found');

    res.json({
      recording: {
        ...summarize(row),
        timeline: safeParse<TimelineEvent[]>(row.timelineJson, []),
        chat: safeParse<ChatMessagePayload[]>(row.chatJson, []),
        webinar: row.webinar ? { slug: row.webinar.slug, title: row.webinar.title } : null,
      },
    });
  })
);

adminRecordingRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Recording not found');

    // Remove the media files too, otherwise deleting a recording frees the row
    // but leaves the MP4/WebM on disk forever.
    if (row.mediaPath) {
      await unlink(row.mediaPath).catch(() => undefined);
    }
    const camWebm = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.webm`);
    const camMp4 = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.mp4`);
    await unlink(camWebm).catch(() => undefined);
    await unlink(camMp4).catch(() => undefined);

    await prisma.recording.delete({ where: { id: row.id } });
    res.json({ ok: true });
  })
);

/* ── Public: replay data ───────────────────────────────────── */

export const publicRecordingRouter = Router();

/**
 * Replay is public by design: a recorded webinar is marketing material, and
 * the whole point of a replay page is that a prospect can watch it without
 * registering. Only READY recordings are exposed — a session still being
 * captured, or one that failed, has nothing coherent to show.
 */
publicRecordingRouter.get(
  '/:slug/recordings',
  asyncHandler(async (req, res) => {
    const webinar = await prisma.webinar.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, slug: true, title: true },
    });
    if (!webinar) throw notFound('Webinar not found');

    const rows = await prisma.recording.findMany({
      where: { webinarId: webinar.id, status: 'READY' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    res.json({
      webinar: { slug: webinar.slug, title: webinar.title },
      recordings: rows.map(summarize),
    });
  })
);

publicRecordingRouter.get(
  '/:slug/recordings/:id',
  asyncHandler(async (req, res) => {
    const webinar = await prisma.webinar.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    });
    if (!webinar) throw notFound('Webinar not found');

    const row = await prisma.recording.findFirst({
      where: { id: req.params.id, webinarId: webinar.id, status: 'READY' },
      include: { webinar: { select: { slug: true, title: true } } },
    });
    if (!row) throw notFound('Recording not found');

    res.json({
      recording: {
        ...summarize(row),
        timeline: safeParse<TimelineEvent[]>(row.timelineJson, []),
        chat: safeParse<ChatMessagePayload[]>(row.chatJson, []),
        webinar: row.webinar ? { slug: row.webinar.slug, title: row.webinar.title } : null,
      },
    });
  })
);

/**
 * Streams the recorded MP4 or WebM with range support.
 *
 * Range requests are not optional here: without them a browser cannot seek,
 * and the replay scrubber — the whole point of the feature — would be dead.
 */
publicRecordingRouter.get(
  '/:slug/recordings/:id/media',
  asyncHandler(async (req, res) => {
    const webinar = await prisma.webinar.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    });
    if (!webinar) throw notFound('Webinar not found');

    const row = await prisma.recording.findFirst({
      where: { id: req.params.id, webinarId: webinar.id, status: 'READY' },
    });
    if (!row?.mediaPath) throw notFound('This recording has no media');

    const track = typeof req.query.track === 'string' ? req.query.track : undefined;
    let targetFile = row.mediaPath;

    if (track === 'cam') {
      const camWebm = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.webm`);
      const camMp4 = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.mp4`);
      if (existsSync(camWebm)) {
        targetFile = camWebm;
      } else if (existsSync(camMp4)) {
        targetFile = camMp4;
      }
    }

    const resolved = path.resolve(targetFile);
    if (!resolved.startsWith(RECORDINGS_DIR)) {
      throw badRequest('Invalid media path');
    }

    let size: number;
    try {
      size = (await stat(resolved)).size;
    } catch {
      throw notFound('Recording file is missing');
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeType = ext === '.webm' ? 'video/webm' : 'video/mp4';

    const range = req.headers.range;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

    if (!range) {
      res.setHeader('Content-Length', size);
      createReadStream(resolved).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

    if (start > end || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(resolved, { start, end }).pipe(res);
  })
);

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ── Public: replay by recording id ────────────────────────── */

/**
 * A shared replay link carries only the recording id, so the replay page needs
 * a way to fetch the payload without knowing the webinar slug first. This is
 * the same data as the slug-scoped route, just keyed differently.
 */
export const publicRecordingByIdRouter = Router();

publicRecordingByIdRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.recording.findFirst({
      where: { id: req.params.id, status: 'READY' },
      include: { webinar: { select: { slug: true, title: true } } },
    });
    if (!row) throw notFound('Recording not found');

    res.json({
      recording: {
        ...summarize(row),
        timeline: safeParse<TimelineEvent[]>(row.timelineJson, []),
        chat: safeParse<ChatMessagePayload[]>(row.chatJson, []),
        webinar: row.webinar ? { slug: row.webinar.slug, title: row.webinar.title } : null,
      },
    });
  })
);

publicRecordingByIdRouter.get(
  '/:id/media',
  asyncHandler(async (req, res) => {
    const row = await prisma.recording.findFirst({
      where: { id: req.params.id, status: 'READY' },
    });
    if (!row?.mediaPath) throw notFound('This recording has no media');

    const track = typeof req.query.track === 'string' ? req.query.track : undefined;
    let targetFile = row.mediaPath;

    if (track === 'cam') {
      const camWebm = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.webm`);
      const camMp4 = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}-cam.mp4`);
      if (existsSync(camWebm)) {
        targetFile = camWebm;
      } else if (existsSync(camMp4)) {
        targetFile = camMp4;
      }
    }

    const resolved = path.resolve(targetFile);
    if (!resolved.startsWith(RECORDINGS_DIR)) throw badRequest('Invalid media path');

    let size: number;
    try {
      size = (await stat(resolved)).size;
    } catch {
      throw notFound('Recording file is missing');
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeType = ext === '.webm' ? 'video/webm' : 'video/mp4';

    const range = req.headers.range;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

    if (!range) {
      res.setHeader('Content-Length', size);
      createReadStream(resolved).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

    if (start > end || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(resolved, { start, end }).pipe(res);
  })
);

/**
 * Uploads high-quality client-recorded media (WebM/MP4) for a recording session.
 * Supports multi-track uploads (e.g. main/screen stage vs host camera: ?track=cam)
 * Streams directly from HTTP request to disk to support large recordings efficiently.
 */
publicRecordingByIdRouter.post(
  '/:id/upload',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const track = typeof req.query.track === 'string' ? req.query.track : 'main';
    const row = await prisma.recording.findUnique({
      where: { id },
      include: { webinar: true },
    });
    if (!row) throw notFound('Recording not found');

    await mkdir(RECORDINGS_DIR, { recursive: true });

    const contentType = req.headers['content-type'] || '';
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
    const suffix = track === 'cam' ? '-cam' : '';
    const filePath = path.join(RECORDINGS_DIR, `${row.webinarId}-${row.id}${suffix}.${ext}`);

    const writeStream = createWriteStream(filePath);
    await pipeline(req, writeStream);

    let stats;
    try {
      stats = await stat(filePath);
    } catch {
      throw badRequest('Failed to write uploaded media');
    }

    if (stats.size < 1024) {
      await unlink(filePath).catch(() => undefined);
      throw badRequest('Uploaded recording media is too small or empty');
    }

    if (track === 'cam') {
      log.info(`Client uploaded host camera recording for ${id} (${stats.size} bytes, ${ext})`);
      res.json({ ok: true, mediaBytes: stats.size, track: 'cam' });
      return;
    }

    await prisma.recording.update({
      where: { id },
      data: {
        mediaPath: filePath,
        mediaBytes: stats.size,
        mediaKind: 'video',
        status: 'READY',
        error: null,
      },
    });

    log.info(`Client uploaded main recording media for ${id} (${stats.size} bytes, ${ext})`);
    res.json({ ok: true, mediaBytes: stats.size, track: 'main' });
  })
);
