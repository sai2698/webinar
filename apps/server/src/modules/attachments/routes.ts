import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, badRequest, notFound } from '../../middleware/error.js';
import { logger } from '../../utils/logger.js';
import { getUploadsDir } from '../uploads/routes.js';
import { roomManager } from '../../realtime/RoomManager.js';

/**
 * Host-uploaded presentation files.
 *
 * These exist so a host can put a deck on the stage *without* screen sharing.
 * A screen share publishes a video track of the presenter's desktop: it costs
 * SFU bandwidth, it leaks whatever else is on that desktop, and the audience
 * sees it at whatever resolution the consumer negotiated. An attachment is
 * served as a plain file and rendered natively by each viewer, so a PDF stays
 * crisp at any zoom and the SFU carries nothing.
 *
 * Uploads arrive as base64 in the JSON body (the same shape the banner upload
 * uses) rather than multipart, because the client already has a FileReader
 * pipeline and adding multer would mean a second body parser on the same app.
 */

/** 50MB — a 200-slide deck with images lands comfortably under this. */
const MAX_BYTES = 50 * 1024 * 1024;

type Kind = 'pdf' | 'pptx' | 'image';

/**
 * Maps an extension to the viewer the client should mount.
 *
 * `.ppt` (the legacy binary format) is accepted and stored, but pptx-preview
 * only understands OOXML, so it is reported as `pptx` and the client shows a
 * download fallback if parsing fails. Rejecting it outright would be worse —
 * hosts do still have old decks.
 */
function kindForExt(ext: string): Kind | null {
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'pptx':
    case 'ppt':
      return 'pptx';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
    case 'svg':
      return 'image';
    default:
      return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export const adminAttachmentRouter = Router();

adminAttachmentRouter.use(requireAuth, requireRole('ADMIN', 'HOST', 'MODERATOR'));

/** GET /api/admin/:webinarId/attachments */
adminAttachmentRouter.get(
  '/:webinarId/attachments',
  asyncHandler(async (req, res) => {
    const attachments = await prisma.attachment.findMany({
      where: { webinarId: req.params.webinarId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ attachments });
  })
);

/**
 * POST /api/admin/:webinarId/attachments
 * Body: { data: base64 | DataURL, filename: string, pageCount?: number }
 */
adminAttachmentRouter.post(
  '/:webinarId/attachments',
  asyncHandler(async (req, res) => {
    const { data, filename, pageCount } = req.body || {};

    if (!data || typeof data !== 'string') {
      throw badRequest('File data is required (base64 or Data URL)');
    }
    if (!filename || typeof filename !== 'string') {
      throw badRequest('A filename is required so the file type can be determined');
    }

    const ext = path.extname(filename).replace('.', '').toLowerCase();
    const kind = kindForExt(ext);
    if (!kind) {
      throw badRequest(
        `Unsupported file type ".${ext}". Upload a PDF, PowerPoint (.ppt/.pptx) or an image.`
      );
    }

    // Accept both a full Data URL and a bare base64 payload.
    let buffer: Buffer;
    if (data.startsWith('data:')) {
      const match = data.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) throw badRequest('Invalid Data URL format');
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
    }

    if (buffer.length === 0) throw badRequest('The uploaded file is empty');
    if (buffer.length > MAX_BYTES) {
      throw badRequest(
        `File is too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 50MB.`
      );
    }

    const uploadsDir = getUploadsDir();
    const rand = crypto.randomBytes(4).toString('hex');
    const safeFilename = `att_${Date.now()}_${rand}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, safeFilename), buffer);

    const origin = process.env.API_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/uploads/${safeFilename}`;

    // Strip any path components from the display name — a browser can send a
    // full path from some OSes and we only ever want the leaf.
    const displayName = path.basename(filename).slice(0, 200);

    const attachment = await prisma.attachment.create({
      data: {
        webinarId: req.params.webinarId,
        name: displayName,
        url,
        kind,
        mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
        bytes: buffer.length,
        pageCount: Number.isFinite(Number(pageCount)) ? Math.max(0, Number(pageCount)) : 0,
      },
    });

    logger.info(
      `Attachment uploaded: ${displayName} (${kind}, ${(buffer.length / 1024).toFixed(1)} KB)`
    );

    res.status(201).json({ attachment });
  })
);

/** PATCH /api/admin/attachments/:id — lets the client backfill a page count. */
adminAttachmentRouter.patch(
  '/attachments/:id',
  asyncHandler(async (req, res) => {
    const { pageCount } = req.body || {};
    const existing = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Attachment not found');

    const attachment = await prisma.attachment.update({
      where: { id: req.params.id },
      data: {
        pageCount: Number.isFinite(Number(pageCount))
          ? Math.max(0, Number(pageCount))
          : existing.pageCount,
      },
    });
    res.json({ attachment });
  })
);

/** DELETE /api/admin/attachments/:id */
adminAttachmentRouter.delete(
  '/attachments/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Attachment not found');

    await prisma.attachment.delete({ where: { id: req.params.id } });

    /*
     * If the deleted file is the one currently on the stage, take it down.
     * Otherwise every viewer keeps a dead URL and the stage shows a download
     * error until the host happens to press Stop — which they cannot do,
     * because the row they would click is gone.
     */
    const room = roomManager.get(existing.webinarId);
    if (room?.getPresentation()?.attachmentId === existing.id) {
      room.clearPresentation();
    }

    // Best-effort file removal. A missing file is not an error — the row is
    // already gone and the host's intent (delete this) has been satisfied.
    try {
      const leaf = existing.url.split('/').pop();
      if (leaf) {
        const filePath = path.join(getUploadsDir(), leaf);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (err) {
      logger.warn(`Could not remove attachment file for ${existing.id}: ${String(err)}`);
    }

    res.json({ ok: true });
  })
);
