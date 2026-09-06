import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  UPLOADS_DIR,
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  setTagCategories,
  db,
} from '../db.js';
import { uploadImage } from '../lib/upload.js';
import { downloadImage } from '../lib/scrape.js';
import { analyzeImage } from '../lib/analyze.js';
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

/** Analysis runs unless the client explicitly opts out with analyze=false/0/off. */
function wantsAnalysis(value) {
  if (value === undefined || value === null || value === '') return true;
  return !['false', '0', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

/**
 * Run image analysis for a freshly created item and fold the results in: AI
 * tags (each with a subcategory) are unioned with whatever the user typed, the
 * AI description is used only when the user left that field blank, and each
 * generated tag's category is recorded. A failure here is logged and swallowed
 * — the item stays as it was created.
 */
/** Fold an analysis result into an item: union tags, set categories + section,
 *  fill the description only if it is currently blank. Returns the updated item. */
function foldAnalysis(item, ai, keepDescription) {
  const patch = { tags: [...item.tags, ...ai.tags.map((t) => t.name)] };
  if (ai.style) patch.style = ai.style;
  if (ai.section) patch.section = ai.section;
  if (!keepDescription && ai.description) patch.description = ai.description;
  const updated = updateItem(item.id, patch) ?? item;
  setTagCategories(ai.tags);
  return updated;
}

async function applyAnalysis(item, { userDescription }) {
  try {
    const ai = await analyzeImage(item.image_path);
    if (!ai) return item;
    return foldAnalysis(item, ai, Boolean(userDescription));
  } catch (e) {
    console.error('Image analysis failed:', e.message);
    return item;
  }
}

function parseFilters(query) {
  const tags = []
    .concat(query.tags ?? [])
    .flatMap((t) => String(t).split(','))
    .map((t) => t.trim())
    .filter(Boolean);
  const mode = String(query.mode).toLowerCase() === 'and' ? 'and' : 'or';
  return {
    tags,
    mode,
    q: query.q ? String(query.q) : '',
    section: query.section ? String(query.section) : '',
    style: query.style ? String(query.style) : '',
  };
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
  uploadImage(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'An image file is required' });
    let item;
    try {
      const userTags = parseTags(req.body.tags);
      const userDescription = req.body.description?.trim() || null;
      item = createItem({
        image_path: req.file.filename,
        source_url: req.body.source_url?.trim() || null,
        description: userDescription,
        tags: userTags,
      });
      if (wantsAnalysis(req.body.analyze)) {
        item = await applyAnalysis(item, { userDescription });
      }
      writeMirror();
      res.status(201).json(item);
    } catch (e) {
      if (!item) fs.rm(path.join(UPLOADS_DIR, req.file.filename), () => {});
      next(e);
    }
  });
}

async function createFromUrl(req, res, next) {
  try {
    const { image_url, source_url, description, analyze } = req.body ?? {};
    if (!image_url) {
      return res.status(400).json({ error: 'image_url is required (or upload a file instead)' });
    }
    const filename = await downloadImage(image_url, source_url);
    const userTags = parseTags(req.body.tags);
    const userDescription = description?.trim() || null;
    let item = createItem({
      image_path: filename,
      source_url: source_url?.trim() || null,
      description: userDescription,
      tags: userTags,
    });
    if (wantsAnalysis(analyze)) {
      item = await applyAnalysis(item, { userDescription });
    }
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
    if ('section' in req.body) patch.section = req.body.section || null;
    if ('style' in req.body) patch.style = req.body.style || null;
    if ('tags' in req.body) patch.tags = parseTags(req.body.tags);
    const item = updateItem(Number(req.params.id), patch);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    writeMirror();
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// Re-run the vision pass on an item's existing image: adds any new tags, records
// their categories, sets the section, and fills a still-blank description.
items.post('/:id/reanalyze', async (req, res, next) => {
  try {
    const item = getItem(Number(req.params.id));
    if (!item) return res.status(404).json({ error: 'Item not found' });

    let ai;
    try {
      ai = await analyzeImage(item.image_path);
    } catch (e) {
      return res.status(502).json({ error: `Analysis failed: ${e.message}` });
    }
    if (!ai) {
      return res
        .status(422)
        .json({ error: 'Analysis is unavailable or produced nothing for this image.' });
    }

    const updated = foldAnalysis(item, ai, Boolean(item.description));
    writeMirror();
    res.json(updated);
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
