// The fixed vocabularies the library classifies against, plus the coercion
// helpers that turn arbitrary input (a form field, a value from the image
// analyzer) into a valid member or null. No side effects — safe to import
// anywhere, including from tests.

/** Coarse subcategories a tag can be filed under. NULL = uncategorised. */
export const TAG_CATEGORIES = [
  'typography',
  'aesthetic',
  'color',
  'layout',
  'components',
  'mood',
  'treatment',
];

/** Allowed values for items.section, in display order. NULL = not yet analyzed. */
export const SECTIONS = [
  'landing',
  'hero',
  'body',
  'component',
  'nav',
  'footer',
  'pricing',
  'dashboard',
  'other',
];

/**
 * Allowed values for items.style — broad aesthetic buckets, in display order.
 * Deliberately coarse so many designs fall under each. NULL = not yet analyzed.
 */
export const STYLES = [
  'minimal',
  'editorial',
  'brutalist',
  'swiss',
  'corporate',
  'glassy',
  'playful',
  'maximalist',
  'luxury',
  'dark-tech',
  'retro-futurist',
  'retro-analog',
  'cinematic',
  'other',
];

/** Coerce an arbitrary value to a valid section, or null. */
export function normalizeSection(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return SECTIONS.includes(s) ? s : null;
}

/** Coerce an arbitrary value to a valid style, or null. */
export function normalizeStyle(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return STYLES.includes(s) ? s : null;
}

/**
 * Flatten the analyzer's per-category string arrays into `[{ name, category }]`,
 * cleaned (trimmed, lowercased, leading "#" stripped, inner whitespace
 * collapsed), blanks dropped, and de-duped by name across all categories.
 * Unknown keys on `raw` are ignored, so junk from the analyzer can't leak in.
 */
export function flattenCategorized(raw) {
  const seen = new Set();
  const out = [];
  for (const category of TAG_CATEGORIES) {
    for (const value of Array.isArray(raw?.[category]) ? raw[category] : []) {
      const name = String(value)
        .trim()
        .toLowerCase()
        .replace(/^#+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, category });
    }
  }
  return out;
}
