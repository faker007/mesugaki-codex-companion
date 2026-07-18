#!/usr/bin/env node

import { randomInt } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const templatePath = resolve(root, 'templates/README.md.tmpl');
const readmePath = resolve(root, 'README.md');
const assetRoot = resolve(root, 'assets');
const supported = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

function parseArgs(argv) {
  const options = { check: false, random: false, image: null, json: false };
  for (const raw of argv) {
    if (raw === '--check') options.check = true;
    else if (raw === '--random') options.random = true;
    else if (raw === '--json') options.json = true;
    else if (raw.startsWith('--image=')) options.image = raw.slice('--image='.length);
    else if (raw === '--help') options.help = true;
    else throw new Error(`unknown option: ${raw}`);
  }
  if (options.check && (options.random || options.image)) {
    throw new Error('--check cannot be combined with --random or --image');
  }
  if (options.random && options.image) throw new Error('--random and --image cannot be combined');
  return options;
}

async function collectAssets(directory = assetRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) assets.push(...await collectAssets(path));
    else {
      const extension = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      if (supported.has(extension)) assets.push(relative(root, path).split(sep).join('/'));
    }
  }
  return assets.sort();
}

export function currentHero(readme) {
  return readme.match(/<!-- hero-image: ([^\n]+) -->/)?.[1] ?? null;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderGallery(assets, columns = 2) {
  if (!Number.isInteger(columns) || columns < 1) throw new Error('gallery columns must be a positive integer');
  if (!assets.length) throw new Error('README gallery requires at least one image');
  const cellWidth = `${Math.floor(100 / columns)}%`;
  const rows = [];
  for (let index = 0; index < assets.length; index += columns) {
    const cells = assets.slice(index, index + columns).map((asset) => {
      const safeAsset = escapeHtml(asset);
      const fileName = asset.split('/').at(-1);
      const safeName = escapeHtml(fileName);
      return [
        `    <td align="center" width="${cellWidth}">`,
        `      <a href="${safeAsset}"><img src="${safeAsset}" alt="쿠로세 루나 오프닝 이미지 ${safeName}" width="100%" /></a>`,
        `      <br /><code>${safeName}</code>`,
        '    </td>',
      ].join('\n');
    });
    while (cells.length < columns) cells.push('    <td></td>');
    rows.push(['  <tr>', ...cells, '  </tr>'].join('\n'));
  }
  return ['<table>', ...rows, '</table>'].join('\n');
}

export function renderReadme(template, heroImage, assets) {
  if (!template.includes('{{HERO_IMAGE}}')) throw new Error('README template lacks HERO_IMAGE');
  if (!template.includes('{{IMAGE_GALLERY}}')) throw new Error('README template lacks IMAGE_GALLERY');
  if (!template.includes('{{ASSET_COUNT}}')) throw new Error('README template lacks ASSET_COUNT');
  return template
    .replaceAll('{{HERO_IMAGE}}', heroImage)
    .replaceAll('{{IMAGE_GALLERY}}', renderGallery(assets))
    .replaceAll('{{ASSET_COUNT}}', String(assets.length));
}

export function selectHero({ assets, current, requested, random }) {
  if (!assets.length) throw new Error('no supported README images found in assets');
  if (requested) {
    const normalized = requested.startsWith('assets/') ? requested : `assets/${requested}`;
    if (!assets.includes(normalized)) throw new Error(`README image does not exist: ${normalized}`);
    return normalized;
  }
  if (random) {
    const candidates = assets.filter((asset) => asset !== current);
    return candidates.length ? candidates[randomInt(candidates.length)] : assets[0];
  }
  return current && assets.includes(current) ? current : assets[0];
}

export async function generateReadme(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return { ok: true, help: true };
  const [template, assets, existing] = await Promise.all([
    readFile(templatePath, 'utf8'),
    collectAssets(),
    readFile(readmePath, 'utf8').catch((error) => error?.code === 'ENOENT' ? '' : Promise.reject(error)),
  ]);
  const heroImage = selectHero({
    assets,
    current: currentHero(existing),
    requested: options.image,
    random: options.random,
  });
  const rendered = renderReadme(template, heroImage, assets);
  if (options.check) {
    if (existing !== rendered) throw new Error('README.md is stale; run pnpm run readme');
    return { ok: true, mode: 'check', heroImage, assetCount: assets.length };
  }
  await writeFile(readmePath, rendered, 'utf8');
  return { ok: true, mode: 'write', heroImage, assetCount: assets.length };
}

function helpText() {
  return 'generate-readme: [--check] [--random | --image=<asset>] [--json]\n';
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const wantsJson = process.argv.includes('--json');
  try {
    const result = await generateReadme();
    if (result.help) process.stdout.write(helpText());
    else process.stdout.write(wantsJson
      ? `${JSON.stringify(result, null, 2)}\n`
      : `README ${result.mode}: ${result.heroImage} (${result.assetCount} assets)\n`);
  } catch (error) {
    const result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    process.stderr.write(wantsJson ? `${JSON.stringify(result)}\n` : `${result.message}\n`);
    process.exitCode = 1;
  }
}
