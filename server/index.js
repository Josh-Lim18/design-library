import './env.js'; // loads .env into process.env before anything reads it
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ROOT_DIR, UPLOADS_DIR, JSON_PATH, listSections, listStyles } from './db.js';
import { writeMirror } from './mirror.js';
import { aiTaggingAvailable } from './lib/analyze.js';
import { items } from './routes/items.js';
import { tags } from './routes/tags.js';
import { preview } from './routes/preview.js';

const PORT = Number(process.env.PORT) || 3001;
const DIST_DIR = path.join(ROOT_DIR, 'web', 'dist');

// Ensure the text mirror exists on first run.
if (!fs.existsSync(JSON_PATH)) writeMirror();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    immutable: true,
    maxAge: '1y',
    setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
  })
);

app.use('/api/items', items);
app.use('/api/tags', tags);
app.use('/api/preview', preview);

app.get('/api/sections', (_req, res) => res.json(listSections()));
app.get('/api/styles', (_req, res) => res.json(listStyles()));
app.get('/api/health', (_req, res) => res.json({ ok: true, aiTagging: aiTaggingAvailable() }));

// Frontend: serve the built SPA when it exists.
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('text/plain')
      .send('API is running. Build the frontend with `npm run build`, or use `npm run dev`.')
  );
}

// 404 for unmatched API routes.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`design-library running at http://localhost:${PORT}`);
});
