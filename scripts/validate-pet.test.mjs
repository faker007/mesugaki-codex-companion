import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import { PET_CONTRACT, validatePet } from './validate-pet.mjs';

async function writeManifest(root, spritesheetPath = 'spritesheet.webp') {
  await writeFile(join(root, 'pet.json'), `${JSON.stringify({
    id: 'test-pet',
    displayName: 'Test Pet',
    description: 'A deterministic validator fixture.',
    spritesheetPath,
  }, null, 2)}\n`);
}

function usedCellMarks() {
  return PET_CONTRACT.states.flatMap((state) => Array.from(
    { length: state.frames },
    (_, column) => ({
      input: {
        create: {
          width: 2,
          height: 2,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      },
      left: column * PET_CONTRACT.cellWidth + 1,
      top: state.row * PET_CONTRACT.cellHeight + 1,
    }),
  ));
}

async function writeAtlas(path, { width = PET_CONTRACT.width, height = PET_CONTRACT.height, overlays = [] } = {}) {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(overlays).webp({ lossless: true }).toFile(path);
}

test('pet validator accepts the canonical 8x9 contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-pet-valid-'));
  await mkdir(root, { recursive: true });
  await writeManifest(root);
  await writeAtlas(join(root, 'spritesheet.webp'), { overlays: usedCellMarks() });

  const result = await validatePet(root);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.cells.filter(({ used }) => used).length, 57);
  assert.equal(result.cells.filter(({ used }) => !used).length, 15);
});

test('pet validator rejects wrong dimensions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-pet-size-'));
  await writeManifest(root);
  await writeAtlas(join(root, 'spritesheet.webp'), { width: 192, height: 208 });

  const result = await validatePet(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must be 1536x1872/);
});

test('pet validator rejects pixels in an unused cell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-pet-unused-'));
  await writeManifest(root);
  const overlays = usedCellMarks();
  overlays.push({
    input: {
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    },
    left: 6 * PET_CONTRACT.cellWidth + 1,
    top: 1,
  });
  await writeAtlas(join(root, 'spritesheet.webp'), { overlays });

  const result = await validatePet(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /idle cell 6 is unused/);
});

test('pet validator rejects a spritesheet path outside the pet directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesugaki-pet-path-'));
  await writeManifest(root, '../spritesheet.webp');

  const result = await validatePet(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must stay inside/);
});
