import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  README_LOCALES,
  currentHero,
  findStaleOutputs,
  renderGallery,
  renderReadme,
  selectHero,
  validateLocales,
} from './generate-readme.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('README rendering keeps repository-relative hero and gallery paths', () => {
  const assets = [
    'assets/kurose-runa-opening-01.png',
    'assets/kurose-runa-opening-02.png',
  ];
  const rendered = renderReadme(
    '<!-- hero-image: {{HERO_IMAGE}} -->\n<img src="{{HERO_IMAGE}}" />\n{{IMAGE_GALLERY}}\n{{ASSET_COUNT}} assets\n',
    assets[0],
    assets,
  );
  assert.equal(currentHero(rendered), 'assets/kurose-runa-opening-01.png');
  assert.match(rendered, /src="assets\/kurose-runa-opening-01\.png"/);
  assert.match(rendered, /2 assets/);
  assert.doesNotMatch(rendered, /\/Users\//);
});

test('README gallery renders every image once as a linked preview', () => {
  const assets = Array.from({ length: 3 }, (_, index) => `assets/opening-0${index + 1}.png`);
  const gallery = renderGallery(assets);
  for (const asset of assets) {
    assert.equal(gallery.match(new RegExp(`<a href="${asset}">`, 'g'))?.length, 1);
    assert.equal(gallery.match(new RegExp(`<img src="${asset}"`, 'g'))?.length, 1);
  }
  assert.equal(gallery.match(/<tr>/g)?.length, 2);
  assert.match(gallery, /<td><\/td>/);
});

test('README locale manifest has unique locale and output paths', () => {
  assert.equal(validateLocales(README_LOCALES), README_LOCALES);
});

test('README locale manifest rejects duplicate locale names', () => {
  assert.throws(() => validateLocales([
    README_LOCALES[0],
    { ...README_LOCALES[1], locale: README_LOCALES[0].locale },
  ]), /duplicate README locale/);
});

test('README locale manifest rejects duplicate output paths', () => {
  assert.throws(() => validateLocales([
    README_LOCALES[0],
    { ...README_LOCALES[1], outputPath: README_LOCALES[0].outputPath },
  ]), /duplicate README output/);
});

test('README locale manifest rejects missing required fields', () => {
  assert.throws(() => validateLocales([{ locale: 'ja' }]), /missing templatePath/);
});

test('README gallery localizes image alternative text', () => {
  const gallery = renderGallery(['assets/opening.png'], { altPrefix: '黒瀬ルナのオープニング画像' });
  assert.match(gallery, /alt="黒瀬ルナのオープニング画像 opening\.png"/);
  assert.doesNotMatch(gallery, /쿠로세 루나/);
});

test('README renderer uses locale-specific gallery text with the same hero', () => {
  const template = '<!-- hero-image: {{HERO_IMAGE}} -->\n{{IMAGE_GALLERY}}\n{{ASSET_COUNT}}\n';
  const assets = ['assets/opening.png'];
  const korean = renderReadme(template, assets[0], assets, README_LOCALES[0]);
  const japanese = renderReadme(template, assets[0], assets, README_LOCALES[1]);
  assert.equal(currentHero(korean), currentHero(japanese));
  assert.match(korean, /쿠로세 루나 오프닝 이미지/);
  assert.match(japanese, /黒瀬ルナのオープニング画像/);
});

test('README stale output detection reports only changed locales', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'current', 'README.ja.md': 'old' },
    { 'README.md': 'current', 'README.ja.md': 'new' },
  ), ['README.ja.md']);
});

test('README stale output detection can isolate the Korean output', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'old', 'README.ja.md': 'current' },
    { 'README.md': 'new', 'README.ja.md': 'current' },
  ), ['README.md']);
});

test('README stale output detection accepts synchronized locales', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'same', 'README.ja.md': 'same' },
    { 'README.md': 'same', 'README.ja.md': 'same' },
  ), []);
});

test('README templates use repository-relative language switches before the title', () => {
  for (const locale of README_LOCALES) {
    const template = readFileSync(resolve(root, locale.templatePath), 'utf8');
    const switchIndex = template.indexOf('[한국어](README.md) | [日本語](README.ja.md)');
    assert.ok(switchIndex >= 0, `${locale.templatePath} must contain the language switch`);
    assert.ok(switchIndex < template.indexOf('# Mesugaki Codex Companion'));
    assert.doesNotMatch(template.slice(switchIndex, template.indexOf('# Mesugaki Codex Companion')), /https?:|\/Users\//);
  }
});

test('README templates preserve every generator placeholder', () => {
  for (const locale of README_LOCALES) {
    const template = readFileSync(resolve(root, locale.templatePath), 'utf8');
    for (const placeholder of ['{{HERO_IMAGE}}', '{{IMAGE_GALLERY}}', '{{ASSET_COUNT}}']) {
      assert.ok(template.includes(placeholder), `${locale.templatePath} lacks ${placeholder}`);
    }
  }
});

test('generated README outputs share one hero and link to each other', () => {
  const outputs = README_LOCALES.map((locale) => (
    readFileSync(resolve(root, locale.outputPath), 'utf8')
  ));
  assert.equal(currentHero(outputs[0]), currentHero(outputs[1]));
  for (const output of outputs) {
    assert.match(output, /\[한국어\]\(README\.md\) \| \[日本語\]\(README\.ja\.md\)/);
  }
});

test('README random selection changes the current hero when alternatives exist', () => {
  const selected = selectHero({
    assets: ['assets/one.png', 'assets/two.png'],
    current: 'assets/one.png',
    requested: null,
    random: true,
  });
  assert.equal(selected, 'assets/two.png');
});

test('README explicit image selection rejects unknown assets', () => {
  assert.throws(() => selectHero({
    assets: ['assets/one.png'],
    current: null,
    requested: 'missing.png',
    random: false,
  }), /does not exist/);
});
