// Tag subcategories. Keep in sync with TAG_CATEGORIES in server/db.js.
export const CATEGORY_ORDER = [
  'typography',
  'aesthetic',
  'color',
  'layout',
  'components',
  'mood',
  'treatment',
];

export const CATEGORY_LABELS = {
  typography: 'Typography',
  aesthetic: 'Aesthetic',
  color: 'Colour',
  layout: 'Layout',
  components: 'Components',
  mood: 'Mood',
  treatment: 'Treatment',
};

export const OTHER = 'other';

/**
 * Bucket a list of tag-ish objects by category, in CATEGORY_ORDER, with an
 * "Other" bucket last for anything uncategorised. Empty buckets are dropped.
 * `getCategory` pulls the category string off each item (defaults to `.category`).
 */
export function groupByCategory(tags, getCategory = (t) => t.category) {
  const buckets = new Map([...CATEGORY_ORDER, OTHER].map((c) => [c, []]));
  for (const tag of tags) {
    const cat = getCategory(tag);
    buckets.get(CATEGORY_ORDER.includes(cat) ? cat : OTHER).push(tag);
  }
  return [...buckets.entries()]
    .filter(([, arr]) => arr.length)
    .map(([cat, arr]) => ({
      category: cat,
      label: cat === OTHER ? 'Other' : CATEGORY_LABELS[cat],
      tags: arr,
    }));
}
