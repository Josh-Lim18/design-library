import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { UPLOADS_DIR } from '../db.js';
import { makeFilename, isSupportedImage } from './upload.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function fetchWithTimeout(url, opts = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { redirect: 'follow', signal: ctrl.signal, ...opts }).finally(() =>
    clearTimeout(timer)
  );
}

function pickMeta(root, names) {
  for (const name of names) {
    const el =
      root.querySelector(`meta[property="${name}"]`) || root.querySelector(`meta[name="${name}"]`);
    const content = el?.getAttribute('content')?.trim();
    if (content) return content;
  }
  return null;
}

/**
 * Fetch `url` and pull a title + preview image out of its Open Graph / Twitter /
 * <title> metadata. Never throws for "no preview found" — returns nulls so the
 * caller can fall back to a manual thumbnail.
 */
export async function scrapePreview(url) {
  const result = { title: null, imageUrl: null, siteName: null };
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
  } catch {
    return result;
  }
  if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return result;

  const root = parse(await res.text());
  result.title =
    pickMeta(root, ['og:title', 'twitter:title']) ||
    root.querySelector('title')?.text?.trim() ||
    null;
  result.siteName = pickMeta(root, ['og:site_name']);

  const rawImage = pickMeta(root, [
    'og:image:secure_url',
    'og:image:url',
    'og:image',
    'twitter:image',
    'twitter:image:src',
  ]);
  if (rawImage) {
    try {
      result.imageUrl = new URL(rawImage, res.url || url).href;
    } catch {
      /* ignore malformed */
    }
  }
  return result;
}

/**
 * Download a remote image into data/uploads/. Returns the stored basename.
 * Throws (with .status) when the URL is not a usable image.
 */
export async function downloadImage(imageUrl, referer) {
  const headers = { 'User-Agent': UA, Accept: 'image/*' };
  if (referer) headers.Referer = referer;

  let res;
  try {
    res = await fetchWithTimeout(imageUrl, { headers }, 15_000);
  } catch {
    throw Object.assign(new Error('Could not fetch preview image'), { status: 502 });
  }
  if (!res.ok) throw Object.assign(new Error(`Preview image responded ${res.status}`), { status: 502 });

  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!isSupportedImage(type)) {
    throw Object.assign(new Error(`Unsupported preview image type: ${type || 'unknown'}`), { status: 415 });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('Preview image is too large'), { status: 413 });
  }

  const filename = makeFilename(type);
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  return filename;
}
