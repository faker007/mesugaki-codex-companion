#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

export const PET_CONTRACT = Object.freeze({
  width: 1536,
  height: 1872,
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  maxBytes: 20 * 1024 * 1024,
  states: Object.freeze([
    Object.freeze({ name: 'idle', row: 0, frames: 6 }),
    Object.freeze({ name: 'running-right', row: 1, frames: 8 }),
    Object.freeze({ name: 'running-left', row: 2, frames: 8 }),
    Object.freeze({ name: 'waving', row: 3, frames: 4 }),
    Object.freeze({ name: 'jumping', row: 4, frames: 5 }),
    Object.freeze({ name: 'failed', row: 5, frames: 8 }),
    Object.freeze({ name: 'waiting', row: 6, frames: 6 }),
    Object.freeze({ name: 'running', row: 7, frames: 6 }),
    Object.freeze({ name: 'review', row: 8, frames: 6 }),
  ]),
});

function isInside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function readManifest(path, errors) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    errors.push(`pet.json is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function inspectManifest(manifest, errors) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return;
  for (const field of ['id', 'displayName', 'description', 'spritesheetPath']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
      errors.push(`pet.json field ${field} must be a non-empty string`);
    }
  }
}

function cellAlphaCount(pixels, channels, row, column) {
  let count = 0;
  const startX = column * PET_CONTRACT.cellWidth;
  const startY = row * PET_CONTRACT.cellHeight;
  for (let y = startY; y < startY + PET_CONTRACT.cellHeight; y += 1) {
    for (let x = startX; x < startX + PET_CONTRACT.cellWidth; x += 1) {
      if (pixels[(y * PET_CONTRACT.width + x) * channels + 3] !== 0) count += 1;
    }
  }
  return count;
}

export async function validatePet(petDir) {
  const root = resolve(petDir);
  const manifestPath = resolve(root, 'pet.json');
  const errors = [];
  const warnings = [];
  const manifest = await readManifest(manifestPath, errors);
  inspectManifest(manifest, errors);
  if (!manifest?.spritesheetPath || typeof manifest.spritesheetPath !== 'string') {
    return { ok: false, petDir: root, errors, warnings };
  }

  const spritesheetPath = resolve(root, manifest.spritesheetPath);
  if (!isInside(root, spritesheetPath)) {
    errors.push('spritesheetPath must stay inside the pet directory');
    return { ok: false, petDir: root, manifestPath, spritesheetPath, errors, warnings };
  }

  let fileStats;
  let metadata;
  let raw;
  try {
    [fileStats, metadata, raw] = await Promise.all([
      stat(spritesheetPath),
      sharp(spritesheetPath).metadata(),
      sharp(spritesheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
  } catch (error) {
    errors.push(`spritesheet is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, petDir: root, manifestPath, spritesheetPath, errors, warnings };
  }

  if (!['png', 'webp'].includes(metadata.format)) {
    errors.push(`spritesheet format must be PNG or WebP; got ${metadata.format ?? 'unknown'}`);
  }
  if (metadata.width !== PET_CONTRACT.width || metadata.height !== PET_CONTRACT.height) {
    errors.push(`spritesheet must be ${PET_CONTRACT.width}x${PET_CONTRACT.height}; got ${metadata.width}x${metadata.height}`);
  }
  if (!metadata.hasAlpha) errors.push('spritesheet must have an alpha channel');
  if (fileStats.size > PET_CONTRACT.maxBytes) {
    errors.push(`spritesheet must not exceed ${PET_CONTRACT.maxBytes} bytes; got ${fileStats.size}`);
  }

  const cells = [];
  if (metadata.width === PET_CONTRACT.width && metadata.height === PET_CONTRACT.height) {
    for (const state of PET_CONTRACT.states) {
      for (let column = 0; column < PET_CONTRACT.columns; column += 1) {
        const used = column < state.frames;
        const nontransparentPixels = cellAlphaCount(raw.data, raw.info.channels, state.row, column);
        cells.push({ state: state.name, row: state.row, column, used, nontransparentPixels });
        if (used && nontransparentPixels === 0) {
          errors.push(`${state.name} cell ${column} is used but fully transparent`);
        }
        if (!used && nontransparentPixels !== 0) {
          errors.push(`${state.name} cell ${column} is unused but has ${nontransparentPixels} nontransparent pixels`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    petDir: root,
    manifestPath,
    spritesheetPath,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    bytes: fileStats.size,
    errors,
    warnings,
    cells,
  };
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const petDir = process.argv[2]
    ?? resolve(fileURLToPath(new URL('..', import.meta.url)), 'pet-assets/kurose-runa');
  const result = await validatePet(petDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
