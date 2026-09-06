// Rebuild data/library.db from the data/library.json text mirror.
// Use this after a git pull if the binary DB conflicted or looks stale:
//   npm run db:rebuild
import fs from 'node:fs';
import { JSON_PATH, rebuildFromSnapshot } from './db.js';
import { writeMirror } from './mirror.js';

if (!fs.existsSync(JSON_PATH)) {
  console.error(`No mirror found at ${JSON_PATH} — nothing to rebuild from.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
rebuildFromSnapshot(data);
writeMirror();

console.log(`Rebuilt library.db from library.json: ${data.items?.length ?? 0} items, ${data.tags?.length ?? 0} tags.`);
