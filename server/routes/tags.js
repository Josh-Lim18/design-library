import express from 'express';
import { listTags, renameTag, mergeTag, deleteTag, setTagCategory } from '../db.js';
import { writeMirror } from '../mirror.js';

export const tags = express.Router();

tags.get('/', (_req, res) => {
  res.json(listTags());
});

// Rename (`{ name }`) and/or re-file (`{ category }`) a tag. `category: null`
// or "" clears it.
tags.patch('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = req.body ?? {};
    let updated;
    if ('name' in body) {
      updated = renameTag(id, body.name ?? '');
    }
    if (updated !== null && 'category' in body) {
      updated = setTagCategory(id, body.category || null);
    }
    if (updated === undefined) return res.status(400).json({ error: 'Nothing to update' });
    if (!updated) return res.status(404).json({ error: 'Tag not found' });
    writeMirror();
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

tags.post('/:id/merge', (req, res, next) => {
  try {
    const intoId = Number(req.body?.intoId ?? req.body?.into_id);
    if (!intoId) return res.status(400).json({ error: 'intoId is required' });
    const target = mergeTag(Number(req.params.id), intoId);
    if (!target) return res.status(404).json({ error: 'Tag not found' });
    writeMirror();
    res.json(target);
  } catch (e) {
    next(e);
  }
});

tags.delete('/:id', (req, res, next) => {
  try {
    const ok = deleteTag(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Tag not found' });
    writeMirror();
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
