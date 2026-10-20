import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTIONS,
  STYLES,
  normalizeSection,
  normalizeStyle,
  flattenCategorized,
} from './vocab.js';

test('normalizeSection accepts every known section verbatim', () => {
  for (const s of SECTIONS) assert.equal(normalizeSection(s), s);
});

test('normalizeSection trims and lowercases before matching', () => {
  assert.equal(normalizeSection('  HERO '), 'hero');
  assert.equal(normalizeSection('Landing'), 'landing');
});

test('normalizeSection returns null for anything not in the list', () => {
  for (const bad of ['', '   ', 'homepage', 'hero section', null, undefined, 42, {}]) {
    assert.equal(normalizeSection(bad), null);
  }
});

test('normalizeStyle accepts every known style, including hyphenated ones', () => {
  for (const s of STYLES) assert.equal(normalizeStyle(s), s);
  assert.equal(normalizeStyle(' Dark-Tech '), 'dark-tech');
});

test('normalizeStyle returns null for unknown or empty input', () => {
  for (const bad of ['', 'vaporwave', 'minimal ish', null, undefined, 0]) {
    assert.equal(normalizeStyle(bad), null);
  }
});

test('flattenCategorized cleans, tags with category, and preserves category order', () => {
  const out = flattenCategorized({
    mood: ['Luxury', '  Serene  '],
    typography: ['#Serif Display'],
  });
  assert.deepEqual(out, [
    { name: 'serif display', category: 'typography' },
    { name: 'luxury', category: 'mood' },
    { name: 'serene', category: 'mood' },
  ]);
});

test('flattenCategorized strips leading # and collapses inner whitespace', () => {
  const out = flattenCategorized({ color: ['##  Deep   Navy  '] });
  assert.deepEqual(out, [{ name: 'deep navy', category: 'color' }]);
});

test('flattenCategorized de-dupes by name across categories, keeping the first', () => {
  const out = flattenCategorized({
    aesthetic: ['editorial'],
    mood: ['editorial', 'refined'],
  });
  assert.deepEqual(out, [
    { name: 'editorial', category: 'aesthetic' },
    { name: 'refined', category: 'mood' },
  ]);
});

test('flattenCategorized drops blanks and ignores unknown / non-array keys', () => {
  const out = flattenCategorized({
    layout: ['', '   ', 'split-screen hero'],
    bogus: ['should not appear'],
    mood: 'not-an-array',
  });
  assert.deepEqual(out, [{ name: 'split-screen hero', category: 'layout' }]);
});

test('flattenCategorized tolerates null / undefined / non-object input', () => {
  for (const bad of [null, undefined, 'nope', 7]) {
    assert.deepEqual(flattenCategorized(bad), []);
  }
});
