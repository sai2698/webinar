import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, badRequest } from '../../middleware/error.js';
import { logger } from '../../utils/logger.js';

export function getUploadsDir(): string {
  const serverPath = path.resolve(process.cwd(), 'apps', 'server', 'uploads');
  if (fs.existsSync(path.resolve(process.cwd(), 'apps', 'server'))) {
    if (!fs.existsSync(serverPath)) fs.mkdirSync(serverPath, { recursive: true });
    return serverPath;
  }
  const rootPath = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(rootPath)) fs.mkdirSync(rootPath, { recursive: true });
  return rootPath;
}

export const uploadRouter = Router();

uploadRouter.use(requireAuth, requireRole('ADMIN', 'HOST', 'MODERATOR'));

/**
 * POST /api/admin/upload
 * Accepts base64 image data (e.g. Data URL from FileReader) and stores it on disk,
 * returning a publicly accessible URL for the webinar banner.
 */
uploadRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { data, filename } = req.body || {};

    if (!data || typeof data !== 'string') {
      throw badRequest('Image data is required (base64 or Data URL)');
    }

    let buffer: Buffer;
    let ext = 'png';

    if (data.startsWith('data:')) {
      const match = data.match(/^data:([a-zA-Z0-9-+/]+);base64,(.+)$/);
      if (!match) {
        throw badRequest('Invalid Data URL format');
      }
      const mime = match[1].toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';
      else if (mime.includes('svg')) ext = 'svg';
      else if (mime.includes('png')) ext = 'png';
      else {
        throw badRequest(`Unsupported image type: ${mime}`);
      }
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
      if (filename && typeof filename === 'string') {
        const fileExt = path.extname(filename).replace('.', '').toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(fileExt)) {
          ext = fileExt === 'jpeg' ? 'jpg' : fileExt;
        }
      }
    }

    // Limit image size to 15MB
    if (buffer.length > 15 * 1024 * 1024) {
      throw badRequest('Image file is too large (max 15MB)');
    }

    const uploadsDir = getUploadsDir();
    const rand = crypto.randomBytes(4).toString('hex');
    const safeFilename = `banner_${Date.now()}_${rand}.${ext}`;
    const filePath = path.join(uploadsDir, safeFilename);

    fs.writeFileSync(filePath, buffer);
    logger.info(`Saved uploaded image: ${safeFilename} (${(buffer.length / 1024).toFixed(1)} KB)`);

    const origin = (process.env.API_ORIGIN || `${req.protocol}://${req.get('host')}`);
    const url = `${origin}/uploads/${safeFilename}`;

    res.json({
      ok: true,
      url,
      filename: safeFilename,
      size: buffer.length,
      mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });
  })
);

