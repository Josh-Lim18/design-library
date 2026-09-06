import fs from 'node:fs';
import { JSON_PATH, snapshot } from './db.js';

/**
 * Rewrite data/library.json from the current DB state.
 * Called after every mutating request so the text mirror stays in sync and the
 * DB can be rebuilt from it (see server/rebuild.js) when the binary file
 * conflicts across machines.
 */
export function writeMirror() {
  try {
    fs.writeFileSync(JSON_PATH, JSON.stringify(snapshot(), null, 2) + '\n');
  } catch (err) {
    console.error('Failed to write library.json mirror:', err);
  }
}
