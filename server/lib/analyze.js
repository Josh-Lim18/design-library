import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  ROOT_DIR,
  UPLOADS_DIR,
  TAG_CATEGORIES,
  SECTIONS,
  STYLES,
  normalizeSection,
  normalizeStyle,
} from '../db.js';

// Vision (API path) accepts base64 images up to ~5 MB each; stay under that.
const MAX_API_IMAGE_BYTES = 4.5 * 1024 * 1024;
// The CLI path streams the file itself, so it can go bigger — but keep it sane.
const MAX_CLI_IMAGE_BYTES = 12 * 1024 * 1024;

// Formats both backends can actually read. SVG / AVIF uploads are skipped.
const SUPPORTED_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Overridable so you can trade cost for depth, or pin a backend.
//   DESIGN_LIBRARY_AI_BACKEND = auto (default) | api | cli | off
//   DESIGN_LIBRARY_AI_MODEL   = e.g. claude-opus-5 (api) / opus|sonnet|haiku (cli)
//   DESIGN_LIBRARY_AI_EFFORT  = low | medium | high | xhigh | max   (api only)
const BACKEND_PREF = (process.env.DESIGN_LIBRARY_AI_BACKEND || 'auto').toLowerCase();
const RAW_MODEL = process.env.DESIGN_LIBRARY_AI_MODEL || '';
// Guard the model string since it is interpolated into a shell command below.
const MODEL = /^[\w.:@-]+$/.test(RAW_MODEL) ? RAW_MODEL : '';
const EFFORT = process.env.DESIGN_LIBRARY_AI_EFFORT || 'low';
const CLI_TIMEOUT_MS = 120_000;

/** One-line hint per category, shared by both backends so tags stay consistent. */
const CATEGORY_HINTS = {
  typography:
    'typeface style & pairing — "geometric sans-serif headings", "serif body copy", "monospace ui labels", "condensed display type"',
  aesthetic:
    'overall style / movement — "neubrutalism", "glassmorphism", "swiss/international", "editorial", "minimalist", "retro-futurist"',
  color:
    'palette — "high-contrast black on white", "muted earth tones", "pastel gradient background", "dark mode", "single lime accent"',
  layout:
    'structure — "asymmetric bento grid", "split-screen hero", "sticky sidebar nav", "full-bleed imagery", "centered single column", "generous whitespace"',
  components:
    'notable UI pieces — "pricing table", "testimonial carousel", "feature cards", "animated marquee", "logo cloud", "bento dashboard"',
  mood: 'tone — "playful", "luxury", "technical", "friendly", "understated"',
  treatment:
    'effects & details — "soft drop shadows", "large rounded corners", "thin hairline borders", "grain texture", "duotone photography", "gradient mesh"',
};

const SECTION_HINT = `which part of a site/app this screenshot shows — exactly one of: ${SECTIONS.join(
  ', '
)}. "landing" = a full marketing/home page top-to-bottom; "hero" = just the top hero band; "body" = an inner content section; "component" = a single UI element in isolation; "nav"/"footer" = just that bar; "pricing"/"dashboard" for those specific screens; "other" if none fit.`;

