#!/usr/bin/env node

import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetPath = resolve(
  process.env.MESUGAKI_INSTALL_DIR
    ?? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills/mesugaki-opening-visual'),
);

async function inspectTarget() {
  try {
    const stats = await lstat(targetPath);
    if (!stats.isSymbolicLink()) {
      throw new Error(`install target already exists and is not a symlink: ${targetPath}`);
    }
    const current = resolve(dirname(targetPath), await readlink(targetPath));
    if (current !== sourceRoot) {
      throw new Error(`install target points elsewhere: ${targetPath} -> ${current}`);
    }
    return 'already-linked';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

try {
  const state = await inspectTarget();
  if (state === 'missing') {
    await mkdir(dirname(targetPath), { recursive: true });
    await symlink(sourceRoot, targetPath, 'dir');
  }
  process.stdout.write(`${JSON.stringify({ ok: true, state, sourceRoot, targetPath })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    sourceRoot,
    targetPath,
  })}\n`);
  process.exitCode = 1;
}
