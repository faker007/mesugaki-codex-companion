#!/usr/bin/env node

import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceDir = resolve(root, 'pet-assets/kurose-runa');
const targetDir = resolve(
  process.env.MESUGAKI_PET_INSTALL_DIR
    ?? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'pets/kurose-runa'),
);
const files = ['pet.json', 'spritesheet.webp'];
const force = process.argv.includes('--force');

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function matches(source, target) {
  if (!await exists(target)) return false;
  const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
  return sourceBytes.equals(targetBytes);
}

try {
  const sourcePaths = files.map((file) => resolve(sourceDir, file));
  await Promise.all(sourcePaths.map((path) => readFile(path)));

  const states = await Promise.all(files.map(async (file) => ({
    file,
    exists: await exists(resolve(targetDir, file)),
    matches: await matches(resolve(sourceDir, file), resolve(targetDir, file)),
  })));
  const conflicts = states.filter((state) => state.exists && !state.matches);
  if (conflicts.length && !force) {
    throw new Error(`pet install would overwrite different files: ${conflicts.map(({ file }) => file).join(', ')}; rerun with --force only after reviewing them`);
  }

  await mkdir(targetDir, { recursive: true });
  await Promise.all(files.map((file) => copyFile(resolve(sourceDir, file), resolve(targetDir, file))));
  const state = states.every(({ matches: identical }) => identical) ? 'already-installed' : 'installed';
  process.stdout.write(`${JSON.stringify({ ok: true, state, sourceDir, targetDir, files })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    sourceDir,
    targetDir,
  })}\n`);
  process.exitCode = 1;
}