// Broad aesthetic buckets — pick the single dominant one. Kept deliberately
// coarse so many designs share a bucket, but not so coarse that one bucket
// swallows most of a library.
const STYLE_DEFS = {
  minimal: 'sparse, lots of whitespace, few elements, restrained type and colour, quiet',
  editorial: 'magazine-like — typography and text hierarchy are the design, expressive headlines, often serif, art-directed layout (still counts when a large photo is present)',
  brutalist: 'raw, blocky, very high contrast, exposed structure, deliberately unpolished (incl. neubrutalism)',
  swiss: 'systematic visible grid, tight alignment, functional, helvetica-ish international style',
  corporate: 'polished mainstream product/marketing site, neutral and trustworthy, feature grids + CTAs, no strong stylistic point of view',
  glassy: 'gradients, glassmorphism, glow/aurora, soft shadows — the modern SaaS look',
  playful: 'bright colour, rounded shapes, illustration or 3d blobs, friendly and informal',
  maximalist: 'dense, layered, decorative, more-is-more, competing focal points',
  luxury: 'restrained and elegant, refined spacing and delicate type, fashion / hospitality / premium feel (often photo-led)',
  'dark-tech': 'dark UI, technical or developer-tool aesthetic, monospace, terminal or data vibes',
  'retro-futurist': 'sci-fi, Y2K, aerospace/HUD, chrome, glitch — a future imagined in the past',
  'retro-analog': 'vintage, lo-fi, print-inspired, halftone, risograph, worn texture, 70s–90s nostalgia',
  cinematic: 'ONLY when a photograph or film still IS the design — edge-to-edge imagery, almost no typographic voice, grid, or brand system of its own. If the page has a distinct type treatment, layout system, or brand identity over the image, it is NOT cinematic.',
  other: 'none of the above genuinely fit',
};
const STYLE_HINT = `the single dominant aesthetic. Classify by the design's point of view — its typography, layout, colour, and attitude — NOT by its imagery: a big background photo alone does not decide the bucket, and most photo-heavy pages are actually editorial, luxury, minimal, or dark-tech. Reserve "cinematic" for pages that are essentially just an image. Pick exactly one of:\n${STYLES.map(
  (s) => `  - ${s}: ${STYLE_DEFS[s]}`
).join('\n')}`;

const GUIDANCE = `Given a screenshot of a website or app UI (a landing page, a section, a full screen, a component), pull out its reusable design attributes so they can be pasted as prompt fragments into other design tools later.

Produce:
- "description": 1-2 plain sentences on what the screen is and what it contains.
- "style": ${STYLE_HINT}
- "section": ${SECTION_HINT}
- 2-5 short lowercase tags for each category below — concrete, visually-grounded phrases, never generic words, no leading "#". Return an empty list for a category with no visible evidence.
${TAG_CATEGORIES.map((c) => `- ${c}: ${CATEGORY_HINTS[c]}`).join('\n')}

Do not invent brand or product names beyond what is legible in the image.`;

const facet = () => z.array(z.string());
const AnalysisSchema = z.object({
  description: z.string().describe('1-2 sentences on what the screen is and what it contains.'),
  style: z.string().describe(STYLE_HINT),
  section: z.string().describe(SECTION_HINT),
  typography: facet().describe(CATEGORY_HINTS.typography),
  aesthetic: facet().describe(CATEGORY_HINTS.aesthetic),
  color: facet().describe(CATEGORY_HINTS.color),
  layout: facet().describe(CATEGORY_HINTS.layout),
  components: facet().describe(CATEGORY_HINTS.components),
  mood: facet().describe(CATEGORY_HINTS.mood),
  treatment: facet().describe(CATEGORY_HINTS.treatment),
});

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

let cliChecked = false;
let cliAvailable = false;

/** Is the `claude` CLI installed and runnable? Checked once, then cached. */
function hasClaudeCli() {
  if (cliChecked) return cliAvailable;
  cliChecked = true;
  try {
    // One command string + shell:true so the platform resolves `claude`
    // (a shim on Windows) without the args-with-shell deprecation warning.
    const res = spawnSync('claude --version', { shell: true, timeout: 8000, stdio: 'ignore' });
    cliAvailable = res.status === 0;
  } catch {
    cliAvailable = false;
  }
  return cliAvailable;
}

/** Which backend to use for this run: 'api' | 'cli' | null (disabled/unavailable). */
export function resolveBackend() {
  if (BACKEND_PREF === 'off') return null;
  if (BACKEND_PREF === 'api') return process.env.ANTHROPIC_API_KEY ? 'api' : null;
  if (BACKEND_PREF === 'cli') return hasClaudeCli() ? 'cli' : null;
  // auto: prefer a real API key, fall back to the local CLI.
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  if (hasClaudeCli()) return 'cli';
  return null;
}

