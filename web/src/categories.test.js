import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByCategory } from './categories.js';

const names = (groups) => groups.map((g) => [g.category, g.label, g.tags.map((t) => t.name)]);

test('groups by category in CATEGORY_ORDER regardless of input order', () => {
  const tags = [
    { name: 'grain texture', category: 'treatment' },
    { name: 'geometric sans', category: 'typography' },
    { name: 'lime accent', category: 'color' },
  ];
  assert.deepEqual(names(groupByCategory(tags)), [
    ['typography', 'Typography', ['geometric sans']],
    ['color', 'Colour', ['lime accent']],
    ['treatment', 'Treatment', ['grain texture']],
  ]);
});

test('empty categories are dropped, not rendered', () => {
  const groups = groupByCategory([{ name: 'a', category: 'mood' }]);
  assert.deepEqual(
    groups.map((g) => g.category),
    ['mood']
  );
});

test('uncategorised tags fall into an "Other" bucket placed last', () => {
  const tags = [
    { name: 'unfiled', category: null },
    { name: 'bento grid', category: 'layout' },
    { name: 'made up', category: 'not-a-real-category' },
    { name: 'also unfiled' },
  ];
  const groups = groupByCategory(tags);
  assert.deepEqual(groups.at(-1), {
    category: 'other',
    label: 'Other',
    tags: [{ name: 'unfiled', category: null }, { name: 'made up', category: 'not-a-real-category' }, { name: 'also unfiled' }],
  });
  assert.deepEqual(
    groups.map((g) => g.category),
    ['layout', 'other']
  );
});

test('accepts a custom category accessor and keeps the original tag values', () => {
  const lookup = { 'serif body': 'typography', 'muted palette': 'color' };
  const groups = groupByCategory(['muted palette', 'serif body'], (name) => lookup[name]);
  assert.deepEqual(groups, [
    { category: 'typography', label: 'Typography', tags: ['serif body'] },
    { category: 'color', label: 'Colour', tags: ['muted palette'] },
  ]);
});

test('returns an empty array for no tags', () => {
  assert.deepEqual(groupByCategory([]), []);
});
