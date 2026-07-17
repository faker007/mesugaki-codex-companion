import assert from 'node:assert/strict';
import test from 'node:test';

import { currentHero, renderReadme, selectHero } from './generate-readme.mjs';

test('README rendering keeps a repository-relative hero path', () => {
  const rendered = renderReadme(
    '<!-- hero-image: {{HERO_IMAGE}} -->\n<img src="{{HERO_IMAGE}}" />\n',
    'assets/kurose-runa-opening-01.png',
  );
  assert.equal(currentHero(rendered), 'assets/kurose-runa-opening-01.png');
  assert.match(rendered, /src="assets\/kurose-runa-opening-01\.png"/);
  assert.doesNotMatch(rendered, /\/Users\//);
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