/** True when some backend can tag images — the frontend uses this for the toggle. */
export function aiTaggingAvailable() {
  return resolveBackend() !== null;
}

// ---------------------------------------------------------------------------
// Backends — each returns the raw `{ description, <category>: string[], … }` shape
// ---------------------------------------------------------------------------

let client;
function getClient() {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return client;
}

async function analyzeViaApi(absPath, mediaType) {
  const buf = await fs.promises.readFile(absPath);
  if (buf.byteLength > MAX_API_IMAGE_BYTES) return null;

  const response = await getClient().messages.parse({
    model: MODEL || 'claude-opus-5',
    max_tokens: 4000,
    system: `You are a design-analysis assistant for a personal UI/UX inspiration library.\n\n${GUIDANCE}`,
    output_config: { format: zodOutputFormat(AnalysisSchema), effort: EFFORT },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } },
          { type: 'text', text: 'Analyze this UI/design screenshot.' },
        ],
      },
    ],
  });

  return response.parsed_output ?? null;
}

/** Run `claude -p` headlessly, reading the image with its own Read tool. */
function analyzeViaCli(absPath) {
  const relPath = path.relative(ROOT_DIR, absPath).split(path.sep).join('/');
  const shape = [
    '"description": string',
    '"style": string',
    '"section": string',
    ...TAG_CATEGORIES.map((c) => `"${c}": string[]`),
  ].join(', ');
  const prompt = `${GUIDANCE}

Read the image at ${relPath} and respond with ONLY a single-line JSON object of the form { ${shape} }. No prose, no markdown, no code fence.`;

  return new Promise((resolve, reject) => {
    const cmd =
      'claude -p --output-format json --allowed-tools Read' + (MODEL ? ` --model ${MODEL}` : '');
    const child = spawn(cmd, { cwd: ROOT_DIR, shell: true, timeout: CLI_TIMEOUT_MS });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`claude CLI exited ${code}: ${stderr.trim().slice(0, 300)}`));
      }
      try {
        const envelope = JSON.parse(stdout);
        const text = String(envelope.result ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        resolve(JSON.parse(text));
      } catch (e) {
        reject(new Error(`Could not parse claude CLI output: ${e.message}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Flatten the per-category arrays into `[{ name, category }]`, cleaned & de-duped. */
function flattenCategorized(raw) {
  const seen = new Set();
  const out = [];
  for (const category of TAG_CATEGORIES) {
    for (const value of Array.isArray(raw?.[category]) ? raw[category] : []) {
      const name = String(value)
        .trim()
        .toLowerCase()
        .replace(/^#+/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, category });
    }
  }
  return out;
}

/**
 * Analyze an uploaded image. Returns
 * `{ description, style, section, tags: [{ name, category }] }`, or `null` when
 * analysis is unavailable or not applicable (no backend, unsupported format,
 * file too large, empty result). Throws only on an unexpected backend failure —
 * callers treat a throw as "skip tagging, keep the item".
 */
export async function analyzeImage(filename) {
  const backend = resolveBackend();
  if (!backend) return null;

  const ext = path.extname(filename).toLowerCase();
  const mediaType = SUPPORTED_EXT[ext];
  if (!mediaType) return null;

  const abs = path.join(UPLOADS_DIR, path.basename(filename));
  if (!fs.existsSync(abs)) return null;
  if (fs.statSync(abs).size > (backend === 'cli' ? MAX_CLI_IMAGE_BYTES : MAX_API_IMAGE_BYTES)) {
    return null;
  }

  const raw = backend === 'cli' ? await analyzeViaCli(abs) : await analyzeViaApi(abs, mediaType);
  if (!raw) return null;

  const tags = flattenCategorized(raw);
  if (!tags.length) return null;

  return {
    description: raw.description?.trim() || null,
    style: normalizeStyle(raw.style),
    section: normalizeSection(raw.section),
    tags,
  };
}
