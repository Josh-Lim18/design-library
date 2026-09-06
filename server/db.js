import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'library.db');
export const JSON_PATH = path.join(DATA_DIR, 'library.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// Run each migration file once, tracked in schema_migrations. (001 predates this
// table and is written with IF NOT EXISTS, so re-running it on the first boot
// after this change is harmless; later files needn't be idempotent.)
db.exec(
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     name TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`
);
const migrationsDir = path.join(__dirname, 'migrations');
const appliedMigrations = new Set(
  db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
);
const recordMigration = db.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)');
for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  if (appliedMigrations.has(file)) continue;
  db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  recordMigration.run(file);
}

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

/** Coerce an arbitrary value to a valid section, or null. */
export function normalizeSection(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return SECTIONS.includes(s) ? s : null;
}

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

/** Coerce an arbitrary value to a valid style, or null. */
export function normalizeStyle(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return STYLES.includes(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

/** Normalize a raw list of tag strings: trim, collapse spaces, drop blanks, de-dupe. */
export function normalizeTagNames(names) {
  const seen = new Set();
  const out = [];
  for (const raw of names ?? []) {
    const name = String(raw).trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

const insertTagStmt = db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
const findTagStmt = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');

function upsertTags(names) {
  const ids = [];
  for (const name of normalizeTagNames(names)) {
    insertTagStmt.run(name);
    ids.push(findTagStmt.get(name).id);
  }
  return ids;
}

function setItemTags(itemId, names) {
  db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
  const link = db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)');
  for (const tagId of upsertTags(names)) link.run(itemId, tagId);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const TAG_SEP = String.fromCharCode(31); // ASCII unit separator — never appears in tag text

function rowToItem(row) {
  return {
    id: row.id,
    image_path: row.image_path,
    source_url: row.source_url,
    description: row.description,
    section: row.section ?? null,
    style: row.style ?? null,
    created_at: row.created_at,
    tags: row.tags ? row.tags.split(TAG_SEP).sort((a, b) => a.localeCompare(b)) : [],
  };
}

const ITEM_SELECT = `
  SELECT i.*, (
    SELECT group_concat(t.name, char(31))
    FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = i.id
  ) AS tags
  FROM items i
`;

export function getItems({ tags = [], mode = 'or', q = '', section = '', style = '' } = {}) {
  const names = normalizeTagNames(tags);
  const clauses = [];
  const params = [];

  const sectionFilter = normalizeSection(section);
  if (sectionFilter) {
    clauses.push('i.section = ?');
    params.push(sectionFilter);
  }

  const styleFilter = normalizeStyle(style);
  if (styleFilter) {
    clauses.push('i.style = ?');
    params.push(styleFilter);
  }

  if (names.length) {
    const placeholders = names.map(() => '?').join(', ');
    if (mode === 'and') {
      clauses.push(`i.id IN (
        SELECT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id
        WHERE t.name IN (${placeholders}) COLLATE NOCASE
        GROUP BY it.item_id HAVING COUNT(DISTINCT t.id) = ?
      )`);
      params.push(...names, names.length);
    } else {
      clauses.push(`i.id IN (
        SELECT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id
        WHERE t.name IN (${placeholders}) COLLATE NOCASE
      )`);
      params.push(...names);
    }
  }

  const term = String(q).trim();
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    clauses.push(`(
      i.description LIKE ? ESCAPE '\\'
      OR i.id IN (
        SELECT it.item_id FROM item_tags it JOIN tags t ON t.id = it.tag_id
        WHERE t.name LIKE ? ESCAPE '\\'
      )
    )`);
    params.push(like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `${ITEM_SELECT} ${where} ORDER BY i.created_at DESC, i.id DESC`;
  return db.prepare(sql).all(...params).map(rowToItem);
}

export function getItem(id) {
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
  return row ? rowToItem(row) : null;
}

export function createItem({
  image_path,
  source_url = null,
  description = null,
  section = null,
  style = null,
  tags = [],
  created_at = null,
}) {
  if (!image_path) throw Object.assign(new Error('image_path is required'), { status: 400 });
  const cols = ['image_path', 'source_url', 'description', 'section', 'style'];
  const vals = [
    image_path,
    source_url || null,
    description || null,
    normalizeSection(section),
    normalizeStyle(style),
  ];
  if (created_at) {
    cols.push('created_at');
    vals.push(created_at);
  }
  const info = db
    .prepare(`INSERT INTO items (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...vals);
  setItemTags(Number(info.lastInsertRowid), tags);
  return getItem(Number(info.lastInsertRowid));
}

export function updateItem(id, { source_url, description, section, style, tags }) {
  const existing = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!existing) return null;
  const sets = [];
  const params = [];
  if (source_url !== undefined) { sets.push('source_url = ?'); params.push(source_url || null); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description || null); }
  if (section !== undefined) { sets.push('section = ?'); params.push(normalizeSection(section)); }
  if (style !== undefined) { sets.push('style = ?'); params.push(normalizeStyle(style)); }
  if (sets.length) db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  if (tags !== undefined) setItemTags(id, tags);
  pruneOrphanTags();
  return getItem(id);
}

