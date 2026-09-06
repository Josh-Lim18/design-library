// Screen-section vocabulary. Keep in sync with SECTIONS in server/db.js.
export const SECTION_ORDER = [
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

export const SECTION_LABELS = {
  landing: 'Landing',
  hero: 'Hero',
  body: 'Body',
  component: 'Component',
  nav: 'Nav',
  footer: 'Footer',
  pricing: 'Pricing',
  dashboard: 'Dashboard',
  other: 'Other',
};

export const sectionLabel = (value) => SECTION_LABELS[value] || value || '';
