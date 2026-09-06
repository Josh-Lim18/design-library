// Broad style buckets. Keep in sync with STYLES in server/db.js.
export const STYLE_ORDER = [
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

export const STYLE_LABELS = {
  minimal: 'Minimal',
  editorial: 'Editorial',
  brutalist: 'Brutalist',
  swiss: 'Swiss / Grid',
  corporate: 'Corporate',
  glassy: 'Glassy / Gradient',
  playful: 'Playful',
  maximalist: 'Maximalist',
  luxury: 'Luxury',
  'dark-tech': 'Dark / Tech',
  'retro-futurist': 'Retro-futurist',
  'retro-analog': 'Retro / Analog',
  cinematic: 'Cinematic',
  other: 'Other',
};

export const styleLabel = (value) => STYLE_LABELS[value] || value || '';
