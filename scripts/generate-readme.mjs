#!/usr/bin/env node

import { randomInt } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetRoot = resolve(root, 'assets');
const supported = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

export const README_LOCALES = Object.freeze([
  Object.freeze({
    locale: 'en',
    templatePath: 'templates/README.en.md.tmpl',
    outputPath: 'README.md',
    languageLabel: 'English',
    galleryAlt: 'Kurose Runa opening visual',
  }),
  Object.freeze({
    locale: 'ko',
    templatePath: 'templates/README.ko.md.tmpl',
    outputPath: 'README.ko.md',
    languageLabel: '한국어',
    galleryAlt: '쿠로세 루나 오프닝 이미지',
  }),
  Object.freeze({
    locale: 'ja',
    templatePath: 'templates/README.ja.md.tmpl',
    outputPath: 'README.ja.md',
    languageLabel: '日本語',
    galleryAlt: '黒瀬ルナのオープニング画像',
  }),
  Object.freeze({
    locale: 'zh-Hans',
    templatePath: 'templates/README.zh-Hans.md.tmpl',
    outputPath: 'README.zh-Hans.md',
    languageLabel: '简体中文',
    galleryAlt: '黑濑露娜开场图片',
  }),
  Object.freeze({
    locale: 'zh-Hant',
    templatePath: 'templates/README.zh-Hant.md.tmpl',
    outputPath: 'README.zh-Hant.md',
    languageLabel: '繁體中文',
    galleryAlt: '黑瀨露娜開場圖片',
  }),
]);

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

export function validateLocales(locales) {
  if (!Array.isArray(locales) || !locales.length) throw new Error('README locales must not be empty');
  const localeNames = new Set();
  const outputPaths = new Set();
  for (const locale of locales) {
    for (const field of ['locale', 'templatePath', 'outputPath', 'languageLabel', 'galleryAlt']) {
      if (typeof locale?.[field] !== 'string' || !locale[field]) {
        throw new Error(`README locale is missing ${field}`);
      }
    }
    if (localeNames.has(locale.locale)) throw new Error(`duplicate README locale: ${locale.locale}`);
    if (outputPaths.has(locale.outputPath)) throw new Error(`duplicate README output: ${locale.outputPath}`);
    localeNames.add(locale.locale);
    outputPaths.add(locale.outputPath);
  }
  return locales;
}

export function renderGallery(assets, { columns = 2, altPrefix = 'Kurose Runa opening visual' } = {}) {
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
        `      <a href="${safeAsset}"><img src="${safeAsset}" alt="${escapeHtml(altPrefix)} ${safeName}" width="100%" /></a>`,
        `      <br /><code>${safeName}</code>`,
        '    </td>',
      ].join('\n');
    });
    while (cells.length < columns) cells.push('    <td></td>');
    rows.push(['  <tr>', ...cells, '  </tr>'].join('\n'));
  }
  return ['<table>', ...rows, '</table>'].join('\n');
}

export function renderReadme(template, heroImage, assets, locale = README_LOCALES[0]) {
  if (!template.includes('{{HERO_IMAGE}}')) throw new Error('README template lacks HERO_IMAGE');
  if (!template.includes('{{IMAGE_GALLERY}}')) throw new Error('README template lacks IMAGE_GALLERY');
  if (!template.includes('{{ASSET_COUNT}}')) throw new Error('README template lacks ASSET_COUNT');
  return template
    .replaceAll('{{HERO_IMAGE}}', heroImage)
    .replaceAll('{{IMAGE_GALLERY}}', renderGallery(assets, { altPrefix: locale.galleryAlt }))
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

export function findStaleOutputs(existingByPath, renderedByPath) {
  return Object.entries(renderedByPath)
    .filter(([outputPath, rendered]) => existingByPath[outputPath] !== rendered)
    .map(([outputPath]) => outputPath);
}

export async function generateReadme(argv = process.argv.slice(2), locales = README_LOCALES) {
  const options = parseArgs(argv);
  if (options.help) return { ok: true, help: true };
  validateLocales(locales);
  const [assets, localeFiles] = await Promise.all([
    collectAssets(),
    Promise.all(locales.map(async (locale) => {
      const [template, existing] = await Promise.all([
        readFile(resolve(root, locale.templatePath), 'utf8'),
        readFile(resolve(root, locale.outputPath), 'utf8')
          .catch((error) => error?.code === 'ENOENT' ? '' : Promise.reject(error)),
      ]);
      return { locale, template, existing };
    })),
  ]);
  const heroImage = selectHero({
    assets,
    current: localeFiles.map(({ existing }) => currentHero(existing)).find(Boolean) ?? null,
    requested: options.image,
    random: options.random,
  });
  const existingByPath = Object.fromEntries(
    localeFiles.map(({ locale, existing }) => [locale.outputPath, existing]),
  );
  const renderedByPath = Object.fromEntries(
    localeFiles.map(({ locale, template }) => [
      locale.outputPath,
      renderReadme(template, heroImage, assets, locale),
    ]),
  );
  const outputs = locales.map(({ locale, outputPath }) => ({ locale, outputPath }));
  if (options.check) {
    const staleOutputs = findStaleOutputs(existingByPath, renderedByPath);
    if (staleOutputs.length) {
      throw new Error(`README outputs are stale: ${staleOutputs.join(', ')}; run pnpm run readme`);
    }
    return { ok: true, mode: 'check', heroImage, assetCount: assets.length, outputs };
  }
  await Promise.all(outputs.map(({ outputPath }) => (
    writeFile(resolve(root, outputPath), renderedByPath[outputPath], 'utf8')
  )));
  return { ok: true, mode: 'write', heroImage, assetCount: assets.length, outputs };
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
      : `README ${result.mode}: ${result.heroImage} (${result.assetCount} assets, ${result.outputs.length} locales)\n`);
  } catch (error) {
    const result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    process.stderr.write(wantsJson ? `${JSON.stringify(result)}\n` : `${result.message}\n`);
    process.exitCode = 1;
  }
}
