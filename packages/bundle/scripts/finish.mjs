#!/usr/bin/env node
/**
 * After `vite build`: copy the fonts and the loader next to the bundle, and write a manifest with sizes and hashes —
 * the entry, its chunks (what every page loads, and what a page fetches on demand), the loader and the fonts. The
 * manifest's `build` stamp names the folder the integration serves the build from, so any changed byte changes the
 * URL. The budget holds for what every page loads: the entry and the chunks it imports statically. Last, every text
 * file gets the compressed sidecars Home Assistant sends in its place (`sidecars.mjs`).
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { isSidecar, pack, SIDECARS, travelsCompressed } from './sidecars.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// the build lives inside the integration, which serves it: custom_components/fluvy/frontend
const dist = join(root, '..', '..', 'custom_components', 'fluvy', 'frontend');
const fonts = join(root, '..', 'fonts', 'files');
// Fluvy's one version: the root package.json's
const { version } = JSON.parse(await readFile(join(root, '..', '..', 'package.json'), 'utf8'));

await mkdir(join(dist, 'fonts'), { recursive: true });
for (const file of [
  'inter-variable.woff2',
  'inter-italic-variable.woff2',
  'inter-cyrillic-variable.woff2',
  'inter-italic-cyrillic-variable.woff2',
  'OFL-Inter.txt',
])
  await cp(join(fonts, file), join(dist, 'fonts', file));
// the module Home Assistant loads on every page: it imports the build beside it (see src/loader.js)
await cp(join(root, 'src', 'loader.js'), join(dist, 'loader.js'));

const chunks = (await readdir(join(dist, 'chunks')))
  .filter((f) => !isSidecar(f))
  .map((f) => `chunks/${f}`);
const files = {};
for (const name of [
  'fluvy.js',
  ...chunks,
  'loader.js',
  ...(await readdir(join(dist, 'fonts'))).map((f) => `fonts/${f}`),
]) {
  const data = await readFile(join(dist, name));
  files[name] = {
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    ...(name.endsWith('.js') ? { gzip: gzipSync(data).length } : {}),
  };
}
const build = createHash('sha256')
  .update(
    Object.keys(files)
      .sort()
      .map((name) => `${name} ${files[name].sha256}\n`)
      .join(''),
  )
  .digest('hex')
  .slice(0, 8);
await writeFile(
  join(dist, 'manifest.json'),
  `${JSON.stringify({ name: 'fluvy', version, build, files }, null, 2)}\n`,
);

/** The chunks a file imports statically (`from"./chunks/…"`, `from"./…"` inside a chunk). */
const statics = async (name) => {
  const code = await readFile(join(dist, name), 'utf8');
  const base = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
  return [...code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => `${base}${m[1]}`);
};
const initial = new Set(['fluvy.js']);
for (const name of initial) for (const next of await statics(name)) initial.add(next);
const gzip = (names) => [...names].reduce((sum, name) => sum + files[name].gzip, 0);
const onDemand = chunks.filter((name) => !initial.has(name));
// page controls live in the chunks a page fetches, the cards' editor in the one the card editor fetches: one of
// them in what every dashboard loads is a leak (the energy cards read the Energy dashboard's preferences themselves)
const NEVER_INITIAL = [
  'fluvy-select',
  'fluvy-time-field',
  'fluvy-panel',
  'fluvy-wall-corner',
  'fluvy-wall-back',
  'fluvy-keypad',
  'fluvy-rows-editor',
  'fluvy-schedule-sheet',
  'fluvy-alerts-sheet',
];
// a family's English travels with its chunk (`core/src/i18n/locales/en/<part>.json`, registered as the chunk lands):
// one of its words in what every dashboard loads means core kept the part (its family's group in `groups.mjs` no
// longer names it). Each part is watched by its longest plain phrase that core's own English never says
const english = join(root, '..', 'core', 'src', 'i18n', 'locales', 'en');
const coreWords = await readFile(join(english, 'core.json'), 'utf8');
const parts = (await readdir(english)).filter((f) => f.endsWith('.json') && f !== 'core.json');
const SENTINELS = [];
for (const part of parts) {
  const tables = JSON.parse(await readFile(join(english, part), 'utf8'));
  const [sentinel] = Object.values(tables)
    .flatMap((table) => Object.values(table))
    .filter((text) => /^[\w ,.]+$/.test(text) && !coreWords.includes(text))
    .sort((a, b) => b.length - a.length);
  if (sentinel) SENTINELS.push([part, sentinel]);
}
for (const name of initial) {
  const code = await readFile(join(dist, name), 'utf8');
  const leaked = NEVER_INITIAL.find(
    (tag) => code.includes(`"${tag}"`) || code.includes(`'${tag}'`),
  );
  if (leaked) {
    console.error(
      `${name} carries ${leaked}: a page control leaked into what every dashboard loads`,
    );
    process.exit(1);
  }
  const words = SENTINELS.find(([, sentinel]) => code.includes(sentinel));
  if (words) {
    console.error(
      `${name} carries "${words[1]}" (locales/en/${words[0]}): a family's English leaked into what every dashboard loads`,
    );
    process.exit(1);
  }
}
// 236 KB since 1.9 (the head as the card's button, the grey ladder, the value row, empty lists, the room's contents,
// the appliances' announcement and icons, heights read from the house, the judges' fixes; the lazy families' English
// left core first, about 9 KB): 224 KB in 1.8, 222 KB in 1.7, 220 before
// Local builds carry a few extra bytes over upstream's line (the light-card domain split and the
// reading names): 240 KB while we carry the patches, back to 236 KB before any upstream PR.
const BUDGET = 240 * 1024;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(
  `Fluvy v${version} · build ${build} · every page ${kb(gzip(initial))} gzip (budget ${BUDGET / 1024} KB: ${[...initial].join(' + ')})`,
);
for (const name of onDemand) console.log(`  on demand · ${name} · ${kb(files[name].gzip)} gzip`);
if (gzip(initial) > BUDGET) {
  console.error('bundle is over its gzip budget');
  process.exit(1);
}

// what Home Assistant sends in their place (#134): a `.br` and a `.gz` beside every text file over 1 KB, the manifest's
// too; never in the manifest nor the build stamp (made of the files, they change only with them)
const shipped = (await readdir(dist, { recursive: true, withFileTypes: true })).filter(
  (entry) => entry.isFile() && !isSidecar(entry.name),
);
const sent = { files: 0, bytes: 0, '.br': 0, '.gz': 0 };
await Promise.all(
  shipped.map(async (entry) => {
    const path = join(entry.parentPath, entry.name);
    const data = await readFile(path);
    if (!travelsCompressed(entry.name, data.length)) return;
    const packed = await pack(data);
    sent.files++;
    sent.bytes += data.length;
    for (const suffix of SIDECARS) {
      sent[suffix] += packed[suffix].length;
      await writeFile(`${path}${suffix}`, packed[suffix]);
    }
  }),
);
console.log(
  `  sent compressed · ${sent.files} files · ${kb(sent.bytes)} as ${kb(sent['.br'])} brotli, ${kb(sent['.gz'])} gzip`,
);
