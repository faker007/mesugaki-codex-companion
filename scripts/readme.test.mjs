import assert from 'node:assert/strict';
import test from 'node:test';

import { currentHero, renderGallery, renderReadme, selectHero } from './generate-readme.mjs';

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
