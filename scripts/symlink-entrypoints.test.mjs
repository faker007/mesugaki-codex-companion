import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('CLI entrypoints execute through a linked skill directory', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'mesugaki-skill-link-'));
  const linkedRoot = join(temporaryRoot, 'mesugaki-opening-visual');
  try {
    await symlink(repositoryRoot, linkedRoot, 'dir');

    const opening = await execFileAsync(
      process.execPath,
      [join(linkedRoot, 'scripts/speak-opening.mjs'), '--help'],
      { encoding: 'utf8' },
    );
    assert.match(opening.stdout, /Usage:/);

    const response = await execFileAsync(
      process.execPath,
      [join(linkedRoot, 'scripts/speak-response.mjs'), '--help'],
      { encoding: 'utf8' },
    );
    assert.match(response.stdout, /Usage:/);

    const queue = await execFileAsync(
      process.execPath,
      [join(linkedRoot, 'scripts/response-queue.mjs')],
      { encoding: 'utf8' },
    );
    assert.match(queue.stdout, /enqueue through speak-response/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