export function deleteItem(id) {
  const row = db.prepare('SELECT image_path FROM items WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  pruneOrphanTags();
  return row.image_path;
}

// ---------------------------------------------------------------------------
// Tags (management)
// ---------------------------------------------------------------------------

export function listTags() {
  return db.prepare(`
    SELECT t.id, t.name, t.category, COUNT(it.item_id) AS count
    FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE
  `).all();
}

const setCategoryByNameStmt = db.prepare(
  'UPDATE tags SET category = ? WHERE name = ? COLLATE NOCASE'
);

/**
 * Set the category on existing tag rows, matched by name. Accepts
 * `[{ name, category }]`; entries with an unknown category are ignored, so a
 * bad value from the analyzer can never corrupt the column.
 */
export function setTagCategories(pairs) {
  for (const { name, category } of pairs ?? []) {
    if (!name || !TAG_CATEGORIES.includes(category)) continue;
    setCategoryByNameStmt.run(category, String(name));
  }
}

/** Set (or clear, with a falsy/invalid value) one tag's category by id. */
export function setTagCategory(id, category) {
  const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(id);
  if (!tag) return null;
  const cat = TAG_CATEGORIES.includes(category) ? category : null;
  db.prepare('UPDATE tags SET category = ? WHERE id = ?').run(cat, id);
  return db.prepare('SELECT id, name, category FROM tags WHERE id = ?').get(id);
}

export function renameTag(id, rawName) {
  const [name] = normalizeTagNames([rawName]);
  if (!name) throw Object.assign(new Error('Tag name cannot be empty'), { status: 400 });
  const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(id);
  if (!tag) return null;
  const collision = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
  if (collision) return mergeTag(id, collision.id); // rename onto existing == merge
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id);
  return db.prepare('SELECT id, name FROM tags WHERE id = ?').get(id);
}

export function mergeTag(id, intoId) {
  if (Number(id) === Number(intoId)) throw Object.assign(new Error('Cannot merge a tag into itself'), { status: 400 });
  const src = db.prepare('SELECT id FROM tags WHERE id = ?').get(id);
  const dst = db.prepare('SELECT id, name FROM tags WHERE id = ?').get(intoId);
  if (!src || !dst) return null;
  db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT item_id, ? FROM item_tags WHERE tag_id = ?').run(intoId, id);
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  return dst;
}

export function deleteTag(id) {
  const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(id);
  if (!tag) return null;
  db.prepare('DELETE FROM tags WHERE id = ?').run(id); // item_tags rows cascade
  return true;
}

/** Drop tags no longer attached to any item. */
export function pruneOrphanTags() {
  db.exec('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM item_tags)');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** The sections actually in use, with item counts, ordered by SECTIONS. */
export function listSections() {
  const rows = db
    .prepare(
      `SELECT section AS value, COUNT(*) AS count
       FROM items WHERE section IS NOT NULL
       GROUP BY section`
    )
    .all();
  return rows.sort((a, b) => SECTIONS.indexOf(a.value) - SECTIONS.indexOf(b.value));
}

/** The style buckets actually in use, with item counts, ordered by STYLES. */
export function listStyles() {
  const rows = db
    .prepare(
      `SELECT style AS value, COUNT(*) AS count
       FROM items WHERE style IS NOT NULL
       GROUP BY style`
    )
    .all();
  return rows.sort((a, b) => STYLES.indexOf(a.value) - STYLES.indexOf(b.value));
}

// ---------------------------------------------------------------------------
// JSON mirror / rebuild
// ---------------------------------------------------------------------------

export function snapshot() {
  return {
    version: 4,
    exported_at: new Date().toISOString(),
    items: getItems().map((it) => ({
      image_path: it.image_path,
      source_url: it.source_url,
      description: it.description,
      section: it.section,
      style: it.style,
      created_at: it.created_at,
      tags: it.tags,
    })),
    // Plain string when uncategorised (keeps the mirror diff-friendly), object
    // once a category is attached.
    tags: listTags().map((t) => (t.category ? { name: t.name, category: t.category } : t.name)),
  };
}

export function rebuildFromSnapshot(data) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DELETE FROM item_tags; DELETE FROM tags; DELETE FROM items;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('items', 'tags')");
  db.exec('PRAGMA foreign_keys = ON');
  // Snapshots list newest-first; insert oldest-first so ids track creation order.
  const ordered = [...(data.items ?? [])].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
  for (const it of ordered) {
    createItem({
      image_path: it.image_path,
      source_url: it.source_url,
      description: it.description,
      section: it.section,
      style: it.style,
      tags: it.tags,
      created_at: it.created_at,
    });
  }
  for (const entry of data.tags ?? []) {
    const name = typeof entry === 'string' ? entry : entry.name;
    if (!name) continue;
    upsertTags([name]);
    if (entry && typeof entry === 'object' && entry.category) {
      setTagCategories([{ name, category: entry.category }]);
    }
  }
}
