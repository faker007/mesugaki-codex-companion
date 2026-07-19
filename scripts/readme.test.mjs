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

test('README locale manifest maps English to the root and preserves localized siblings', () => {
  assert.deepEqual(README_LOCALES.map(({ locale, outputPath }) => ({ locale, outputPath })), [
    { locale: 'en', outputPath: 'README.md' },
    { locale: 'ko', outputPath: 'README.ko.md' },
    { locale: 'ja', outputPath: 'README.ja.md' },
    { locale: 'zh-Hans', outputPath: 'README.zh-Hans.md' },
    { locale: 'zh-Hant', outputPath: 'README.zh-Hant.md' },
  ]);
});

test('README locale manifest exposes all five native language labels', () => {
  assert.deepEqual(README_LOCALES.map(({ languageLabel }) => languageLabel), [
    'English', '한국어', '日本語', '简体中文', '繁體中文',
  ]);
});

test('README renderer uses locale-specific gallery text with the same hero', () => {
  const template = '<!-- hero-image: {{HERO_IMAGE}} -->\n{{IMAGE_GALLERY}}\n{{ASSET_COUNT}}\n';
  const assets = ['assets/opening.png'];
  const korean = renderReadme(template, assets[0], assets, README_LOCALES[1]);
  const japanese = renderReadme(template, assets[0], assets, README_LOCALES[2]);
  const simplified = renderReadme(template, assets[0], assets, README_LOCALES[3]);
  const traditional = renderReadme(template, assets[0], assets, README_LOCALES[4]);
  assert.equal(currentHero(korean), currentHero(japanese));
  assert.equal(currentHero(japanese), currentHero(simplified));
  assert.equal(currentHero(simplified), currentHero(traditional));
  assert.match(korean, /쿠로세 루나 오프닝 이미지/);
  assert.match(japanese, /黒瀬ルナのオープニング画像/);
  assert.match(simplified, /黑濑露娜开场图片/);
  assert.match(traditional, /黑瀨露娜開場圖片/);
});

test('README stale output detection reports only changed locales', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'current', 'README.ko.md': 'current', 'README.ja.md': 'old' },
    { 'README.md': 'current', 'README.ko.md': 'current', 'README.ja.md': 'new' },
  ), ['README.ja.md']);
});

test('README stale output detection can isolate the Korean output', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'current', 'README.ko.md': 'old', 'README.ja.md': 'current' },
    { 'README.md': 'current', 'README.ko.md': 'new', 'README.ja.md': 'current' },
  ), ['README.ko.md']);
});

test('README stale output detection can isolate the English root output', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'old', 'README.ko.md': 'current', 'README.ja.md': 'current' },
    { 'README.md': 'new', 'README.ko.md': 'current', 'README.ja.md': 'current' },
  ), ['README.md']);
});

test('README stale output detection can isolate Simplified Chinese', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.zh-Hans.md': 'old', 'README.zh-Hant.md': 'same' },
    { 'README.zh-Hans.md': 'new', 'README.zh-Hant.md': 'same' },
  ), ['README.zh-Hans.md']);
});

test('README stale output detection can isolate Traditional Chinese', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.zh-Hans.md': 'same', 'README.zh-Hant.md': 'old' },
    { 'README.zh-Hans.md': 'same', 'README.zh-Hant.md': 'new' },
  ), ['README.zh-Hant.md']);
});

test('README stale output detection accepts synchronized locales', () => {
  assert.deepEqual(findStaleOutputs(
    { 'README.md': 'same', 'README.ko.md': 'same', 'README.ja.md': 'same' },
    { 'README.md': 'same', 'README.ko.md': 'same', 'README.ja.md': 'same' },
  ), []);
});

