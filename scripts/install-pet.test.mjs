import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const script = resolve(import.meta.dirname, 'install-pet.mjs');

function run(target, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: { ...process.env, MESUGAKI_PET_INSTALL_DIR: target },
    encoding: 'utf8',
  });
}

test('pet installer copies the manifest and spritesheet without silent overwrite', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'mesugaki-pet-'));
  const target = join(temporaryRoot, 'kurose-runa');

  const installed = run(target);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).state, 'installed');
  assert.deepEqual(
    JSON.parse(await readFile(join(target, 'pet.json'), 'utf8')),
    JSON.parse(await readFile(join(root, 'pet-assets/kurose-runa/pet.json'), 'utf8')),
  );

  const repeated = run(target);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).state, 'already-installed');

  await writeFile(join(target, 'pet.json'), '{"different":true}\n');
  const conflict = run(target);
  assert.equal(conflict.status, 1);
  assert.match(JSON.parse(conflict.stderr).message, /would overwrite different files/);

  const forced = run(target, '--force');
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(JSON.parse(forced.stdout).state, 'installed');
});
