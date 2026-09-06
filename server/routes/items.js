import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { UPLOADS_DIR, getItems, getItem, createItem, updateItem, deleteItem, db } from '../db.js';
import { uploadImage } from '../lib/upload.js';
import { downloadImage } from '../lib/scrape.js';
import { writeMirror } from '../mirror.js';

export const items = express.Router();

/** Accept tags as an array, a JSON array string, or a comma-separated string. */
function parseTags(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to comma split */
    }
  }
  return trimmed.split(',');
}

function parseFilters(query) {
  const tags = []
    .concat(query.tags ?? [])
    .flatMap((t) => String(t).split(','))
    .map((t) => t.trim())
    .filter(Boolean);
  const mode = String(query.mode).toLowerCase() === 'and' ? 'and' : 'or';
  return { tags, mode, q: query.q ? String(query.q) : '' };
}

items.get('/', (req, res) => {
  res.json(getItems(parseFilters(req.query)));
});

items.get('/:id', (req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

items.post('/', (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) return createFromUpload(req, res, next);
  return createFromUrl(req, res, next);
});

function createFromUpload(req, res, next) {
  uploadImage(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'An image file is required' });
    try {
      const item = createItem({
        image_path: req.file.filename,
        source_url: req.body.source_url?.trim() || null,
        description: req.body.description?.trim() || null,
        tags: parseTags(req.body.tags),
      });
      writeMirror();
      res.status(201).json(item);
    } catch (e) {
      fs.rm(path.join(UPLOADS_DIR, req.file.filename), () => {});
      next(e);
    }
  });
}

async function createFromUrl(req, res, next) {
  try {
    const { image_url, source_url, description } = req.body ?? {};
    if (!image_url) {
      return res.status(400).json({ error: 'image_url is required (or upload a file instead)' });
    }
    const filename = await downloadImage(image_url, source_url);
    const item = createItem({
      image_path: filename,
      source_url: source_url?.trim() || null,
      description: description?.trim() || null,
      tags: parseTags(req.body.tags),
    });
    writeMirror();
    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
}

items.patch('/:id', (req, res, next) => {
  try {
    const patch = {};
    if ('source_url' in req.body) patch.source_url = req.body.source_url?.trim() || null;
    if ('description' in req.body) patch.description = req.body.description?.trim() || null;
    if ('tags' in req.body) patch.tags = parseTags(req.body.tags);
    const item = updateItem(Number(req.params.id), patch);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    writeMirror();
    res.json(item);
  } catch (e) {
    next(e);
  }
});

items.delete('/:id', (req, res, next) => {
  try {
    const imagePath = deleteItem(Number(req.params.id));
    if (imagePath === null) return res.status(404).json({ error: 'Item not found' });
    // Remove the file only if nothing else points at it and it lives in uploads/.
    const stillUsed = db.prepare('SELECT 1 FROM items WHERE image_path = ? LIMIT 1').get(imagePath);
    const abs = path.join(UPLOADS_DIR, path.basename(imagePath));
    if (!stillUsed && abs.startsWith(UPLOADS_DIR) && fs.existsSync(abs)) fs.rmSync(abs);
    writeMirror();
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