test('README templates use repository-relative language switches before the title', () => {
  for (const locale of README_LOCALES) {
    const template = readFileSync(resolve(root, locale.templatePath), 'utf8');
    const switchIndex = template.indexOf('[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md)');
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

test('README templates identify their own generated output', () => {
  for (const locale of README_LOCALES) {
    const template = readFileSync(resolve(root, locale.templatePath), 'utf8');
    const header = template.split('\n')[0];
    assert.ok(header.includes(locale.templatePath), `${locale.templatePath} source marker`);
    assert.ok(header.includes(locale.outputPath), `${locale.outputPath} output marker`);
  }
});

test('Simplified and Traditional Chinese templates are independently localized', () => {
  const simplified = readFileSync(resolve(root, 'templates/README.zh-Hans.md.tmpl'), 'utf8');
  const traditional = readFileSync(resolve(root, 'templates/README.zh-Hant.md.tmpl'), 'utf8');
  assert.notEqual(simplified, traditional);
  assert.match(simplified, /API 密钥/);
  assert.match(traditional, /API 金鑰/);
  assert.match(simplified, /队列/);
  assert.match(traditional, /佇列/);
});

test('README templates keep the same fourteen top-level sections', () => {
  for (const locale of README_LOCALES) {
    const template = readFileSync(resolve(root, locale.templatePath), 'utf8');
    assert.equal(template.match(/^## /gm)?.length, 14, `${locale.templatePath} section count`);
  }
});

test('generated README outputs share one hero and link to each other', () => {
  const outputs = README_LOCALES.map((locale) => (
    readFileSync(resolve(root, locale.outputPath), 'utf8')
  ));
  assert.equal(new Set(outputs.map(currentHero)).size, 1);
  for (const output of outputs) {
    assert.match(output, /\[English\]\(README\.md\) \| \[한국어\]\(README\.ko\.md\) \| \[日本語\]\(README\.ja\.md\) \| \[简体中文\]\(README\.zh-Hans\.md\) \| \[繁體中文\]\(README\.zh-Hant\.md\)/);
  }
});

test('generated README outputs each contain all ten gallery assets once', () => {
  for (const locale of README_LOCALES) {
    const output = readFileSync(resolve(root, locale.outputPath), 'utf8');
    const galleryLinks = output.match(/<a href="assets\/[^"]+">/g) ?? [];
    assert.equal(galleryLinks.length, 10, `${locale.outputPath} gallery link count`);
    assert.equal(new Set(galleryLinks).size, 10, `${locale.outputPath} duplicate gallery links`);
  }
});

test('generated README outputs contain no unresolved generator placeholders', () => {
  for (const locale of README_LOCALES) {
    const output = readFileSync(resolve(root, locale.outputPath), 'utf8');
    assert.doesNotMatch(output, /\{\{(?:HERO_IMAGE|IMAGE_GALLERY|ASSET_COUNT)\}\}/);
  }
});

test('generated Chinese README outputs retain localized usage headings', () => {
  const simplified = readFileSync(resolve(root, 'README.zh-Hans.md'), 'utf8');
  const traditional = readFileSync(resolve(root, 'README.zh-Hant.md'), 'utf8');
  assert.match(simplified, /^## 在 Codex 中使用♡$/m);
  assert.match(traditional, /^## 在 Codex 中使用♡$/m);
  assert.match(simplified, /简体中文/);
  assert.match(traditional, /繁體中文/);
});

test('generated README outputs keep fourteen top-level sections', () => {
  for (const locale of README_LOCALES) {
    const output = readFileSync(resolve(root, locale.outputPath), 'utf8');
    assert.equal(output.match(/^## /gm)?.length, 14, `${locale.outputPath} section count`);
  }
});

test('README galleries localize all five alternative-text variants', () => {
  const template = '<!-- hero-image: {{HERO_IMAGE}} -->\n{{IMAGE_GALLERY}}\n{{ASSET_COUNT}}\n';
  const assets = ['assets/opening.png'];
  const rendered = README_LOCALES.map((locale) => renderReadme(template, assets[0], assets, locale));
  assert.match(rendered[0], /Kurose Runa opening visual opening\.png/);
  assert.match(rendered[1], /쿠로세 루나 오프닝 이미지 opening\.png/);
  assert.match(rendered[2], /黒瀬ルナのオープニング画像 opening\.png/);
  assert.match(rendered[3], /黑濑露娜开场图片 opening\.png/);
  assert.match(rendered[4], /黑瀨露娜開場圖片 opening\.png/);
});

test('README generated galleries contain each configured asset once per locale', () => {
  const assets = ['assets/one.png', 'assets/two.png'];
  for (const locale of README_LOCALES) {
    const gallery = renderGallery(assets, { altPrefix: locale.galleryAlt });
    for (const asset of assets) {
      assert.equal(gallery.match(new RegExp(`<a href="${asset}">`, 'g'))?.length, 1);
    }
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
