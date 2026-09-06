import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { UPLOADS_DIR } from '../db.js';

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

export function isSupportedImage(mime) {
  return Boolean(EXT_BY_MIME[mime]);
}

/** `2026-09-06T12-30-00_a1b2c3d4.png` — sortable, collision-resistant. */
export function makeFilename(mime, fallbackExt = '.png') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
  const rand = crypto.randomBytes(4).toString('hex');
  return `${stamp}_${rand}${EXT_BY_MIME[mime] || fallbackExt}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, makeFilename(file.mimetype)),
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isSupportedImage(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Unsupported image type'), { status: 400 }));
  },
}).single('image');
