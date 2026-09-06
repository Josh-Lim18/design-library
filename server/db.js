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

// Migrations are idempotent (IF NOT EXISTS); just run them all on boot.
const migrationsDir = path.join(__dirname, 'migrations');
for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
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

export function getItems({ tags = [], mode = 'or', q = '' } = {}) {
  const names = normalizeTagNames(tags);
  const clauses = [];
  const params = [];

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

export function createItem({ image_path, source_url = null, description = null, tags = [], created_at = null }) {
  if (!image_path) throw Object.assign(new Error('image_path is required'), { status: 400 });
  let id;
  if (created_at) {
    const info = db
      .prepare('INSERT INTO items (image_path, source_url, description, created_at) VALUES (?, ?, ?, ?)')
      .run(image_path, source_url || null, description || null, created_at);
    id = Number(info.lastInsertRowid);
  } else {
    const info = db
      .prepare('INSERT INTO items (image_path, source_url, description) VALUES (?, ?, ?)')
      .run(image_path, source_url || null, description || null);
    id = Number(info.lastInsertRowid);
  }
  setItemTags(id, tags);
  return getItem(id);
}

export function updateItem(id, { source_url, description, tags }) {
  const existing = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!existing) return null;
  const sets = [];
  const params = [];
  if (source_url !== undefined) { sets.push('source_url = ?'); params.push(source_url || null); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description || null); }
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
    SELECT t.id, t.name, COUNT(it.item_id) AS count
    FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.name COLLATE NOCASE
  `).all();
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
// JSON mirror / rebuild
// ---------------------------------------------------------------------------

export function snapshot() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    items: getItems().map((it) => ({
      image_path: it.image_path,
      source_url: it.source_url,
      description: it.description,
      created_at: it.created_at,
      tags: it.tags,
    })),
    tags: listTags().map((t) => t.name),
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
      tags: it.tags,
      created_at: it.created_at,
    });
  }
  for (const name of data.tags ?? []) upsertTags([typeof name === 'string' ? name : name.name]);
}
