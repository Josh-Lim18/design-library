import express from 'express';
import { scrapePreview } from '../lib/scrape.js';

export const preview = express.Router();

/**
 * POST /api/preview  { url }
 * Returns { title, imageUrl, siteName } scraped from the page's OG/meta tags.
 * Nothing is persisted. Fields may be null when the page blocks scraping — the
 * client then asks the user to upload a thumbnail manually.
 */
preview.post('/', async (req, res, next) => {
  try {
    const url = String(req.body?.url ?? '').trim();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'A valid URL is required' });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http(s) URLs are supported' });
    }
    const result = await scrapePreview(parsed.href);
    res.json({ ...result, url: parsed.href });
  } catch (e) {
    next(e);
  }
});
