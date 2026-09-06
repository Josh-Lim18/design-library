// Re-analyze references via the running server's reanalyze endpoint. By default
// only items missing a style or section; pass --all to redo every item. Start
// the server first:
//
//   node server/index.js            # in one terminal
//   npm run backfill                # in another  (missing only)
//   npm run backfill -- --all       # re-do everything
//
// Set DL_BASE to point at a non-default host/port.
const BASE = process.env.DL_BASE || `http://localhost:${process.env.PORT || 3001}`;
const ALL = process.argv.includes('--all');

const res = await fetch(`${BASE}/api/items`).catch(() => null);
if (!res || !res.ok) {
  console.error(`Could not reach the server at ${BASE}. Is it running?`);
  process.exit(1);
}

const items = await res.json();
const todo = ALL ? items : items.filter((i) => !i.style || !i.section);
console.log(`${todo.length} of ${items.length} reference(s) to analyze${ALL ? ' (--all)' : ''}.\n`);

let n = 0;
for (const it of todo) {
  process.stdout.write(`[${++n}/${todo.length}] #${it.id} ${it.image_path} … `);
  try {
    const r = await fetch(`${BASE}/api/items/${it.id}/reanalyze`, { method: 'POST' });
    const j = await r.json();
    console.log(r.ok ? `${j.style || '—'} / ${j.section || '—'}` : `error: ${j.error}`);
  } catch (e) {
    console.log(`failed: ${e.message}`);
  }
}
console.log('\nDone.');
