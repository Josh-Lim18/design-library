import express from 'express';
import { listTags, renameTag, mergeTag, deleteTag } from '../db.js';
import { writeMirror } from '../mirror.js';

export const tags = express.Router();

tags.get('/', (_req, res) => {
  res.json(listTags());
});

tags.patch('/:id', (req, res, next) => {
  try {
    const updated = renameTag(Number(req.params.id), req.body?.name ?? '');
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
